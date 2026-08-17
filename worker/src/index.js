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

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean); // 예: ['api','layers','test-book','1']

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
      if (request.method === 'POST' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'upload') {
        const body = await request.json().catch(() => null);
        const { kind, pageId, dataUrl, filename } = body || {};
        if (kind !== 'image' && kind !== 'audio') return json({ error: 'invalid kind' }, 400, origin);
        if (!isSafeKey(pageId)) return json({ error: 'invalid pageId' }, 400, origin);
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

        const subdir = kind === 'image' ? 'images' : 'audio';
        const ext = safeExt(filename, m[1]);
        const key = `${subdir}/${pageId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
        await env.LESSON_NOTES.put(key, bytes, { httpMetadata: { contentType: m[1] } });
        const publicUrl = env.LESSON_NOTES_PUBLIC_URL + '/' + key;
        return json({ ok: true, path: publicUrl }, 200, origin);
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
