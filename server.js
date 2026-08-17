// server.js — 구몬 학습 허브 로컬 동기화 서버
// 정적 파일 서빙(Live Server 대체) + 필기 데이터 저장/조회 API.
// 과목/교재를 특정 짓지 않는 범용 API — bookId/pageId 문자열만 받아서 동작한다.
// bookId는 클라이언트(shared/annotation-engine.js)에서 항상 PDF 파일명(확장자 제외)으로
// 넘어오므로, 서버는 그 값이 무엇이든 그대로 키로만 쓴다.
//
// 실행: npm install (최초 1회) → npm start
// 노트북에서: http://localhost:5500/index.html
// 같은 와이파이의 탭/폰에서: http://<노트북의 IP>:5500/index.html

const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const app = express();
const PORT = process.env.PORT || 5500;
const ROOT = __dirname;
const LAYERS_DIR = path.join(ROOT, 'data', 'layers');
const LAYERS_BACKUP_DIR = path.join(LAYERS_DIR, 'backup');
const IMAGES_DIR = path.join(ROOT, 'data', 'images');
const AUDIO_DIR = path.join(ROOT, 'data', 'audio');
const PAGE_ORDER_DIR = path.join(ROOT, 'data', 'page-order');
const PAGE_ORDER_BACKUP_DIR = path.join(PAGE_ORDER_DIR, 'backup');
const MAX_BACKUPS_PER_KEY = 10;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

[LAYERS_DIR, LAYERS_BACKUP_DIR, IMAGES_DIR, AUDIO_DIR, PAGE_ORDER_DIR, PAGE_ORDER_BACKUP_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

app.use(express.json({ limit: '30mb' })); // 이미지/오디오 dataURL(base64)도 여유있게 받는다
app.use(express.static(ROOT));

// pageId/bookId는 파일 경로로도 쓰이므로(../ 등 경로 조작 방지) 형식을 엄격히 제한한다.
// bookId(=PDF 파일명, 확장자 제외)와 그 조합만 나오므로 영숫자/하이픈/언더스코어면 충분하다.
function isSafeKey(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id) && id.length <= 200;
}

app.get('/api/ping', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/layers/:pageId', async (req, res) => {
  const { pageId } = req.params;
  if (!isSafeKey(pageId)) return res.status(400).json({ error: 'invalid pageId' });
  const file = path.join(LAYERS_DIR, pageId + '.json');
  try {
    const raw = await fsp.readFile(file, 'utf8');
    res.json({ found: true, ...JSON.parse(raw) });
  } catch (e) {
    if (e.code === 'ENOENT') return res.json({ found: false });
    console.error('[layers:get]', pageId, e);
    res.status(500).json({ error: 'read failed' });
  }
});

app.post('/api/layers/:pageId', async (req, res) => {
  const { pageId } = req.params;
  if (!isSafeKey(pageId)) return res.status(400).json({ error: 'invalid pageId' });
  const { layers, strokes, device, deviceId, deviceType } = req.body || {};
  if (!Array.isArray(layers) || typeof strokes !== 'object' || strokes === null) {
    return res.status(400).json({ error: 'invalid body (layers[], strokes{} required)' });
  }
  const file = path.join(LAYERS_DIR, pageId + '.json');
  try {
    await backupExistingFile(pageId, file, LAYERS_BACKUP_DIR);
    const savedAt = new Date().toISOString();
    const payload = { pageId, layers, strokes, savedAt, device: device || 'unknown', deviceId: deviceId || null, deviceType: deviceType || null };
    await fsp.writeFile(file, JSON.stringify(payload), 'utf8');
    res.json({ ok: true, savedAt });
  } catch (e) {
    console.error('[layers:post]', pageId, e);
    res.status(500).json({ error: 'save failed' });
  }
});

const MIME_EXT = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
  'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/wav': '.wav', 'audio/ogg': '.ogg', 'audio/webm': '.webm',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov'
};
function safeExt(filename, mime) {
  const m = /\.([a-zA-Z0-9]{1,5})$/.exec(filename || '');
  if (m) return '.' + m[1].toLowerCase();
  return MIME_EXT[mime] || '.bin';
}

