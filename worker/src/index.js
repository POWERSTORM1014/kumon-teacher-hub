// worker/src/index.js — 구몬 학습 허브 API를 Cloudflare Workers로 이전한 버전.
// 로컬 server.js(Express + 파일시스템)와 동일한 역할을 KV(필기 데이터)와
// R2(이미지/오디오 첨부파일)로 구현한다. GitHub Pages는 정적 호스팅이라 이 API들을
// 직접 처리할 수 없으므로, 프론트엔드가 이 Worker를 백엔드로 바라보게 된다
// (프론트엔드 연결은 이번 단계에서는 하지 않음).
//
// 키 규칙(로컬 파일명 규칙과 최대한 대응):
//   data/layers/<bookId>__<page>.json      → KV key "layer:<bookId>__<page>"
//   data/page-order/<bookId>.json          → KV key "pageorder:<bookId>"
// 하나의 KV 네임스페이스를 layers/page-order가 함께 쓰므로, 로컬의 디렉토리 분리
// 대신 키 접두사로 같은 구분을 유지한다.
//
// 라우트 경로 모양은 로컬 server.js와 반드시 동일해야 한다 — annotation-engine.js가
// 두 백엔드 중 어디를 향하든 base URL만 바꿔서 같은 fetch 호출을 그대로 재사용하기
// 때문이다(/api/layers/:pageId 하나의 경로 조각, bookId__page 형태로 이미 합쳐져서 옴).

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const MIME_EXT = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
  'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/wav': '.wav', 'audio/ogg': '.ogg', 'audio/webm': '.webm',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov'
};

// bookId/page는 URL 경로 조각 및 KV 키로도 쓰이므로 형식을 엄격히 제한한다
// (로컬 server.js의 isSafeKey와 동일한 정책).
function isSafeKey(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id) && id.length <= 200;
}

// 폴더 name/책 title은 사용자가 자유롭게 짓는 표시용 텍스트라 isSafeKey로 검증하지
// 않는다(한글 등 자유 텍스트 허용) — KV 키가 아니라 값으로만 저장되기 때문.
function isValidName(name) {
  return typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 100;
}
function genFolderId() { return 'folder_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12); }
function genBookId() { return 'personal_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12); }

// device는 사용자가 자유롭게 붙이는 기기 이름(한글 등 자유 텍스트)이라 isSafeKey로
// 검증하지 않는다 — KV 키가 아니라 값으로만 저장되므로 URL/키 안전성 문제가 없다.
function isValidDevice(d) {
  return typeof d === 'string' && d.length > 0 && d.length <= 100;
}

const LOCK_TTL_MS = 5 * 60 * 1000; // 5분 — 이 시간이 지난 잠금은 만료된 것으로 간주
const LOCK_TTL_SEC = LOCK_TTL_MS / 1000; // KV expirationTtl은 초 단위(최소 60초)

function safeExt(filename, mime) {
  const m = /\.([a-zA-Z0-9]{1,5})$/.exec(filename || '');
  if (m) return '.' + m[1].toLowerCase();
  return MIME_EXT[mime] || '.bin';
}

// "나의 폴더" 폴더/책 단건 라우트(/api/workspace/folders/:id, /api/workspace/books/:id)만
// PUT(이름변경)·DELETE(삭제)를 실제로 쓴다. 이 둘을 뺀 모든 기존 라우트(/api/layers,
// /api/page-order, /api/lock, /api/upload, /api/ping과 workspace의 목록/생성
// 라우트까지 포함)는 GET/POST만 쓰므로, parts를 넘기지 않거나 이 두 라우트가
// 아니면 예전과 완전히 같은 'GET, POST, OPTIONS'를 돌려준다 — 아래 판정에서
// 걸리지 않는 모든 호출부는 이번 수정으로 응답이 1바이트도 달라지지 않는다.
function isWorkspaceItemRoute(parts) {
  return !!parts && parts.length === 4 && parts[0] === 'api' && parts[1] === 'workspace' && (parts[2] === 'folders' || parts[2] === 'books');
}
function corsHeaders(origin, parts) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': isWorkspaceItemRoute(parts) ? 'GET, POST, PUT, DELETE, OPTIONS' : 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
  });
}

// "나의 폴더" 폴더/책 배열은 KV 키 하나에 배열 전체를 담는다(로컬 server.js의
// data/workspace/*.json과 동일한 모델) — 부분 갱신 API가 없으니 읽고 통째로 다시 쓴다.
async function readWorkspaceArray(env, kvKey) {
  const raw = await env.KUMON_LAYERS.get(kvKey);
  if (!raw) return [];
  try { const j = JSON.parse(raw); return Array.isArray(j) ? j : []; } catch (e) { return []; }
}
async function writeWorkspaceArray(env, kvKey, arr) {
  await env.KUMON_LAYERS.put(kvKey, JSON.stringify(arr));
}

