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

      // /api/layers/:bookId/:page
      if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'layers') {
        const [, , bookId, page] = parts;
        if (!isSafeKey(bookId) || !isSafeKey(page)) return json({ error: 'invalid bookId/page' }, 400, origin);
        const kvKey = 'layer:' + bookId + '__' + page;

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
            pageId: bookId + '__' + page, layers, strokes, savedAt,
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

      return json({ error: 'not found' }, 404, origin);
    } catch (e) {
      return json({ error: 'internal error', message: String(e && e.message || e) }, 500, origin);
    }
  }
};