// 이미지/오디오·영상 첨부 파일 저장 — 클라이언트가 dataURL을 보내면 여기서 파일로 풀어
// data/images 또는 data/audio에 저장하고, 상대 경로만 돌려준다(레이어 JSON에는 경로만 남김).
app.post('/api/upload', async (req, res) => {
  const { kind, pageId, dataUrl, filename } = req.body || {};
  if (kind !== 'image' && kind !== 'audio') return res.status(400).json({ error: 'invalid kind' });
  if (!isSafeKey(pageId)) return res.status(400).json({ error: 'invalid pageId' });
  const m = /^data:([^;,]+)(?:;[^,]*)?,(.+)$/.exec(dataUrl || '');
  if (!m) return res.status(400).json({ error: 'invalid dataUrl' });
  let buf;
  try { buf = Buffer.from(m[2], 'base64'); } catch (e) { return res.status(400).json({ error: 'invalid base64' }); }
  if (!buf.length || buf.length > MAX_UPLOAD_BYTES) return res.status(413).json({ error: 'file too large' });
  const dir = kind === 'image' ? IMAGES_DIR : AUDIO_DIR;
  const subdir = kind === 'image' ? 'images' : 'audio';
  const name = `${pageId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${safeExt(filename, m[1])}`;
  try {
    await fsp.writeFile(path.join(dir, name), buf);
    // 루트 기준 절대경로(선행 "/")로 돌려줘야 한다 — 뷰어가 /subjects/science/처럼
    // 중첩된 경로에서 서빙되므로, 슬래시 없는 상대경로를 쓰면 이미지 태그가 엉뚱한
    // 위치(/subjects/science/data/...)에서 파일을 찾아 깨져 보인다.
    res.json({ ok: true, path: `/data/${subdir}/${name}` });
  } catch (e) {
    console.error('[upload]', pageId, e);
    res.status(500).json({ error: 'save failed' });
  }
});

// 저장 직전 기존 파일을 backup/에 timestamp 포함 파일명으로 복사해두고, 같은 키의 백업이
// MAX_BACKUPS_PER_KEY개를 넘으면 오래된 것부터 지운다. layers/backup, page-order/backup 공용.
async function backupExistingFile(key, file, backupDir) {
  let existing;
  try { existing = await fsp.readFile(file, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return; throw e; }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  await fsp.writeFile(path.join(backupDir, `${key}_${ts}.json`), existing, 'utf8');
  await pruneOldBackups(key, backupDir);
}
async function pruneOldBackups(key, backupDir) {
  const prefix = key + '_';
  const files = (await fsp.readdir(backupDir)).filter(f => f.startsWith(prefix) && f.endsWith('.json')).sort();
  const excess = files.length - MAX_BACKUPS_PER_KEY;
  if (excess <= 0) return;
  for (const f of files.slice(0, excess)) await fsp.unlink(path.join(backupDir, f)).catch(() => {});
}

// 페이지 순서(삽입/삭제/재배치) 동기화 — 마지막에 저장한 쪽이 이기는 단순 정책.
// bookId 하나당 파일 하나(교재 전체의 순서 하나).
app.get('/api/page-order/:bookId', async (req, res) => {
  const { bookId } = req.params;
  if (!isSafeKey(bookId)) return res.status(400).json({ error: 'invalid bookId' });
  const file = path.join(PAGE_ORDER_DIR, bookId + '.json');
  try {
    const raw = await fsp.readFile(file, 'utf8');
    res.json({ found: true, ...JSON.parse(raw) });
  } catch (e) {
    if (e.code === 'ENOENT') return res.json({ found: false });
    console.error('[page-order:get]', bookId, e);
    res.status(500).json({ error: 'read failed' });
  }
});

app.post('/api/page-order/:bookId', async (req, res) => {
  const { bookId } = req.params;
  if (!isSafeKey(bookId)) return res.status(400).json({ error: 'invalid bookId' });
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'invalid body (order[] required)' });
  const file = path.join(PAGE_ORDER_DIR, bookId + '.json');
  try {
    await backupExistingFile(bookId, file, PAGE_ORDER_BACKUP_DIR);
    const savedAt = new Date().toISOString();
    await fsp.writeFile(file, JSON.stringify({ bookId, order, savedAt }), 'utf8');
    res.json({ ok: true, savedAt });
  } catch (e) {
    console.error('[page-order:post]', bookId, e);
    res.status(500).json({ error: 'save failed' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`구몬 학습 허브 서버 실행 중 — http://localhost:${PORT}`);
  console.log(`같은 와이파이의 다른 기기(탭 등)에서는 이 PC의 IP로 접속하세요. 예: http://192.168.0.33:${PORT}`);
});