// KV/R2 둘 다 list()가 최대 1000개까지만 한 번에 돌려주므로 cursor로 끝까지 돈다 —
// 이 앱 규모(개인 필기책 한 권당 페이지는 MAX_INSERTED_PAGES=100장 이하)에서는
// 사실상 한 번이면 끝나지만, 정확성을 위해 페이지네이션을 생략하지 않는다.
async function listAllKeys(kv, prefix) {
  const keys = [];
  let cursor;
  for (;;) {
    const res = await kv.list({ prefix, cursor });
    keys.push(...res.keys.map(k => k.name));
    if (res.list_complete || !res.cursor) break;
    cursor = res.cursor;
  }
  return keys;
}
async function listAllR2Keys(bucket, prefix) {
  const keys = [];
  let cursor;
  for (;;) {
    const res = await bucket.list({ prefix, cursor });
    keys.push(...res.objects.map(o => o.key));
    if (res.truncated === false || !res.cursor) break;
    cursor = res.cursor;
  }
  return keys;
}

// 폴더·책 삭제(연쇄 삭제) 시 정리하는 범위 — 여기 하나로 고정해서 folder/book 삭제
// 라우트 둘 다 같은 함수를 부른다: layer:<bookId>__* 전부, pageorder:<bookId>,
// lock:<bookId>:* 전부(KV), user-pages/<bookId>/ 전체(R2). 이 중 하나라도 빠지면
// "삭제했는데 KV/R2에 흔적이 남는" 문제가 생기므로, 새로 저장 위치를 추가할 때는
// 반드시 이 함수도 같이 고칠 것(로컬 server.js의 cascadeDeleteBookData와 대칭 유지).
async function cascadeDeleteBookData(env, bookId) {
  const layerKeys = await listAllKeys(env.KUMON_LAYERS, 'layer:' + bookId + '__');
  const lockKeys = await listAllKeys(env.KUMON_LAYERS, 'lock:' + bookId + ':');
  await Promise.all([
    env.KUMON_LAYERS.delete('pageorder:' + bookId),
    ...layerKeys.map(k => env.KUMON_LAYERS.delete(k)),
    ...lockKeys.map(k => env.KUMON_LAYERS.delete(k))
  ]);
  const r2Keys = await listAllR2Keys(env.LESSON_NOTES, 'user-pages/' + bookId + '/');
  await Promise.all(r2Keys.map(k => env.LESSON_NOTES.delete(k)));
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean); // 예: ['api','layers','test-book','1']

    // OPTIONS는 실제 라우팅보다 먼저 응답하므로, workspace 단건 라우트(PUT/DELETE를
    // 실제로 쓰는 곳)인지는 parts만 보고 여기서 직접 판정한다 — 라우팅 스위치 안의
    // 개별 if문에 기대지 않는다(그 아래 로직은 전혀 안 건드림).
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, parts) });
    }

    try {
      // GET /api/ping
      if (request.method === 'GET' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'ping') {
        return json({ ok: true, time: new Date().toISOString() }, 200, origin);
      }

      // /api/layers/:pageId (pageId = bookId__page, 클라이언트가 이미 encodeURIComponent로 합쳐서 보냄)
      if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'layers') {
        const pageId = decodeURIComponent(parts[2]);
        if (!isSafeKey(pageId)) return json({ error: 'invalid pageId' }, 400, origin);
        const kvKey = 'layer:' + pageId;

        if (request.method === 'GET') {
          const raw = await env.KUMON_LAYERS.get(kvKey);
          if (!raw) return json({ found: false }, 200, origin);
          return json({ found: true, ...JSON.parse(raw) }, 200, origin);
        }

        if (request.method === 'POST') {
          const body = await request.json().catch(() => null);
          const { layers, strokes, device, deviceId, deviceType } = body || {};
          if (!Array.isArray(layers) || typeof strokes !== 'object' || strokes === null) {
            return json({ error: 'invalid body (layers[], strokes{} required)' }, 400, origin);
          }
          const savedAt = new Date().toISOString();
          const payload = {
            pageId, layers, strokes, savedAt,
            device: device || 'unknown', deviceId: deviceId || null, deviceType: deviceType || null
          };
          await env.KUMON_LAYERS.put(kvKey, JSON.stringify(payload));
          return json({ ok: true, savedAt }, 200, origin);
        }
      }

      // /api/page-order/:bookId
      if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'page-order') {
        const bookId = parts[2];
        if (!isSafeKey(bookId)) return json({ error: 'invalid bookId' }, 400, origin);
        const kvKey = 'pageorder:' + bookId;

        if (request.method === 'GET') {
          const raw = await env.KUMON_LAYERS.get(kvKey);
          if (!raw) return json({ found: false }, 200, origin);
          return json({ found: true, ...JSON.parse(raw) }, 200, origin);
        }

        if (request.method === 'POST') {
          const body = await request.json().catch(() => null);
          const { order } = body || {};
          if (!Array.isArray(order)) return json({ error: 'invalid body (order[] required)' }, 400, origin);
          const savedAt = new Date().toISOString();
          await env.KUMON_LAYERS.put(kvKey, JSON.stringify({ bookId, order, savedAt }));
          return json({ ok: true, savedAt }, 200, origin);
        }
      }

      // POST /api/upload — 이미지/오디오·영상 dataURL을 R2(kumon-lesson-notes)에 저장
      //
      // dest:'workspace-page'는 "나의 폴더" 사진 페이지 전용 예외 경로다 — 기본 images/
      // 대신 user-pages/<bookId>/<localPageId><ext>에 저장한다. bookId별로 접두어를
      // 나누는 이유는 책/폴더 삭제 시 이 접두어 하나로 R2.list()해서 통째로 지울 수
      // 있어야 하기 때문(cascadeDeleteBookData 참고) — images/처럼 섞여 있으면 불가능하다.
      if (request.method === 'POST' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'upload') {
        const body = await request.json().catch(() => null);
        const { kind, pageId, dataUrl, filename, dest, bookId: wsBookId, localPageId } = body || {};
        if (kind !== 'image' && kind !== 'audio') return json({ error: 'invalid kind' }, 400, origin);
        const m = /^data:([^;,]+)(?:;[^,]*)?,(.+)$/.exec(dataUrl || '');
        if (!m) return json({ error: 'invalid dataUrl' }, 400, origin);

        let bytes;
        try {
          const binary = atob(m[2]);
          bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        } catch (e) {
          return json({ error: 'invalid base64' }, 400, origin);
        }
        if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) return json({ error: 'file too large' }, 413, origin);
        const ext = safeExt(filename, m[1]);

        if (dest === 'workspace-page') {
          if (kind !== 'image') return json({ error: 'workspace-page only supports image' }, 400, origin);
          if (!isSafeKey(wsBookId) || !isSafeKey(localPageId)) return json({ error: 'invalid bookId/localPageId' }, 400, origin);
          const key = `user-pages/${wsBookId}/${localPageId}${ext}`;
          await env.LESSON_NOTES.put(key, bytes, { httpMetadata: { contentType: m[1] } });
          return json({ ok: true, path: env.LESSON_NOTES_PUBLIC_URL + '/' + key }, 200, origin);
        }

        if (!isSafeKey(pageId)) return json({ error: 'invalid pageId' }, 400, origin);
        const subdir = kind === 'image' ? 'images' : 'audio';
        const key = `${subdir}/${pageId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
        await env.LESSON_NOTES.put(key, bytes, { httpMetadata: { contentType: m[1] } });
        const publicUrl = env.LESSON_NOTES_PUBLIC_URL + '/' + key;
        return json({ ok: true, path: publicUrl }, 200, origin);
      }

      // ══ "나의 폴더"(워크스페이스) — 폴더/책 목록. KV workspace:folders / workspace:books
      // 키 하나씩에 배열 전체를 저장한다(부분 갱신 없음 — 두 기기가 동시에 만들면
      // 나중에 쓴 쪽이 앞선 쪽을 덮어쓸 수 있는 게 알려진 한계, OPERATIONS.md 참고).
      // 책의 실제 페이지 내용(필기/순서)은 이 배열에 없다 — book.id가 곧 bookId이고
      // page-order/layer 키를 기존 방식 그대로 따른다.
      if (parts.length === 2 && parts[0] === 'api' && parts[1] === 'workspace') return json({ error: 'not found' }, 404, origin);

      if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'workspace' && parts[2] === 'folders') {
        if (request.method === 'GET') {
          return json({ folders: await readWorkspaceArray(env, 'workspace:folders') }, 200, origin);
        }
        if (request.method === 'POST') {
          const body = await request.json().catch(() => null);
          const name = body && body.name;
          if (!isValidName(name)) return json({ error: 'invalid name' }, 400, origin);
          const folders = await readWorkspaceArray(env, 'workspace:folders');
          const folder = { id: genFolderId(), name: name.trim(), createdAt: new Date().toISOString() };
          folders.push(folder);
          await writeWorkspaceArray(env, 'workspace:folders', folders);
          return json({ ok: true, folder }, 200, origin);
        }
      }

      if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'workspace' && parts[2] === 'folders') {
        const folderId = parts[3];
        if (!isSafeKey(folderId)) return json({ error: 'invalid folderId' }, 400, origin);

        if (request.method === 'PUT') {
          const body = await request.json().catch(() => null);
          const name = body && body.name;
          if (!isValidName(name)) return json({ error: 'invalid name' }, 400, origin);
          const folders = await readWorkspaceArray(env, 'workspace:folders');
          const folder = folders.find(f => f.id === folderId);
          if (!folder) return json({ error: 'not found' }, 404, origin);
          folder.name = name.trim();
          await writeWorkspaceArray(env, 'workspace:folders', folders);
          return json({ ok: true, folder }, 200, origin);
        }

        if (request.method === 'DELETE') {
          const folders = await readWorkspaceArray(env, 'workspace:folders');
          if (!folders.some(f => f.id === folderId)) return json({ error: 'not found' }, 404, origin);
          const books = await readWorkspaceArray(env, 'workspace:books');
          const toDelete = books.filter(b => b.folderId === folderId);
          for (const b of toDelete) await cascadeDeleteBookData(env, b.id);
          await writeWorkspaceArray(env, 'workspace:books', books.filter(b => b.folderId !== folderId));
          await writeWorkspaceArray(env, 'workspace:folders', folders.filter(f => f.id !== folderId));
          return json({ ok: true, deletedBooks: toDelete.length }, 200, origin);
        }
      }

      if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'workspace' && parts[2] === 'books') {
        if (request.method === 'GET') {
          const folderId = url.searchParams.get('folderId');
          const books = await readWorkspaceArray(env, 'workspace:books');
          return json({ books: folderId ? books.filter(b => b.folderId === folderId) : books }, 200, origin);
        }
        if (request.method === 'POST') {
          const body = await request.json().catch(() => null);
          const { folderId, title } = body || {};
          if (!isSafeKey(folderId)) return json({ error: 'invalid folderId' }, 400, origin);
          if (!isValidName(title)) return json({ error: 'invalid title' }, 400, origin);
          const folders = await readWorkspaceArray(env, 'workspace:folders');
          if (!folders.some(f => f.id === folderId)) return json({ error: 'folder not found' }, 404, origin);
          const books = await readWorkspaceArray(env, 'workspace:books');
          const book = { id: genBookId(), folderId, title: title.trim(), createdAt: new Date().toISOString() };
          books.push(book);
          await writeWorkspaceArray(env, 'workspace:books', books);
          // 페이지 0개로 page-order를 미리 만들어둔다 — book 생성과 page-order 생성이
          // 항상 같이 맞아떨어지게 해서(찾아보면 found:false와 동치이긴 하지만)
          // 뷰어가 첫 진입 시 바로 빈 책으로 열리게 한다.
          await env.KUMON_LAYERS.put('pageorder:' + book.id, JSON.stringify({ bookId: book.id, order: [], savedAt: new Date().toISOString() }));
          return json({ ok: true, book }, 200, origin);
        }
      }

      if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'workspace' && parts[2] === 'books') {
        const bookId = parts[3];
        if (!isSafeKey(bookId)) return json({ error: 'invalid bookId' }, 400, origin);

        if (request.method === 'PUT') {
          const body = await request.json().catch(() => null);
          const title = body && body.title;
          if (!isValidName(title)) return json({ error: 'invalid title' }, 400, origin);
          const books = await readWorkspaceArray(env, 'workspace:books');
          const book = books.find(b => b.id === bookId);
          if (!book) return json({ error: 'not found' }, 404, origin);
          book.title = title.trim();
          await writeWorkspaceArray(env, 'workspace:books', books);
          return json({ ok: true, book }, 200, origin);
        }

        if (request.method === 'DELETE') {
          const books = await readWorkspaceArray(env, 'workspace:books');
          if (!books.some(b => b.id === bookId)) return json({ error: 'not found' }, 404, origin);
          await cascadeDeleteBookData(env, bookId);
          await writeWorkspaceArray(env, 'workspace:books', books.filter(b => b.id !== bookId));
          return json({ ok: true }, 200, origin);
        }
      }

      // /api/lock/:bookId/:page/heartbeat — 먼저 검사해야 함(5조각, 아래 4조각 라우트보다 길다)
      if (request.method === 'POST' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'lock' && parts[4] === 'heartbeat') {
        const bookId = parts[2], page = decodeURIComponent(parts[3]);
        if (!isSafeKey(bookId) || !isSafeKey(page)) return json({ error: 'invalid bookId/page' }, 400, origin);
        const body = await request.json().catch(() => null);
        const device = body && body.device;
        if (!isValidDevice(device)) return json({ error: 'invalid device' }, 400, origin);

        const lockKey = 'lock:' + bookId + ':' + page;
        const raw = await env.KUMON_LAYERS.get(lockKey);
        const now = Date.now();
        const existing = raw ? JSON.parse(raw) : null;
        const expired = !existing || (now - existing.timestamp > LOCK_TTL_MS);

        if (expired || existing.device === device) {
          const payload = { device, timestamp: now };
          // KV 자체 TTL도 걸어둔다 — 애플리케이션 로직(now - timestamp > LOCK_TTL_MS)이
          // 이미 5분 지난 잠금을 "만료"로 취급하긴 하지만, 그것만으로는 KV에서 키 자체가
          // 지워지지 않는다(탭이 비정상 종료돼 release가 한 번도 안 온 lock: 키가 영원히
          // 쌓임). expirationTtl로 KV가 알아서 정리하게 해서 죽은 잠금 키가 누적되지 않게 한다.
          await env.KUMON_LAYERS.put(lockKey, JSON.stringify(payload), { expirationTtl: LOCK_TTL_SEC });
          return json({ ok: true, device, timestamp: now }, 200, origin);
        }
        return json({ locked: true, device: existing.device, timestamp: existing.timestamp }, 409, origin);
      }

      // /api/lock/:bookId/:page — 획득(POST, body.release=true면 해제 — sendBeacon은 POST만
      // 가능하므로 언로드 시점 해제도 이 라우트를 함께 쓴다) / 해제(DELETE) / 조회(GET)
      if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'lock') {
        const bookId = parts[2], page = decodeURIComponent(parts[3]);
        if (!isSafeKey(bookId) || !isSafeKey(page)) return json({ error: 'invalid bookId/page' }, 400, origin);
        const lockKey = 'lock:' + bookId + ':' + page;

        if (request.method === 'GET') {
          const raw = await env.KUMON_LAYERS.get(lockKey);
          const existing = raw ? JSON.parse(raw) : null;
          if (!existing || (Date.now() - existing.timestamp > LOCK_TTL_MS)) return json({ locked: false }, 200, origin);
          return json({ locked: true, device: existing.device, timestamp: existing.timestamp }, 200, origin);
        }

        if (request.method === 'DELETE' || request.method === 'POST') {
          const body = await request.json().catch(() => null);
          const device = body && body.device;
          if (!isValidDevice(device)) return json({ error: 'invalid device' }, 400, origin);

          // sendBeacon으로 온 해제 요청(POST + release:true) 또는 명시적 DELETE — 자기 소유일
          // 때만 실제로 지운다. 소유자가 다르거나 이미 없으면 그냥 성공 처리(해제는 멱등).
          if (request.method === 'DELETE' || body.release === true) {
            const raw = await env.KUMON_LAYERS.get(lockKey);
            const existing = raw ? JSON.parse(raw) : null;
            if (existing && existing.device === device) {
              await env.KUMON_LAYERS.delete(lockKey);
              return json({ ok: true, released: true }, 200, origin);
            }
            return json({ ok: true, released: false }, 200, origin);
          }

          // 일반 획득
          const raw = await env.KUMON_LAYERS.get(lockKey);
          const now = Date.now();
          const existing = raw ? JSON.parse(raw) : null;
          const expired = !existing || (now - existing.timestamp > LOCK_TTL_MS);
          const mine = existing && existing.device === device;
          const force = body.force === true;

          if (expired || mine || force) {
            const payload = { device, timestamp: now };
            await env.KUMON_LAYERS.put(lockKey, JSON.stringify(payload), { expirationTtl: LOCK_TTL_SEC });
            return json({ ok: true, device, timestamp: now }, 200, origin);
          }
          return json({ locked: true, device: existing.device, timestamp: existing.timestamp }, 409, origin);
        }
      }

      return json({ error: 'not found' }, 404, origin);
    } catch (e) {
      return json({ error: 'internal error', message: String(e && e.message || e) }, 500, origin);
    }
  }
};
