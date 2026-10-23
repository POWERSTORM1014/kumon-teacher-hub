// functions/api/[[path]].js — worker/src/index.js를 Cloudflare Pages Functions로 포팅한 버전.
// *.pages.dev에서 프론트엔드와 같은 출처(same-origin)로 /api/*를 서빙하기 위함 —
// Cloudflare Access가 R2(r2.dev)는 직접 보호 못 하고 Worker/Pages Functions만 보호
// 가능하다는 검증 결과(kumon-access-r2-worker-protection-validated 메모리)에 따라,
// 같은 출처로 묶으면 크로스오리진 CORS/credentials 문제 자체가 사라진다.
//
// 라우팅 로직은 worker/src/index.js와 100% 동일하게 유지한다(둘 다 같은 요청 모양을
// 처리해야 annotation-engine.js가 어느 백엔드를 향하든 그대로 재사용됨). 유일한 차이:
// 업로드 응답의 LESSON_NOTES 경로를 공개 r2.dev 절대 URL 대신 /files/notes/ 상대경로로
// 돌려준다 — 이 경로도 Access 보호 아래 있는 R2 프록시(functions/files/[[path]].js)를
// 거치게 하기 위함. worker/src/index.js(기존 운영 Worker, GitHub Pages가 계속 사용)는
// 그대로 둔다 — 이 파일을 고쳐도 운영에는 전혀 영향 없음.

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const MIME_EXT = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
  'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/wav': '.wav', 'audio/ogg': '.ogg', 'audio/webm': '.webm',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov'
};

function isSafeKey(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id) && id.length <= 200;
}
function isValidName(name) {
  return typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 100;
}
function genFolderId() { return 'folder_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12); }
function genBookId() { return 'personal_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12); }
function isValidDevice(d) {
  return typeof d === 'string' && d.length > 0 && d.length <= 100;
}

const LOCK_TTL_MS = 5 * 60 * 1000;
const LOCK_TTL_SEC = LOCK_TTL_MS / 1000;

function safeExt(filename, mime) {
  const m = /\.([a-zA-Z0-9]{1,5})$/.exec(filename || '');
  if (m) return '.' + m[1].toLowerCase();
  return MIME_EXT[mime] || '.bin';
}

function isWorkspaceItemRoute(parts) {
  return !!parts && parts.length === 4 && parts[0] === 'api' && parts[1] === 'workspace' && (parts[2] === 'folders' || parts[2] === 'books');
}
function isCaptureProgressRoute(parts) {
  return progressKvKey(parts) !== null;
}
function progressKvKey(parts) {
  if (!parts || parts.length !== 2 || parts[0] !== 'api') return null;
  if (parts[1] === 'capture-progress') return 'capture-progress:latest';
  if (parts[1] === 'answer-progress') return 'answer-progress:latest';
  if (parts[1] === 'answer-pdf-progress') return 'answer-pdf-progress:latest';
  return null;
}
function corsHeaders(origin, parts) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': isWorkspaceItemRoute(parts) ? 'GET, POST, PUT, DELETE, OPTIONS' : 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': isCaptureProgressRoute(parts) ? 'Content-Type, X-Capture-Passphrase' : 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

async function passphraseMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string' || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected))
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
  });
}

async function readWorkspaceArray(env, kvKey) {
  const raw = await env.KUMON_LAYERS.get(kvKey);
  if (!raw) return [];
  try { const j = JSON.parse(raw); return Array.isArray(j) ? j : []; } catch (e) { return []; }
}
async function writeWorkspaceArray(env, kvKey, arr) {
  await env.KUMON_LAYERS.put(kvKey, JSON.stringify(arr));
}

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

export async function onRequest(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin') || '*';
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin, parts) });
  }

  try {
    if (request.method === 'GET' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'ping') {
      return json({ ok: true, time: new Date().toISOString() }, 200, origin);
    }

    if (isCaptureProgressRoute(parts)) {
      if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, origin);
      if (!env.CAPTURE_PASSPHRASE) return json({ error: 'passphrase not configured' }, 503, origin);
      if (!(await passphraseMatches(request.headers.get('X-Capture-Passphrase'), env.CAPTURE_PASSPHRASE))) {
        return json({ error: 'unauthorized' }, 401, origin);
      }
      const raw = await env.KUMON_LAYERS.get(progressKvKey(parts));
      if (!raw) return json({ found: false }, 200, origin);
      return new Response(raw, {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(origin, parts) }
      });
    }

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

    if (parts.length === 2 && parts[0] === 'api' && parts[1] === 'image-books') {
      if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, origin);
      const raw = await env.KUMON_LAYERS.get('imagebook:_index');
      const ids = raw ? JSON.parse(raw) : [];
      const books = (await Promise.all(ids.map(async id => {
        const b = await env.KUMON_LAYERS.get('imagebook:' + id);
        return b ? JSON.parse(b) : null;
      }))).filter(Boolean);
      return json({ books }, 200, origin);
    }
    if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'image-books') {
      if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, origin);
      const bookId = parts[2];
      if (!isSafeKey(bookId)) return json({ error: 'invalid bookId' }, 400, origin);
      const raw = await env.KUMON_LAYERS.get('imagebook:' + bookId);
      if (!raw) return json({ found: false }, 200, origin);
      return json({ found: true, ...JSON.parse(raw) }, 200, origin);
    }

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
        return json({ ok: true, path: '/files/notes/' + key }, 200, origin);
      }

      if (!isSafeKey(pageId)) return json({ error: 'invalid pageId' }, 400, origin);
      const subdir = kind === 'image' ? 'images' : 'audio';
      const key = `${subdir}/${pageId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
      await env.LESSON_NOTES.put(key, bytes, { httpMetadata: { contentType: m[1] } });
      return json({ ok: true, path: '/files/notes/' + key }, 200, origin);
    }

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
        await env.KUMON_LAYERS.put(lockKey, JSON.stringify(payload), { expirationTtl: LOCK_TTL_SEC });
        return json({ ok: true, device, timestamp: now }, 200, origin);
      }
      return json({ locked: true, device: existing.device, timestamp: existing.timestamp }, 409, origin);
    }

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

        if (request.method === 'DELETE' || body.release === true) {
          const raw = await env.KUMON_LAYERS.get(lockKey);
          const existing = raw ? JSON.parse(raw) : null;
          if (existing && existing.device === device) {
            await env.KUMON_LAYERS.delete(lockKey);
            return json({ ok: true, released: true }, 200, origin);
          }
          return json({ ok: true, released: false }, 200, origin);
        }

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
