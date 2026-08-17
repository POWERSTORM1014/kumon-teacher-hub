// subjects/hanja/viewer.js
// 한자 뷰어 — UI/DOM 담당. 필기/레이어/동기화/PWA 로직은 전부 AnnotationEngine에 위임한다.
// bookId는 항상 PDF 파일명(확장자 제외) — bookIdOf()는 hanja-data.js에 정의됨.

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const CACHE_NAME = 'kth-content-v1'; // sw.js의 CONTENT_CACHE와 반드시 동일해야 함(모든 과목 공용 캐시 버킷)
const CURRENT_SUBJECT_ID = 'hanja'; // subjects.json의 id와 일치 — 과목 전환기 기본 선택, 최근 학습 기록에 쓰임
const CURRENT_VIEWER_PATH = 'subjects/hanja/viewer.html';
const Engine = AnnotationEngine;

let pdfDoc = null, totalPg = 0, curPage = 1, activeInkPage = null;
let currentMaterial = null, bookId = null, currentIsCustom = false;
let zoom = 100, layout = 'single', sidebarOn = true, sidebarWidth = 90;
const SIDEBAR_MIN_W = 64, SIDEBAR_MAX_W = 320, SIDEBAR_BASE_W = 90;
let darkMode = false;
let currentTab = 'library', currentSubTab = 'textbook';
let pdfSearchMatches = [], pdfSearchIdx = -1, pdfSearchTimer = null, pdfSearchQuery = '';
let searchTimer = null;

function panelPage() { return activeInkPage !== null ? activeInkPage : curPage; }
function setActiveInkPage(pos) {
  const changed = activeInkPage !== pos;
  activeInkPage = pos;
  document.querySelectorAll('.page-wrap.ink-active').forEach(w => w.classList.remove('ink-active'));
  const wrap = document.getElementById('page-wrap-' + pos);
  if (wrap) wrap.classList.add('ink-active');
  if (changed && document.getElementById('layer-panel').classList.contains('open')) renderLayerPanel();
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('viewer-main').addEventListener('pointerdown', e => {
    const wrap = e.target.closest('.page-wrap');
    if (wrap) setActiveInkPage(parseInt(wrap.id.slice('page-wrap-'.length), 10));
  }, true);
});

/* ══ 편집 잠금(동시 편집 방지) ════════════════════════════════
   saveLayer()/loadLayer() 저장 로직 자체는 건드리지 않고, 그 위에 얹는 별도 계층.
   필기 도구(pen-toolbar)를 처음 켤 때 현재 페이지를 잠그고, 30초마다 heartbeat로
   갱신하다가, 페이지/교재/과목을 벗어나거나 탭을 닫을 때 해제한다. 다른 기기가 이미
   잠근 페이지면 409가 오고, 이 기기는 읽기 전용으로 전환된다. */
let lockedPage = null;      // 이 기기가 현재 보유한 잠금의 page id(없으면 null)
let lockHeartbeatTimer = null;
let lockReadOnly = false;   // 다른 기기가 잠가서 도구를 꺼둔 상태인지
let lockConflictInfo = null; // { device, timestamp, page } — 경고 모달/배너용

function currentLockPageId() {
  if (!bookId || !totalPg) return null;
  return Engine.PageOrder.pageIdOf(panelPage());
}
function minutesAgo(ts) {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  return m <= 0 ? '방금' : (m + '분 전');
}
function stopLockHeartbeat() { if (lockHeartbeatTimer) { clearInterval(lockHeartbeatTimer); lockHeartbeatTimer = null; } }
function startLockHeartbeat() {
  stopLockHeartbeat();
  lockHeartbeatTimer = setInterval(async () => {
    if (!lockedPage || !bookId) return;
    const page = lockedPage;
    const r = await Engine.Storage.sendHeartbeat(bookId, page, Engine.Device.getLabel());
    if (r.status === 409) {
      lockedPage = null;
      stopLockHeartbeat();
      Engine.Events.emitLockChanged({ state: 'conflict', page, device: r.device, timestamp: r.timestamp });
    }
  }, 30000);
}
async function acquireLockForCurrentPage(force) {
  const page = currentLockPageId();
  if (!bookId || !page) return;
  const device = Engine.Device.getLabel();
  const r = await Engine.Storage.acquireLock(bookId, page, device, force);
  if (r.ok) {
    lockedPage = page;
    startLockHeartbeat();
    Engine.Events.emitLockChanged({ state: 'acquired', page, device });
  } else if (r.status === 409) {
    lockedPage = null;
    stopLockHeartbeat();
    Engine.Events.emitLockChanged({ state: 'conflict', page, device: r.device, timestamp: r.timestamp });
  }
  // 오프라인(status 0)이면 조용히 무시 — 로컬 저장은 계속 되고, 서버 잠금 체계 자체가
  // 오프라인 상태에서는 의미가 없다.
}
function releaseCurrentLock() {
  stopLockHeartbeat();
  if (lockedPage && bookId) {
    const page = lockedPage;
    Engine.Storage.releaseLock(bookId, page, Engine.Device.getLabel()); // fire-and-forget
    Engine.Events.emitLockChanged({ state: 'released', page });
  }
  lockedPage = null;
}
function releaseLockOnUnload() {
  if (lockedPage && bookId) Engine.Storage.releaseLockBeacon(bookId, lockedPage, Engine.Device.getLabel());
}
window.addEventListener('beforeunload', releaseLockOnUnload);
window.addEventListener('pagehide', releaseLockOnUnload);

// 잠금 상태 변화 신호를 구독하는 곳은 여기 한 곳뿐이다 — acquire/heartbeat/release
// 쪽 코드는 상태를 바꾸고 이벤트만 쏘면 되고, 배너/모달/도구 비활성화 같은 실제 화면
// 반영은 전부 이 구독자가 담당한다(kumon:structure-changed와 같은 원칙).
Engine.Events.onLockChanged(e => {
  const d = e.detail;
  if (d.state === 'conflict') { lockReadOnly = true; lockConflictInfo = { device: d.device, timestamp: d.timestamp, page: d.page }; }
  else { lockReadOnly = false; lockConflictInfo = null; } // 'acquired' | 'released'
  applyLockReadOnlyUI();
  if (d.state === 'conflict') openLockConflictModal();
});

// 읽기 전용 상태를 실제 도구 비활성화로 반영 — 배너 표시 + 필기 모드 강제 종료.
function applyLockReadOnlyUI() {
  document.getElementById('lock-banner').classList.toggle('show', lockReadOnly);
  if (lockReadOnly) {
    if (Engine.Tools.isPenMode()) {
      Engine.Tools.setPenMode(false);
      document.getElementById('vt-pen').classList.remove('on');
      document.getElementById('pen-toolbar').classList.remove('show');
      Engine.Page.setPenModeClasses(false);
    }
    document.getElementById('vt-pen').disabled = true;
    if (lockConflictInfo) {
      document.getElementById('lock-banner-text').textContent =
        '🔒 ' + lockConflictInfo.device + '에서 편집 중 (마지막 활동: ' + minutesAgo(lockConflictInfo.timestamp) + ') — 보기 전용';
    }
  } else {
    document.getElementById('vt-pen').disabled = false;
  }
}
function openLockConflictModal() {
  if (!lockConflictInfo) return;
  document.getElementById('lock-conflict-text').innerHTML =
    '<b>' + lockConflictInfo.device + '</b>에서 편집 중입니다.<br>(마지막 활동: ' + minutesAgo(lockConflictInfo.timestamp) + ')';
  document.getElementById('lock-conflict-modal').classList.add('open');
}
function closeLockConflict() { document.getElementById('lock-conflict-modal').classList.remove('open'); }
async function forceLockTakeover() {
  if (!lockConflictInfo) { closeLockConflict(); return; }
  if (!confirm('정말 이어받으시겠어요? 상대 기기 작업이 저장되지 않았을 수 있습니다.')) return;
  closeLockConflict();
  document.getElementById('vt-pen').disabled = false;
  await acquireLockForCurrentPage(true);
  // 이어받기에 성공했으면 바로 필기 모드를 켜준다 — 방금 acquireLockForCurrentPage가 이미
  // 잠금을 확보했으므로 skipLock=true로 불러 중복 acquire 요청을 보내지 않는다.
  if (!lockReadOnly && !Engine.Tools.isPenMode()) togglePen(true);
}

function pageLabel(pos) {
  const entry = Engine.PageOrder.getOrderEntry(pos);
  if (entry && entry.kind === 'inserted') return entry.label || '새 페이지';
  return pdfPageLabel(entry ? entry.pdfPage : pos);
}
function pdfPageLabel(pdfNum) {
  const map = (PAGE_MAPS[bookId] || []);
  const found = map.find(x => x.pdf === pdfNum);
  return found ? found.label : (pdfNum + '페이지');
}
async function getPageViewport1(pos) {
  const entry = Engine.PageOrder.getOrderEntry(pos);
  if (entry && entry.kind === 'inserted') return { width: entry.width, height: entry.height };
  const pg = await pdfDoc.getPage(entry ? entry.pdfPage : pos);
  return pg.getViewport({ scale: 1 });
}

/* ══ 자료실 ══════════════════════════════════════════════ */
function switchTab(tab) {
  currentTab = tab;
  ['library', 'myfiles'].forEach(t => document.getElementById('ms-tab-' + t).classList.toggle('on', t === tab));
  document.getElementById('ms-sub-tabs').style.display = tab === 'library' ? '' : 'none';
  document.getElementById('ms-filter-bar').style.display = tab === 'library' ? '' : 'none';
  renderList();
}
function switchSubTab(sub) {
  currentSubTab = sub;
  ['textbook', 'answer'].forEach(s => document.getElementById('ms-sub-' + s).classList.toggle('on', s === sub));
  renderList();
}
// MATERIALS에 있는 stage 값들로 필터 옵션을 자동 생성한다 — 과목마다 단계 체계가
// 달라도(D/G/H, 초급/중급 등) 이 함수는 손댈 필요 없이 그대로 재사용된다.
// 자료관리 화면의 단계 드롭다운(ms-stage-filter)과 뷰어 상단의 단계 드롭다운
// (vt-stage-filter) 둘 다 이 함수 하나로 채운다 — 옵션 목록을 두 곳에서 따로
// 만들지 않는다.
const STAGE_FILTER_SELECT_IDS = ['ms-stage-filter', 'vt-stage-filter'];
function populateStageFilter() {
  const stages = Array.from(new Set(MATERIALS.map(m => m.stage).filter(Boolean))).sort();
  const optionsHtml = '<option value="all">전체 단계</option>' + stages.map(s => `<option value="${s}">${s}단계</option>`).join('');
  STAGE_FILTER_SELECT_IDS.forEach(id => { const sel = document.getElementById(id); if (sel) sel.innerHTML = optionsHtml; });
}
function renderList() {
  const list = document.getElementById('ms-list');
  if (currentTab === 'myfiles') { renderMyFiles(); return; }
  const stageFilter = document.getElementById('ms-stage-filter').value;
  let items = MATERIALS.filter(m => m.category === currentSubTab);
  if (stageFilter !== 'all') items = items.filter(m => m.stage === stageFilter);
  if (!items.length) { list.innerHTML = '<div class="ms-empty">📂 해당 자료가 없습니다</div>'; return; }
  list.innerHTML = items.map(m => `
    <div class="ms-item">
      <div class="ms-item-icon">${m.icon || '📄'}</div>
      <div class="ms-item-info">
        <div class="ms-item-subject">${m.subject} ${m.stage}단계 · ${m.label}</div>
        <div class="ms-item-sub">${m.range}${m.unit ? ' · ' + m.unit : ''}</div>
      </div>
      <div class="ms-item-actions"><button class="ms-view-btn" onclick="openMaterial('${m.file}')">보기</button></div>
    </div>`).join('');
}
function getMyFiles() { try { return JSON.parse(localStorage.getItem('ann:myfiles') || '[]'); } catch (e) { return []; } }
function saveMyFiles(arr) { localStorage.setItem('ann:myfiles', JSON.stringify(arr)); }
function renderMyFiles() {
  const list = document.getElementById('ms-list');
  const files = getMyFiles();
  let html = `<div class="ms-upload-zone" id="upload-zone" onclick="document.getElementById('file-input').click()">
    <div class="ms-upload-icon">📁</div><div class="ms-upload-title">PDF 파일 추가</div>
    <div class="ms-upload-sub">클릭하거나 파일을 드래그하세요</div></div>`;
  if (files.length) html += files.map(f => `<div class="ms-item">
    <div class="ms-item-icon">📄</div>
    <div class="ms-item-info"><div class="ms-item-subject">${f.name}</div><div class="ms-item-sub">${(f.size / 1024 / 1024).toFixed(1)}MB · ${f.date}</div></div>
    <div class="ms-item-actions"><button class="ms-view-btn" style="background:none;border:1.5px solid var(--border);color:var(--ink-mid);" onclick="delMyFile('${f.id}')">삭제</button><button class="ms-view-btn" onclick="openMyFile('${f.id}')">보기</button></div>
  </div>`).join('');
  list.innerHTML = html;
  const zone = document.getElementById('upload-zone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f && f.type === 'application/pdf') processUpload(f); });
  }
}
function handleUpload(e) { const f = e.target.files[0]; if (f) processUpload(f); e.target.value = ''; }
function processUpload(file) {
  if (file.type !== 'application/pdf') { showToast('PDF 파일만 지원합니다'); return; }
  if (file.size > 50 * 1024 * 1024) { showToast('50MB 이하 파일만 가능합니다'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const files = getMyFiles();
    files.unshift({ id: 'f' + Date.now(), name: file.name, size: file.size, date: new Date().toLocaleDateString('ko-KR'), data: e.target.result });
    if (files.length > 20) files.splice(20);
    saveMyFiles(files); renderMyFiles();
    showToast('"' + file.name + '" 업로드 완료!');
  };
  reader.readAsDataURL(file);
}
function delMyFile(id) { saveMyFiles(getMyFiles().filter(f => f.id !== id)); renderMyFiles(); showToast('삭제 완료'); }
async function openMyFile(id) {
  const f = getMyFiles().find(x => x.id === id); if (!f) return;
  releaseCurrentLock(); // 이전에 열려 있던 교재의 페이지 잠금을 해제하고 새 교재를 연다
  currentMaterial = null; currentIsCustom = true; bookId = 'custom-' + f.id;
  showViewer();
  showBookLoadingOverlay();
  try {
    const b64 = atob(f.data.split(',')[1]);
    const arr = new Uint8Array(b64.length);
    for (let i = 0; i < b64.length; i++) arr[i] = b64.charCodeAt(i);
    const doc = await pdfjsLib.getDocument({ data: arr }).promise;
    await afterPdfLoaded(doc, f.name);
  } catch (e) { hideBookLoadingOverlay(); showToast('PDF 로드 실패: ' + e.message); }
}

/* ══ 검색 (PAGE_MAPS 기반 자동 생성 인덱스) ══════════════════ */
function msSearchLive(val) {
  clearTimeout(searchTimer);
  document.getElementById('ms-clear-btn').style.display = val ? '' : 'none';
  if (!val.trim()) { document.getElementById('ms-search-results').style.display = 'none'; return; }
  searchTimer = setTimeout(() => showSearchResults(val), 200);
}
function msClearSearch() {
  document.getElementById('ms-search-input').value = '';
  document.getElementById('ms-search-results').style.display = 'none';
  document.getElementById('ms-clear-btn').style.display = 'none';
}
function showSearchResults(query) {
  const q = query.toLowerCase().trim();
  const results = SEARCH_INDEX.filter(item => item.keywords.includes(q)).slice(0, 8);
  const box = document.getElementById('ms-search-results');
  if (!results.length) { box.innerHTML = '<div class="ms-no-result">🔍 "' + query + '" 검색 결과 없음</div>'; }
  else {
    box.innerHTML = results.map(r => {
      const hl = r.label.replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => '<mark>' + m + '</mark>');
      const m = materialByBookId(r.bookId);
      return `<div class="ms-sr-item" onclick="jumpToIndexPage('${r.bookId}',${r.pdfPage})">
        <div class="ms-sr-page">${m ? m.range : ''}</div>
        <div class="ms-sr-text">${hl}<br><span style="font-size:11px;color:var(--ink-light);">${r.sub}</span></div>
      </div>`;
    }).join('');
  }
  box.style.display = '';
}
function jumpToIndexPage(bid, pdfPage) {
  document.getElementById('ms-search-results').style.display = 'none';
  const m = materialByBookId(bid);
  if (!m) return;
  openMaterial(m.file).then(() => { goToPdfPage(pdfPage); showToast('📖 이동'); });
}
document.addEventListener('click', e => { if (!e.target.closest('.ms-search-wrap')) document.getElementById('ms-search-results').style.display = 'none'; });

/* ══ 교재 열기 ═══════════════════════════════════════════ */
// 다른 교재로 전환하는 동안 이전 교재 페이지가 남아 보이지 않게 한다 — 페이지만
// 넘기는 renderPages()에는 절대 안 쓰고, "책 자체가 바뀌는" 진입점(openMaterial/
// openMyFile)에서만 부른다. 썸네일/본문을 즉시 비우는 동시에 스피너로도 덮어서,
// 새 PDF가 파싱되는 짧은 시간에도 옛 화면이 한 프레임도 안 보이게 한다.
function showBookLoadingOverlay() {
  document.getElementById('viewer-main').innerHTML = '';
  document.getElementById('thumb-list').innerHTML = '';
  document.getElementById('book-loading-overlay').classList.add('show');
}
function hideBookLoadingOverlay() {
  document.getElementById('book-loading-overlay').classList.remove('show');
}
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error((label || '작업') + ' 시간 초과')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}
async function openMaterial(file) {
  const m = MATERIALS.find(x => x.file === file); if (!m) return;
  releaseCurrentLock(); // 이전에 열려 있던 교재의 페이지 잠금을 해제하고 새 교재를 연다
  const url = Engine.pdfUrl(m.file); // R2 공개 URL — 로컬 pdf/ 폴더는 더 이상 참조하지 않음
  try {
    const cachedRes = ('caches' in window) ? await caches.match(url).catch(() => null) : null;
    if (!cachedRes) {
      const reachable = await Engine.PWA.isUrlReachable(url, 2500);
      if (!reachable) { showOfflineUnavailable(m); return; }
    }
    currentMaterial = m; currentIsCustom = false; bookId = bookIdOf(m);
    showViewer();
    showBookLoadingOverlay();
    showToast('PDF 로딩 중...');
    let loadingTask;
    // Range Request로 필요한 페이지만 부분적으로 받는다 — 단계별 대형 PDF(수백 페이지)로
    // 넘어가도 첫 페이지를 보려고 파일 전체를 다 받을 때까지 기다릴 필요가 없어진다.
    // 이미 캐시에 전체 파일이 있으면(오프라인 저장됨) 그냥 메모리에서 바로 읽는 게 더 빠르므로
    // 이 경로는 그대로 둔다.
    if (cachedRes) { const buf = await cachedRes.clone().arrayBuffer(); loadingTask = pdfjsLib.getDocument({ data: buf }); }
    else loadingTask = pdfjsLib.getDocument({ url });
    const doc = await withTimeout(loadingTask.promise, 20000, 'PDF 로딩');
    await afterPdfLoaded(doc, m.label);
  } catch (e) {
    console.warn('[viewer] openMaterial 실패', e);
    hideBookLoadingOverlay();
    const stillCached = await Engine.PWA.isCached(url);
    if (!stillCached) { backToMaterial(); showOfflineUnavailable(m); }
    else showToast('PDF 로드 실패: ' + (e && e.message ? e.message : '알 수 없는 오류'));
  }
}
async function afterPdfLoaded(doc, label) {
  pdfDoc = doc; curPage = 1; zoom = 100;
  Engine.setBook(bookId);
  const { totalPages } = await Engine.initPageOrder(bookId, doc.numPages);
  totalPg = totalPages;
  document.getElementById('sb-filename').textContent = label;
  Engine.Storage.recordRecent({ subjectId: CURRENT_SUBJECT_ID, bookId, title: label, viewerPath: CURRENT_VIEWER_PATH });
  // 지금 연 교재의 단계로 뷰어 상단 드롭다운도 맞춰준다(커스텀 업로드 파일은 단계가 없음).
  const vtStage = document.getElementById('vt-stage-filter');
  if (vtStage) vtStage.value = (currentMaterial && currentMaterial.stage) || 'all';
  await buildThumbs(); await renderPages(); updatePageInfo();
  hideBookLoadingOverlay(); // 새 교재의 첫 페이지가 실제로 그려진 뒤에야 옛 화면 가림을 걷는다
}
function showViewer() { document.getElementById('material-screen').style.display = 'none'; document.getElementById('viewer-screen').classList.add('show'); }
function backToMaterial() { releaseCurrentLock(); document.getElementById('viewer-screen').classList.remove('show'); document.getElementById('material-screen').style.display = ''; renderList(); }
// 뷰어 상단 단계 드롭다운 — 자료관리 화면과 완전히 같은 필터 select(ms-stage-filter)에
// 값을 그대로 넣고 renderList()가 이미 하는 필터링 로직을 그대로 재사용한다.
function onViewerStageFilterChange(val) {
  document.getElementById('ms-stage-filter').value = val;
  backToMaterial();
}

let pendingOfflineMaterial = null;
function showOfflineUnavailable(m) {
  pendingOfflineMaterial = m;
  document.getElementById('ou-text').innerHTML = '"' + (m ? m.label : '이 교재') + '"는 아직 저장되지 않았어요.<br>와이파이가 연결되면 자동으로 저장됩니다.';
  document.getElementById('offline-unavail-modal').classList.add('open');
}
function closeOfflineUnavailable() { document.getElementById('offline-unavail-modal').classList.remove('open'); pendingOfflineMaterial = null; }
function retryOfflineMaterial() { const m = pendingOfflineMaterial; closeOfflineUnavailable(); if (m) openMaterial(m.file); }

/* ══ 썸네일 / 목차 ══════════════════════════════════════ */
async function buildThumbs() {
  const list = document.getElementById('thumb-list');
  list.innerHTML = '';
  for (let p = 1; p <= totalPg; p++) {
    const entry = Engine.PageOrder.getOrderEntry(p);
    const isInserted = !!(entry && entry.kind === 'inserted');
    const pdfNum = isInserted ? null : (entry ? entry.pdfPage : p);
    const map = PAGE_MAPS[bookId] || [];
    const mapEntry = isInserted ? null : map.find(x => x.pdf === pdfNum);
    const isFront = mapEntry && mapEntry.type === 'front';
    const mainLabel = isInserted ? (entry.label || '새 페이지') : (mapEntry ? mapEntry.label : String(pdfNum));
    const subLabel = isInserted ? '' : (mapEntry && isFront ? mapEntry.sub : '');
    const item = document.createElement('div');
    item.className = 'thumb-item' + (p === curPage ? ' cur' : '') + (isFront ? ' front-page' : '') + (isInserted ? ' inserted-page' : '');
    item.id = 'thumb-' + p;
    item.onclick = () => { if (item.dataset.suppressClick === '1') { item.dataset.suppressClick = ''; return; } goToPage(p); };
    item.oncontextmenu = e => { e.preventDefault(); openPageContextMenu(p, e.clientX, e.clientY); };
    item.innerHTML = `<canvas class="thumb-canvas" id="tc-${p}"></canvas><div class="thumb-num">${mainLabel}</div>${subLabel ? `<div class="thumb-label">${subLabel}</div>` : ''}`;
    list.appendChild(item);
    const c = document.getElementById('tc-' + p);
    if (isInserted) {
      const s = 0.2;
      c.width = Math.round(entry.width * s); c.height = Math.round(entry.height * s);
      Engine.Page.templateBackground(c.getContext('2d'), c.width, c.height, entry.template);
    } else {
      const pg = await pdfDoc.getPage(pdfNum);
      const vp = pg.getViewport({ scale: 0.2 });
      c.width = vp.width; c.height = vp.height;
      await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    }
    initThumbGesture(item, p);
  }
}

let dragTargetInfo = null;
function initThumbGesture(item, pos) {
  const entry = Engine.PageOrder.getOrderEntry(pos);
  const canDrag = !!(entry && entry.kind === 'inserted');
  let timer = null, armed = false, dragging = false, pointerId = null, startX = 0, startY = 0;
  item.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    pointerId = e.pointerId; armed = false; dragging = false; startX = e.clientX; startY = e.clientY;
    timer = setTimeout(() => { armed = true; if (canDrag) item.setPointerCapture(pointerId); }, 500);
  });
  item.addEventListener('pointermove', e => {
    if (pointerId === null || e.pointerId !== pointerId) return;
    const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
    if (!armed) { if (dist > 10) clearTimeout(timer); return; }
    if (canDrag && !dragging && dist > 6) { dragging = true; item.classList.add('dragging'); }
    if (dragging) updateDragOverIndicator(item, e.clientY);
  });
  function endGesture(e) {
    if (pointerId === null || (e && e.pointerId !== pointerId)) return;
    clearTimeout(timer);
    if (dragging) { item.classList.remove('dragging'); commitThumbDragMove(pos); clearDragOverIndicators(); }
    else if (armed) { item.dataset.suppressClick = '1'; openPageContextMenu(pos, e ? e.clientX : startX, e ? e.clientY : startY); }
    pointerId = null; armed = false; dragging = false;
  }
  item.addEventListener('pointerup', endGesture);
  item.addEventListener('pointercancel', endGesture);
}
function updateDragOverIndicator(item, clientY) {
  clearDragOverIndicators(); dragTargetInfo = null;
  const items = Array.from(document.getElementById('thumb-list').children).filter(el => el !== item);
  for (const el of items) {
    const r = el.getBoundingClientRect();
    if (clientY < r.top + r.height / 2) { el.classList.add('drag-over-before'); dragTargetInfo = { targetPos: parseInt(el.id.slice(6), 10), before: true }; return; }
  }
  const last = items[items.length - 1];
  if (last) { last.classList.add('drag-over-after'); dragTargetInfo = { targetPos: parseInt(last.id.slice(6), 10), before: false }; }
}
function clearDragOverIndicators() { document.querySelectorAll('.drag-over-before,.drag-over-after').forEach(el => el.classList.remove('drag-over-before', 'drag-over-after')); }
function commitThumbDragMove(fromPos) {
  const info = dragTargetInfo; dragTargetInfo = null;
  if (!info || info.targetPos === fromPos) return;
  const curId = Engine.PageOrder.pageIdOf(curPage);
  const result = Engine.PageOrder.movePage(fromPos, info.targetPos, info.before);
  if (!result) return;
  totalPg = result.totalPages;
  const newPos = result.newPosOf(curId);
  if (newPos > 0) curPage = newPos;
  // buildThumbs/renderPages는 여기서 직접 부르지 않는다 — movePage()가 낸
  // kumon:structure-changed 신호를 handleStructureChanged()가 구독해서 다시 그린다.
  showToast('페이지 순서를 바꿨어요');
}

let pageCtxMenuTarget = null;
function openPageContextMenu(pos, clientX, clientY) {
  pageCtxMenuTarget = pos;
  const entry = Engine.PageOrder.getOrderEntry(pos);
  const isInserted = !!(entry && entry.kind === 'inserted');
  document.getElementById('pcm-delete').style.display = isInserted ? '' : 'none';
  document.getElementById('pcm-rename').style.display = isInserted ? '' : 'none';
  const menu = document.getElementById('page-context-menu');
  menu.classList.add('open');
  const mw = menu.offsetWidth || 180, mh = menu.offsetHeight || 130;
  menu.style.left = Math.max(4, Math.min(clientX, window.innerWidth - mw - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(clientY, window.innerHeight - mh - 4)) + 'px';
}
function closePageContextMenu() { document.getElementById('page-context-menu').classList.remove('open'); pageCtxMenuTarget = null; }
document.addEventListener('click', e => { if (!e.target.closest('#page-context-menu')) closePageContextMenu(); });
function pcmInsertAfter() { const pos = pageCtxMenuTarget; closePageContextMenu(); if (pos != null) openPageInsertModal(pos); }
function pcmDelete() { const pos = pageCtxMenuTarget; closePageContextMenu(); if (pos != null) deletePageAt(pos); }
function pcmRename() { const pos = pageCtxMenuTarget; closePageContextMenu(); if (pos != null) renamePageLabel(pos); }
function renamePageLabel(pos) {
  const entry = Engine.PageOrder.getOrderEntry(pos);
  if (!entry || entry.kind !== 'inserted') return;
  openTextPrompt('페이지 이름표', entry.label || '새 페이지', name => {
    Engine.PageOrder.renamePage(pos, name); // 썸네일 목록 갱신은 structure-changed 신호가 처리
    const labelBar = document.querySelector('#page-wrap-' + pos + ' .page-label-bar');
    if (labelBar) labelBar.textContent = '✏️ ' + name; // 지금 보이는 페이지는 즉시 반영(선택적 최적화)
    showToast('이름표를 바꿨어요');
  });
}

function openToolbarInsertMenu(e) {
  if (!currentMaterial && !currentIsCustom) { showToast('먼저 교재를 열어주세요'); return; }
  closePageContextMenu();
  const menu = document.getElementById('toolbar-insert-menu');
  menu.classList.add('open');
  const rect = e.currentTarget.getBoundingClientRect();
  const mw = menu.offsetWidth || 180, mh = menu.offsetHeight || 90;
  menu.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - mw - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(rect.bottom + 4, window.innerHeight - mh - 4)) + 'px';
}
function closeToolbarInsertMenu() { document.getElementById('toolbar-insert-menu').classList.remove('open'); }
document.addEventListener('click', e => { if (!e.target.closest('#toolbar-insert-menu') && !e.target.closest('#vt-insert-page')) closeToolbarInsertMenu(); });
function toolbarInsertPage(where) { closeToolbarInsertMenu(); openPageInsertModal(where === 'before' ? curPage - 1 : curPage); }
function toolbarDeleteCurrentPage() {
  const entry = Engine.PageOrder.getOrderEntry(curPage);
  if (!entry || entry.kind !== 'inserted') { showToast('원본 페이지는 삭제할 수 없어요 — 직접 삽입한 페이지만 삭제할 수 있어요'); return; }
  deletePageAt(curPage);
}

let pageInsertCtx = null, piSelectedTemplate = 'blank';
function selectPageTemplate(t, el) { piSelectedTemplate = t; document.querySelectorAll('.pi-template').forEach(x => x.classList.remove('on')); el.classList.add('on'); }
function openPageInsertModal(afterPos) {
  const remaining = Engine.PageOrder.MAX_INSERTED_PAGES - Engine.PageOrder.countInsertedPages();
  if (remaining <= 0) { showToast('삽입 가능한 페이지는 최대 ' + Engine.PageOrder.MAX_INSERTED_PAGES + '장까지예요'); return; }
  pageInsertCtx = { afterPos }; piSelectedTemplate = 'blank';
  document.querySelectorAll('.pi-template').forEach((el, i) => el.classList.toggle('on', i === 0));
  const countInput = document.getElementById('pi-count'); countInput.value = 1; countInput.max = remaining;
  document.getElementById('pi-remaining').textContent = '최대 ' + remaining + '장 더 삽입할 수 있어요';
  document.getElementById('page-insert-modal').classList.add('open');
}
function closePageInsertModal() { document.getElementById('page-insert-modal').classList.remove('open'); pageInsertCtx = null; }
async function confirmPageInsert() {
  if (!pageInsertCtx) return;
  const { afterPos } = pageInsertCtx;
  let count = parseInt(document.getElementById('pi-count').value, 10) || 1;
  const vp1 = await getPageViewport1(Math.max(1, afterPos));
  const result = Engine.PageOrder.insertPages(afterPos, count, piSelectedTemplate, vp1);
  totalPg = result.totalPages || totalPg;
  if (result.firstPos) curPage = Math.max(1, Math.min(totalPg, result.firstPos));
  closePageInsertModal();
  // 썸네일/본문 다시 그리기는 insertPages()가 낸 structure-changed 신호가 처리한다.
  showToast('📄 ' + (result.inserted || 0) + '장 삽입했어요');
}
function deletePageAt(pos) {
  const entry = Engine.PageOrder.getOrderEntry(pos);
  if (!entry || entry.kind !== 'inserted') return;
  if (!confirm('이 페이지의 필기 내용도 함께 삭제됩니다. 계속할까요?')) return;
  const result = Engine.PageOrder.deletePageAt(pos);
  if (!result) return;
  totalPg = result.totalPages;
  if (pos < curPage) curPage = curPage - 1;
  if (curPage > totalPg) curPage = Math.max(1, totalPg);
  showActionToast('페이지가 삭제되었습니다', '되돌리기', () => {
    const r2 = Engine.PageOrder.undoPendingDelete();
    if (!r2) return;
    totalPg = r2.totalPages;
    curPage = Math.max(1, Math.min(totalPg, r2.insertedAtPos));
    showToast('페이지를 복원했어요');
  }, 5000);
}

/* ══ 페이지 렌더링 ════════════════════════════════════════ */
async function renderPages() {
  const main = document.getElementById('viewer-main');
  main.innerHTML = '';
  activeInkPage = null;
  Engine.resetHistory();
  Engine.Page.clearSelection();
  const scale = zoom / 100;
  if (layout === 'single') { await renderOnePage(main, curPage, scale); }
  else {
    const row = document.createElement('div'); row.className = 'page-row'; main.appendChild(row);
    const pair = curPage % 2 === 0 ? [curPage - 1, curPage] : [curPage, curPage + 1];
    for (const p of pair) if (p >= 1 && p <= totalPg) await renderOnePage(row, p, scale);
  }
  updatePageInfo();
  document.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('cur'));
  const cur = document.getElementById('thumb-' + curPage);
  if (cur) { cur.classList.add('cur'); cur.scrollIntoView({ block: 'nearest' }); }
  if (pdfSearchQuery) await refreshHighlights();
  if (document.getElementById('layer-panel').classList.contains('open')) renderLayerPanel();
  if (document.getElementById('bookmark-modal').classList.contains('open')) renderBookmarkList();
}
async function renderOnePage(container, pos, scale) {
  const entry = Engine.PageOrder.getOrderEntry(pos);
  const isInserted = entry && entry.kind === 'inserted';
  let vp, pdfPageObj = null;
  if (isInserted) vp = { width: entry.width * scale, height: entry.height * scale };
  else { pdfPageObj = await pdfDoc.getPage(entry ? entry.pdfPage : pos); vp = pdfPageObj.getViewport({ scale }); }
  const wrap = document.createElement('div'); wrap.className = 'page-wrap';
  container.appendChild(wrap);
  const mounted = Engine.Page.mountPage(wrap, {
    pos, widthPx: vp.width, heightPx: vp.height, scale,
    template: isInserted ? entry.template : 'blank',
    onElementPlacement: (kind, p, layerId, x, y) => { setActiveInkPage(p); if (kind === 'text') openTextElementModal(p, layerId, x, y, null); else openMediaElementModal(p, layerId, x, y, null); },
    onTextTap: (p, layerId, el) => openTextElementModal(p, layerId, el.x, el.y, el),
    onImageTap: (p, layerId, el) => openImageElementModal(p, layerId, el),
    onMediaTap: (p, layerId, el, readonly) => openMediaElementModal(p, layerId, el.x, el.y, el, readonly),
    onLockedInput: () => showToast('페이지 구성을 갱신하는 중이에요 — 잠시 후 다시 시도해주세요')
  });
  if (isInserted && entry.label) {
    const labelBar = document.createElement('div');
    labelBar.className = 'page-label-bar'; labelBar.textContent = '✏️ ' + (entry.label || '새 페이지');
    labelBar.onclick = () => renamePageLabel(pos);
    wrap.appendChild(labelBar);
  }
  if (pdfPageObj) await pdfPageObj.render({ canvasContext: mounted.bgCanvas.getContext('2d'), viewport: vp }).promise;
  Sync.checkPageSyncUI(pos);
  if (pdfSearchQuery && !isInserted) await applyHighlight(pos, vp, pdfSearchQuery);
}

/* ══ 줌/레이아웃/사이드바 ════════════════════════════════ */
function chZoom(d) { zoom = Math.max(25, Math.min(400, zoom + d)); document.getElementById('vt-zoom').textContent = zoom + '%'; renderPages(); }
async function computeFitZoom(mode) {
  if (!pdfDoc) return zoom;
  const vp = await getPageViewport1(curPage);
  const container = document.getElementById('viewer-main');
  const cs = getComputedStyle(container);
  const availW = container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = container.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  let s;
  if (mode === 'width') { const cols = layout === 'double' ? 2 : 1; const gap = layout === 'double' ? 12 : 0; s = ((availW - gap) / cols) / vp.width; }
  else s = availH / vp.height;
  return Math.max(25, Math.min(400, Math.round(s * 100)));
}
async function fitToWidth() { zoom = await computeFitZoom('width'); document.getElementById('vt-zoom').textContent = zoom + '%'; renderPages(); }
async function fitToHeight() { zoom = await computeFitZoom('height'); document.getElementById('vt-zoom').textContent = zoom + '%'; renderPages(); }
function setLayout(l) { layout = l; document.getElementById('vt-single').classList.toggle('on', l === 'single'); document.getElementById('vt-double').classList.toggle('on', l === 'double'); renderPages(); }
function toggleSidebar() { sidebarOn = !sidebarOn; document.getElementById('sidebar').classList.toggle('hidden', !sidebarOn); }
function applySidebarWidth(px) { sidebarWidth = Math.max(SIDEBAR_MIN_W, Math.min(SIDEBAR_MAX_W, px)); document.getElementById('sidebar').style.setProperty('--sidebar-w', sidebarWidth + 'px'); }
function initSidebarResizer() {
  const resizer = document.getElementById('sidebar-resizer'); let dragging = false;
  resizer.addEventListener('pointerdown', e => { dragging = true; resizer.classList.add('dragging'); resizer.setPointerCapture(e.pointerId); });
  resizer.addEventListener('pointermove', e => { if (!dragging) return; const rect = resizer.parentElement.getBoundingClientRect(); applySidebarWidth(e.clientX - rect.left); });
  function endDrag() {
    if (!dragging) return; dragging = false; resizer.classList.remove('dragging');
    localStorage.setItem('ann:sidebarwidth', sidebarWidth);
    if (pdfDoc) { zoom = Math.max(25, Math.min(400, Math.round(sidebarWidth / SIDEBAR_BASE_W * 100))); document.getElementById('vt-zoom').textContent = zoom + '%'; renderPages(); }
  }
  resizer.addEventListener('pointerup', endDrag); resizer.addEventListener('pointercancel', endDrag);
}
function goToPage(p) {
  curPage = Math.max(1, Math.min(totalPg, p)); renderPages();
  // 필기 모드가 켜진 채로 다른 페이지로 넘어가면, 잠금도 새 페이지를 따라간다 —
  // 이전 페이지 잠금은 풀고 새 페이지를 잠근다(둘 다 보유하면 다른 기기 편집을 과도하게 막음).
  if (Engine.Tools.isPenMode()) {
    const nextPage = currentLockPageId();
    if (nextPage !== lockedPage) { releaseCurrentLock(); acquireLockForCurrentPage(false); }
  }
}
function goToPdfPage(pdfNum) { goToPage(Engine.PageOrder.findPosByPdfPage(pdfNum)); }
function initWheelPageNav() {
  // 필기 도구가 켜져 있어도 휠은 항상 페이지 이동으로 동작해야 한다 — 휠 스크롤은
  // 그림 그리기 제스처(포인터 드래그)와 겹치지 않으므로 펜모드 여부와 무관하다.
  Engine.Page.initWheelNav(document.getElementById('viewer-main'), {
    canNavigate: () => !!pdfDoc && zoom <= 100,
    onDelta: dir => goToPage(curPage + dir)
  });
}
function updatePageInfo() {
  const entry = Engine.PageOrder.getOrderEntry(curPage);
  const isInserted = !!(entry && entry.kind === 'inserted');
  document.getElementById('vt-page-info').textContent = curPage + ' / ' + totalPg;
  document.getElementById('sb-page').textContent = isInserted ? ('삽입 페이지 · ' + (entry.label || '새 페이지')) : ('PDF ' + (entry ? entry.pdfPage : curPage) + 'p');
}

/* ══ 필기 툴바 ════════════════════════════════════════════ */
function togglePen(skipLock) {
  const on = !Engine.Tools.isPenMode();
  Engine.Tools.setPenMode(on);
  document.getElementById('vt-pen').classList.toggle('on', on);
  document.getElementById('pen-toolbar').classList.toggle('show', on);
  Engine.Page.setPenModeClasses(on);
  updateColorPanelVisibility();
  // 필기 도구를 처음 켜는 시점에 현재 페이지 편집 잠금을 시도한다(skipLock은
  // forceLockTakeover가 이미 잠금을 확보해둔 뒤 UI만 켤 때 중복 요청을 피하려고 씀).
  if (!skipLock) { if (on) acquireLockForCurrentPage(false); else releaseCurrentLock(); }
}
function setTool(t) {
  const valid = ['pen', 'hi', 'er', 'select', 'text', 'media'];
  if (Engine.Tools.getTool() === 'select' && t !== 'select') Engine.Page.clearSelection();
  Engine.Tools.setTool(t);
  valid.forEach(x => document.getElementById('pt-' + x).classList.toggle('on', x === t));
  updateColorPanelVisibility();
}
function updateColorPanelVisibility() {
  const g = document.getElementById('pt-color-group');
  g.style.display = (Engine.Tools.isPenMode() && ['pen', 'hi', 'text'].includes(Engine.Tools.getTool())) ? 'flex' : 'none';
}
function setPenSize(val, source) {
  const slider = document.getElementById('pt-size');
  let n = parseInt(val, 10); if (isNaN(n)) n = Engine.Tools.getSize();
  n = Math.max(+slider.min, Math.min(+slider.max, n));
  Engine.Tools.setSize(n);
  if (source !== 'slider') slider.value = n;
  if (source !== 'input') document.getElementById('pt-size-input').value = n;
}
function doUndo() { const action = Engine.Elements.undo(); if (!action) { showToast('되돌릴 작업이 없어요'); return; } Engine.Page.redrawPage(action.pos); showToast('되돌리기'); }
function doRedo() { const action = Engine.Elements.redo(); if (!action) { showToast('다시 실행할 작업이 없어요'); return; } Engine.Page.redrawPage(action.pos); showToast('다시 실행'); }
function clearPage() {
  const p = panelPage();
  if (!confirm('이 페이지의 모든 레이어 필기를 지울까요?')) return;
  Engine.Elements.clearPage(p);
  Engine.Page.redrawPage(p);
  showToast('필기 삭제 완료');
}
async function manualSaveNow() {
  const p = panelPage();
  const btn = document.getElementById('pt-save'); btn.disabled = true;
  try { const r = await Engine.Sync.manualSaveNow(bookId, p); showToast(r.ok ? '✅ 저장됨' : '📴 로컬에 저장됨 (서버 오프라인)'); Sync.updateSyncBadge(); }
  finally { btn.disabled = false; }
}
function triggerImageInsert() {
  if (!Engine.Tools.isPenMode()) { showToast('먼저 ✏️ 필기 모드를 켜주세요'); return; }
  if (Engine.Events.isLocked()) { showToast('페이지 구성을 갱신하는 중이에요 — 잠시 후 다시 시도해주세요'); return; }
  const p = panelPage();
  const layerId = Engine.Elements.getActiveLayerId(p);
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files && input.files[0]; if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const dims = await new Promise(resolve => { const img = new Image(); img.onload = () => resolve({ w: img.naturalWidth || 240, h: img.naturalHeight || 180 }); img.onerror = () => resolve({ w: 240, h: 180 }); img.src = dataUrl; });
      const MAX = 240; let w = dims.w, h = dims.h;
      if (w > MAX || h > MAX) { const r = Math.min(MAX / w, MAX / h); w = Math.round(w * r); h = Math.round(h * r); }
      const size1 = Engine.Page.getPageSize1(p);
      const x = Math.max(0, (size1.w - w) / 2), y = Math.max(0, (size1.h - h) / 2);
      setActiveInkPage(p);
      Engine.Elements.addElement(p, layerId, { type: 'image', src: dataUrl, x, y, width: w, height: h });
      Engine.Page.redrawPage(p);
      showToast('이미지를 삽입했어요 — 드래그로 이동, 모서리로 크기 조절');
    } catch (e) { showToast('이미지를 불러오지 못했어요'); }
  };
  input.click();
}
function readFileAsDataUrl(file) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(file); }); }

/* ══ 레이어 패널 ══════════════════════════════════════════ */
function openLayerPanel() {
  if (!bookId) { showToast('먼저 교재를 열어주세요'); return; }
  renderLayerPanel();
  document.getElementById('lp-device-input').value = Engine.Device.getLabel();
  updateDeviceWarning();
  document.getElementById('layer-panel').classList.add('open');
}
function closeLayerPanel() { document.getElementById('layer-panel').classList.remove('open'); }
function updateDeviceWarning() {
  const el = document.getElementById('lp-device-warning');
  const mine = Engine.Device.getLabel();
  if (Engine.Device.hasNameCollision()) { el.textContent = '⚠️ "' + mine + '" 이름이 다른 기기와 겹쳐요 — 구분되는 이름으로 바꿔주세요'; el.classList.add('show'); }
  else el.classList.remove('show');
}
function setDeviceLabelFromInput() {
  const name = (document.getElementById('lp-device-input').value || '').trim();
  if (!name) { showToast('기기 이름을 입력해주세요'); return; }
  Engine.Device.setLabel(name); updateDeviceWarning();
  showToast('이 기기를 "' + name + '"(으)로 저장했어요');
}
// 구조 변경 신호(kumon:structure-changed)가 잠금 중이면 실제 목록 대신 "갱신 중"
// 안내만 보여준다 — 개별 레이어/페이지 동작마다 이 함수를 따로 부르는 코드를 두지
//않고, handleStructureChanged() 구독 하나가 항상 이 함수를 다시 불러 최신 상태로
// 맞춘다(레이어 추가/삭제/이름변경, 페이지 삽입/삭제/재배치 전부 동일).
function renderLayerPanel() {
  const list = document.getElementById('lp-list');
  const p = panelPage();
  const labelEl = document.getElementById('lp-page-label');
  if (Engine.Events.isLocked()) {
    labelEl.textContent = pageLabel(p) + ' 페이지의 레이어 — ⏳ 갱신 중...';
    list.innerHTML = '<div class="lp-hint">구성이 바뀌어 정보를 다시 불러오는 중이에요…</div>';
    return;
  }
  const layerList = Engine.Elements.getLayerList(p);
  const activeId = Engine.Elements.getActiveLayerId(p);
  labelEl.textContent = pageLabel(p) + ' 페이지의 레이어';
  list.innerHTML = layerList.map(l => `
    <div class="lp-row${l.id === activeId ? ' active' : ''}">
      <input type="checkbox" ${l.visible ? 'checked' : ''} onchange="toggleLayerVisible('${l.id}')">
      <span class="lp-row-name" onclick="setActiveLayer('${l.id}')">${l.name}</span>
      ${l.id === activeId ? '<span class="lp-row-badge">활성</span>' : ''}
      <button class="lp-icon-btn" onclick="renameLayer('${l.id}')">✎</button>
      <button class="lp-icon-btn" onclick="deleteLayerUI('${l.id}')">🗑</button>
    </div>`).join('');
  renderBackupList();
}
function addLayer() {
  const p = panelPage();
  const list = Engine.Elements.getLayerList(p);
  openTextPrompt('"' + pageLabel(p) + '" 페이지에 추가할 새 레이어 이름', '레이어 ' + (list.length + 1), name => {
    Engine.Elements.addLayer(p, name); showToast('"' + name + '" 레이어 추가됨');
  });
}
function renameLayer(id) {
  const p = panelPage();
  const layer = Engine.Elements.getLayerList(p).find(l => l.id === id); if (!layer) return;
  openTextPrompt('레이어 이름 변경', layer.name, name => { Engine.Elements.renameLayer(p, id, name); });
}
function toggleLayerVisible(id) { const p = panelPage(); Engine.Elements.toggleLayerVisible(p, id); Engine.Page.redrawPage(p); }
function setActiveLayer(id) { const p = panelPage(); Engine.Elements.setActiveLayer(p, id); renderLayerPanel(); }
function deleteLayerUI(id) {
  const p = panelPage();
  const layer = Engine.Elements.getLayerList(p).find(l => l.id === id); if (!layer) return;
  if (!confirm('"' + layer.name + '" 레이어를 삭제할까요?\n이 페이지에서 이 레이어에 그린 필기가 함께 삭제됩니다.')) return;
  const r = Engine.Elements.deleteLayer(p, id);
  if (r.error === 'last-layer') { showToast('마지막 남은 레이어는 삭제할 수 없어요'); return; }
  Engine.Page.redrawPage(p); showToast('레이어 삭제 완료');
}
function renderBackupList() {
  const wrap = document.getElementById('lp-backup-list');
  const p = panelPage();
  const backups = Engine.Storage.getBackups(bookId, Engine.PageOrder.pageIdOf(p));
  wrap.innerHTML = backups.length ? backups.map(b => `
    <div class="lp-row"><span class="lp-row-name">${formatBackupTs(b.ts)}</span>
      <button class="lp-icon-btn" onclick="restoreBackupUI('${b.key}')">↩</button>
      <button class="lp-icon-btn" onclick="deleteBackupUI('${b.key}')">🗑</button></div>`).join('') : '<div class="lp-hint">이 페이지에 보관된 백업이 없어요</div>';
}
function formatBackupTs(ts) { const m = ts.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})$/); return m ? (+m[2] + '/' + +m[3] + ' ' + m[4] + ':' + m[5]) : ts; }
function restoreBackupUI(key) {
  const p = panelPage();
  const backup = Engine.Storage.restoreBackup(key); if (!backup) return;
  if (!confirm('이 백업 내용으로 복원할까요?')) return;
  const rec = Engine.Elements.record(p);
  Engine.Storage.stashBackup(bookId, Engine.PageOrder.pageIdOf(p), { layers: rec.layers, strokes: rec.strokes });
  if (Array.isArray(backup.layers) && backup.layers.length) rec.layers = backup.layers;
  rec.strokes = backup.strokes || {};
  Engine.Storage.saveLayer(bookId, Engine.PageOrder.pageIdOf(p), rec);
  Engine.Page.redrawPage(p); renderLayerPanel(); showToast('백업을 복원했어요');
}
function deleteBackupUI(key) { if (!confirm('이 백업을 삭제할까요? 되돌릴 수 없어요.')) return; Engine.Storage.deleteBackup(key); renderLayerPanel(); }

/* ══ 이동 가능한 팝업(다이얼로그) ══════════════════════════
   상단 제목 영역을 손잡이로 드래그해서 팝업을 옮길 수 있게 한다. 화면 밖으로
   완전히 나가지 않도록 최소 여백은 항상 보이게 제한하고, 옮긴 위치는 이 팝업을
   닫을 때까지만 유지한다 — 다음에 열 때는 resetDialogPosition()으로 기본
   위치(부모의 flex 중앙정렬)로 되돌아간다. */
function makeDialogDraggable(boxId, handleId) {
  const box = document.getElementById(boxId), handle = document.getElementById(handleId);
  if (!box || !handle) return;
  let dragging = false, pointerId = null, startX = 0, startY = 0, origLeft = 0, origTop = 0;
  handle.addEventListener('pointerdown', e => {
    dragging = true; pointerId = e.pointerId;
    const r = box.getBoundingClientRect();
    box.style.position = 'fixed'; box.style.left = r.left + 'px'; box.style.top = r.top + 'px'; box.style.margin = '0';
    origLeft = r.left; origTop = r.top; startX = e.clientX; startY = e.clientY;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', e => {
    if (!dragging || e.pointerId !== pointerId) return;
    const r = box.getBoundingClientRect();
    const margin = 24; // 이 정도는 항상 화면 안에 남아있게
    let left = origLeft + (e.clientX - startX), top = origTop + (e.clientY - startY);
    left = Math.max(margin - r.width, Math.min(left, window.innerWidth - margin));
    top = Math.max(0, Math.min(top, window.innerHeight - margin));
    box.style.left = left + 'px'; box.style.top = top + 'px';
  });
  function endDrag(e) { if (e && e.pointerId !== pointerId) return; dragging = false; pointerId = null; }
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
}
function resetDialogPosition(boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  box.style.position = ''; box.style.left = ''; box.style.top = ''; box.style.margin = '';
}

/* ══ 텍스트 요소 편집 ═════════════════════════════════════ */
let textElModalCtx = null, teBold = false, textEditColorSnapshot = null;
function toggleTextBold() { teBold = !teBold; document.getElementById('te-bold').classList.toggle('on', teBold); }
function openTextElementModal(pos, layerId, x, y, existing) {
  resetDialogPosition('te-box'); // 이전에 옮겨놨던 위치는 버리고 매번 기본(중앙) 위치로 연다
  textElModalCtx = { pos, layerId, x, y, existing };
  document.getElementById('te-content').value = existing ? (existing.content || '') : '';
  document.getElementById('te-fontsize').value = existing ? (existing.fontSize || 16) : 16;
  teBold = existing ? !!existing.bold : false;
  document.getElementById('te-bold').classList.toggle('on', teBold);
  const fontSel = document.getElementById('te-font');
  fontSel.value = existing && existing.fontFamily ? existing.fontFamily : 'gothic';
  applyTextFontPreview(fontSel.value);
  // 기존 텍스트를 편집할 땐 그 텍스트의 색으로 팔레트 선택을 맞추고, 취소하면 원래 펜 색으로 되돌린다.
  textEditColorSnapshot = existing ? Engine.Tools.getColor() : null;
  if (existing && existing.color) Engine.Tools.setColor(existing.color);
  syncColorSwatchesUI();
  document.getElementById('te-delete').style.display = existing ? '' : 'none';
  document.getElementById('text-el-modal').classList.add('open');
  updateColorPanelVisibility();
  setTimeout(() => document.getElementById('te-content').focus(), 50);
}
function closeTextElementModal() { document.getElementById('text-el-modal').classList.remove('open'); textElModalCtx = null; textEditColorSnapshot = null; }
function cancelTextElementModal() { if (textEditColorSnapshot !== null) { Engine.Tools.setColor(textEditColorSnapshot); syncColorSwatchesUI(); } closeTextElementModal(); }
function saveTextElement() {
  if (!textElModalCtx) return;
  const { pos, layerId, x, y, existing } = textElModalCtx;
  const content = document.getElementById('te-content').value.trim();
  if (!content) { showToast('내용을 입력해주세요'); return; }
  const fontSize = Math.max(8, Math.min(72, parseInt(document.getElementById('te-fontsize').value, 10) || 16));
  const fontFamily = document.getElementById('te-font').value;
  if (existing) {
    Engine.Elements.updateElement(pos, layerId, existing.id,
      { content: existing.content, fontSize: existing.fontSize, color: existing.color, bold: !!existing.bold, fontFamily: existing.fontFamily || 'gothic' },
      { content, fontSize, color: Engine.Tools.getColor(), bold: teBold, fontFamily });
  } else {
    Engine.Elements.addElement(pos, layerId, { type: 'text', content, x, y, fontSize, color: Engine.Tools.getColor(), bold: teBold, fontFamily });
  }
  Engine.Page.redrawPage(pos);
  closeTextElementModal();
}
function applyTextFontPreview(fontKey) {
  document.getElementById('te-content').style.fontFamily = Engine.Page.TEXT_FONT_FAMILIES[fontKey] || '';
}
function deleteTextElement() {
  if (!textElModalCtx || !textElModalCtx.existing) return;
  const { pos, layerId, existing } = textElModalCtx;
  Engine.Elements.deleteElement(pos, layerId, existing.id);
  Engine.Page.redrawPage(pos);
  closeTextElementModal(); showToast('텍스트 삭제 완료');
}

/* ══ 이미지 요소 ══════════════════════════════════════════ */
let imageElModalCtx = null;
let pendingOpacity = null, pendingBrightness = null; // 슬라이더는 저장을 눌러야 확정 — 그 전엔 미리보기에만 반영
function openImageElementModal(pos, layerId, el) {
  resetDialogPosition('ie-box'); // 이전에 옮겨놨던 위치는 버리고 매번 기본(중앙) 위치로 연다
  cancelImageCrop();
  imageElModalCtx = { pos, layerId, el };
  const opacity = el.opacity != null ? el.opacity : 1, brightness = el.brightness != null ? el.brightness : 1;
  const preview = document.getElementById('ie-preview');
  preview.src = Engine.Storage.normalizeAssetSrc(el.src);
  preview.style.opacity = opacity;
  preview.style.filter = brightness !== 1 ? 'brightness(' + brightness + ')' : '';
  document.getElementById('ie-opacity').value = Math.round(opacity * 100);
  document.getElementById('ie-brightness').value = Math.round(brightness * 100);
  pendingOpacity = null; pendingBrightness = null;
  document.getElementById('ie-desc').value = el.description || '';
  document.getElementById('image-el-modal').classList.add('open');
}
function closeImageElementModal() { cancelImageCrop(); document.getElementById('image-el-modal').classList.remove('open'); imageElModalCtx = null; }
function deleteImageElement() {
  if (!imageElModalCtx) return;
  const { pos, layerId, el } = imageElModalCtx;
  Engine.Elements.deleteElement(pos, layerId, el.id);
  Engine.Page.redrawPage(pos);
  closeImageElementModal(); showToast('이미지 삭제 완료');
}
// 설명/투명도/밝기를 한 번에 저장 — 회전/반전/교체/자르기는 각각 즉시 적용되는 별도 동작.
function saveImageEdits() {
  if (!imageElModalCtx) return;
  const { pos, layerId, el } = imageElModalCtx;
  const description = document.getElementById('ie-desc').value.trim();
  const from = { description: el.description || '', opacity: el.opacity != null ? el.opacity : 1, brightness: el.brightness != null ? el.brightness : 1 };
  const to = {
    description,
    opacity: pendingOpacity != null ? pendingOpacity : from.opacity,
    brightness: pendingBrightness != null ? pendingBrightness : from.brightness
  };
  if (JSON.stringify(from) !== JSON.stringify(to)) {
    Engine.Elements.updateElement(pos, layerId, el.id, from, to);
    Engine.Page.redrawPage(pos);
  }
  closeImageElementModal();
}
function onImageOpacityInput(val) { pendingOpacity = val / 100; document.getElementById('ie-preview').style.opacity = pendingOpacity; }
function onImageBrightnessInput(val) { pendingBrightness = val / 100; document.getElementById('ie-preview').style.filter = 'brightness(' + pendingBrightness + ')'; }
// "교체"는 기존 위치·크기·회전값은 그대로 두고 src(내용)만 바꾼다 — 다시 배치할 필요 없음.
function replaceImageElement() {
  if (!imageElModalCtx) return;
  const { pos, layerId, el } = imageElModalCtx;
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files && input.files[0]; if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      Engine.Elements.updateElement(pos, layerId, el.id, { src: el.src }, { src: dataUrl });
      document.getElementById('ie-preview').src = dataUrl;
      Engine.Page.redrawPage(pos);
      showToast('이미지를 교체했어요');
    } catch (e) { showToast('이미지를 불러오지 못했어요'); }
  };
  input.click();
}
// 90도씩 회전 — 회전할 때마다 바운딩 박스의 가로/세로가 서로 바뀐다(100x60 → 60x100).
function rotateImageElement() {
  if (!imageElModalCtx) return;
  const { pos, layerId, el } = imageElModalCtx;
  const from = { rotation: el.rotation || 0, width: el.width, height: el.height };
  const to = { rotation: (from.rotation + 90) % 360, width: el.height, height: el.width };
  Engine.Elements.updateElement(pos, layerId, el.id, from, to);
  Engine.Page.redrawPage(pos);
}
function flipImageElement(axis) {
  if (!imageElModalCtx) return;
  const { pos, layerId, el } = imageElModalCtx;
  const key = axis === 'h' ? 'flipH' : 'flipV';
  const from = {}, to = {};
  from[key] = !!el[key]; to[key] = !el[key];
  Engine.Elements.updateElement(pos, layerId, el.id, from, to);
  Engine.Page.redrawPage(pos);
}

/* ── 자르기: 미리보기 위에 드래그로 사각 영역을 지정 → 캔버스로 잘라서 새 이미지로 교체 ──
   원본(회전·반전 적용 전) 이미지를 기준으로 자른다 — 팝업의 ie-preview는 항상
   회전/반전 없이 원본 그대로를 보여주므로 좌표 계산이 단순해진다. */
let cropCtx = null;
function startImageCrop() {
  if (!imageElModalCtx) return;
  document.getElementById('ie-normal-actions').style.display = 'none';
  document.getElementById('ie-crop-actions').style.display = 'flex';
  const overlay = document.getElementById('ie-crop-overlay');
  overlay.style.display = 'block';
  overlay.innerHTML = '';
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;border:2px dashed #e8401c;background:rgba(232,64,28,0.15);display:none;pointer-events:none;';
  overlay.appendChild(box);
  cropCtx = { rect: null };
  let dragging = false, startX = 0, startY = 0;
  overlay.onpointerdown = e => {
    dragging = true;
    const r = overlay.getBoundingClientRect();
    startX = e.clientX - r.left; startY = e.clientY - r.top;
    box.style.left = startX + 'px'; box.style.top = startY + 'px'; box.style.width = '0px'; box.style.height = '0px'; box.style.display = 'block';
    overlay.setPointerCapture(e.pointerId);
  };
  overlay.onpointermove = e => {
    if (!dragging) return;
    const r = overlay.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const left = Math.max(0, Math.min(startX, x)), top = Math.max(0, Math.min(startY, y));
    const w = Math.abs(x - startX), h = Math.abs(y - startY);
    box.style.left = left + 'px'; box.style.top = top + 'px'; box.style.width = w + 'px'; box.style.height = h + 'px';
    cropCtx.rect = { left, top, w, h };
  };
  overlay.onpointerup = () => { dragging = false; };
  overlay.onpointercancel = () => { dragging = false; };
}
function cancelImageCrop() {
  const overlay = document.getElementById('ie-crop-overlay');
  overlay.style.display = 'none'; overlay.onpointerdown = overlay.onpointermove = overlay.onpointerup = overlay.onpointercancel = null;
  document.getElementById('ie-normal-actions').style.display = 'flex';
  document.getElementById('ie-crop-actions').style.display = 'none';
  cropCtx = null;
}
function confirmImageCrop() {
  if (!imageElModalCtx || !cropCtx || !cropCtx.rect || cropCtx.rect.w < 4 || cropCtx.rect.h < 4) { showToast('자를 영역을 드래그로 지정해주세요'); return; }
  const { pos, layerId, el } = imageElModalCtx;
  const preview = document.getElementById('ie-preview');
  const dispW = preview.clientWidth, dispH = preview.clientHeight;
  const natW = preview.naturalWidth || dispW, natH = preview.naturalHeight || dispH;
  const sx = (cropCtx.rect.left / dispW) * natW, sy = (cropCtx.rect.top / dispH) * natH;
  const sw = (cropCtx.rect.w / dispW) * natW, sh = (cropCtx.rect.h / dispH) * natH;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw)); canvas.height = Math.max(1, Math.round(sh));
  canvas.getContext('2d').drawImage(preview, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const newSrc = canvas.toDataURL('image/png');
  const newHeight = el.width * (canvas.height / canvas.width); // 가로 폭은 유지, 새 비율에 맞춰 높이만 조정
  const from = { src: el.src, width: el.width, height: el.height };
  const to = { src: newSrc, width: el.width, height: newHeight };
  Engine.Elements.updateElement(pos, layerId, el.id, from, to);
  preview.src = newSrc;
  Engine.Page.redrawPage(pos);
  cancelImageCrop();
  showToast('이미지를 잘랐어요');
}

/* ══ 오디오/영상 핀 ═══════════════════════════════════════ */
let mediaElModalCtx = null;
function isVideoSrc(src) { return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(src || ''); }
function renderMediaExisting(existing) {
  const wrap = document.getElementById('me-existing');
  if (!existing || !existing.fileSrc) { wrap.innerHTML = ''; return; }
  const src = Engine.Storage.normalizeAssetSrc(existing.fileSrc);
  wrap.innerHTML = isVideoSrc(src) ? `<video controls style="max-width:100%;max-height:160px;" src="${src}"></video>` : `<audio controls style="width:100%;" src="${src}"></audio>`;
}
function openMediaElementModal(pos, layerId, x, y, existing, readonly) {
  mediaElModalCtx = { pos, layerId, x, y, existing, pendingFile: null, readonly: !!readonly };
  document.getElementById('me-title').textContent = readonly ? '오디오/영상' : '오디오/영상 핀';
  document.getElementById('me-edit-fields').style.display = readonly ? 'none' : '';
  document.getElementById('me-edit-actions').style.display = readonly ? 'none' : 'flex';
  document.getElementById('me-view-actions').style.display = readonly ? 'flex' : 'none';
  if (readonly) {
    const desc = document.getElementById('me-view-desc');
    desc.textContent = (existing && existing.description) || ''; desc.style.display = (existing && existing.description) ? '' : 'none';
  } else {
    document.getElementById('me-link').value = existing ? (existing.linkUrl || '') : '';
    document.getElementById('me-desc').value = existing ? (existing.description || '') : '';
    document.getElementById('me-file-input').value = '';
    document.getElementById('me-delete').style.display = existing ? '' : 'none';
  }
  document.getElementById('me-open-link').style.display = (existing && existing.linkUrl) ? '' : 'none';
  renderMediaExisting(existing);
  document.getElementById('media-el-modal').classList.add('open');
}
function closeMediaElementModal() { document.getElementById('media-el-modal').classList.remove('open'); mediaElModalCtx = null; }
async function onMediaFilePicked(input) {
  const file = input.files && input.files[0]; if (!mediaElModalCtx || !file) return;
  try { const dataUrl = await readFileAsDataUrl(file); mediaElModalCtx.pendingFile = { dataUrl, filename: file.name }; renderMediaExisting({ fileSrc: dataUrl }); showToast('파일을 선택했어요 — 저장을 눌러야 반영돼요'); }
  catch (e) { showToast('파일을 읽지 못했어요'); }
}
function openMediaLink() { const url = mediaElModalCtx && mediaElModalCtx.existing && mediaElModalCtx.existing.linkUrl; if (url) window.open(url, '_blank', 'noopener'); }
function saveMediaElement() {
  if (!mediaElModalCtx) return;
  const { pos, layerId, x, y, existing, pendingFile } = mediaElModalCtx;
  const linkUrl = document.getElementById('me-link').value.trim();
  const description = document.getElementById('me-desc').value.trim();
  const fileSrc = pendingFile ? pendingFile.dataUrl : (existing ? existing.fileSrc : null);
  if (!linkUrl && !fileSrc) { showToast('링크 또는 파일 중 하나는 있어야 해요'); return; }
  if (existing) {
    Engine.Elements.updateElement(pos, layerId, existing.id,
      { linkUrl: existing.linkUrl, description: existing.description, fileSrc: existing.fileSrc },
      { linkUrl: linkUrl || null, description, fileSrc: fileSrc || null });
  } else {
    Engine.Elements.addElement(pos, layerId, { type: 'media', linkUrl: linkUrl || null, description, fileSrc: fileSrc || null, x, y });
  }
  Engine.Page.redrawPage(pos);
  closeMediaElementModal();
}
function deleteMediaElement() {
  if (!mediaElModalCtx || !mediaElModalCtx.existing) return;
  const { pos, layerId, existing } = mediaElModalCtx;
  Engine.Elements.deleteElement(pos, layerId, existing.id);
  Engine.Page.redrawPage(pos);
  closeMediaElementModal(); showToast('삭제 완료');
}

/* ══ 텍스트 입력 다이얼로그 (레이어 이름 등) ══════════════ */
let textPromptOnConfirm = null;
function openTextPrompt(title, defaultValue, onConfirm) {
  document.getElementById('tp-title').textContent = title;
  const input = document.getElementById('tp-input'); input.value = defaultValue || '';
  textPromptOnConfirm = onConfirm;
  document.getElementById('text-prompt-modal').classList.add('open');
  setTimeout(() => { input.focus(); input.select(); }, 50);
}
function closeTextPrompt(confirmed) {
  document.getElementById('text-prompt-modal').classList.remove('open');
  const cb = textPromptOnConfirm; textPromptOnConfirm = null;
  if (!confirmed || !cb) return;
  const name = document.getElementById('tp-input').value.trim();
  if (name) cb(name);
}

/* ══ 색상 선택 — 상단 툴바(pt-colors)와 텍스트 입력 팝업(te-colors)이
   같은 6색 스와치 컴포넌트를 그대로 재사용한다. 둘 중 어느 쪽에서 색을 바꿔도
   Engine.Tools의 색상 상태 하나만 바뀌고, syncColorSwatchesUI()가 두 곳 모두
   동시에 다시 그려서 "다이얼로그와 툴바가 서로 다른 색을 보여주는" 혼란을 막는다. ══ */
const COLOR_SWATCH_CONTAINERS = ['pt-colors', 'te-colors'];
const COLOR_MORE_BUTTONS = ['pt-color-more', 'te-color-more'];
function buildColorSwatches() {
  COLOR_SWATCH_CONTAINERS.forEach(containerId => {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    wrap.innerHTML = '';
    Engine.Color.PEN_COLORS.forEach(c => {
      const d = document.createElement('div');
      d.className = 'pt-color'; d.style.background = c;
      d.onclick = () => { Engine.Tools.setColor(c); syncColorSwatchesUI(); };
      wrap.appendChild(d);
    });
  });
  syncColorSwatchesUI();
}
// 지금 선택된 색(Engine.Tools.getColor())이 6색 중 하나면 그 스와치에 "on" 표시,
// 아니면(커스텀 색) "더보기" 버튼에 표시 — pt-colors/te-colors 양쪽 모두 동일하게 반영.
function syncColorSwatchesUI() {
  const cur = Engine.Tools.getColor();
  const presetIdx = Engine.Color.PEN_COLORS.indexOf(cur);
  COLOR_SWATCH_CONTAINERS.forEach(containerId => {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    Array.from(wrap.children).forEach((el, i) => el.classList.toggle('on', i === presetIdx));
  });
  COLOR_MORE_BUTTONS.forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.toggle('on', presetIdx < 0);
    if (presetIdx < 0) btn.style.background = cur;
  });
}
function applyPenColor(color) { Engine.Tools.setColor(color); syncColorSwatchesUI(); }
let cpHue = 0, cpSat = 0, cpVal = 0, cpNewColor = '#1a1814';
function openColorPicker() {
  document.getElementById('cp-preview-cur').style.background = Engine.Tools.getColor();
  const rgb = Engine.Color.hexToRgb(Engine.Tools.getColor()) || { r: 26, g: 24, b: 20 };
  const hsv = Engine.Color.rgbToHsv(rgb.r, rgb.g, rgb.b);
  cpHue = hsv.h; cpSat = hsv.s; cpVal = hsv.v;
  if (!document.getElementById('cp-hex-grid').children.length) buildStandardPalette();
  switchColorTab('std');
  document.getElementById('color-picker-modal').classList.add('open');
}
function closeColorPicker() { document.getElementById('color-picker-modal').classList.remove('open'); }
function confirmColorPicker() { applyPenColor(cpNewColor); closeColorPicker(); }
function switchColorTab(tab) {
  document.getElementById('cp-tab-std').classList.toggle('on', tab === 'std');
  document.getElementById('cp-tab-custom').classList.toggle('on', tab === 'custom');
  document.getElementById('cp-pane-std').style.display = tab === 'std' ? '' : 'none';
  document.getElementById('cp-pane-custom').style.display = tab === 'custom' ? '' : 'none';
  if (tab === 'custom') renderCustomTab();
}
function buildStandardPalette() {
  const rows = Engine.Color.buildStandardPaletteRows();
  const grid = document.getElementById('cp-hex-grid'); grid.innerHTML = '';
  rows.forEach((row, ri) => {
    const rowEl = document.createElement('div'); rowEl.className = 'cp-hex-row' + (ri % 2 === 1 ? ' offset' : '');
    row.forEach(hex => {
      const cell = document.createElement('div'); cell.className = 'cp-hex'; cell.style.background = hex; cell.title = hex;
      cell.onclick = () => selectStandardColor(hex, cell);
      rowEl.appendChild(cell);
    });
    grid.appendChild(rowEl);
  });
}
function selectStandardColor(hex, cell) {
  cpNewColor = hex;
  document.getElementById('cp-preview-new').style.background = hex;
  document.querySelectorAll('.cp-hex').forEach(c => c.classList.remove('on')); cell.classList.add('on');
  const rgb = Engine.Color.hexToRgb(hex); const hsv = Engine.Color.rgbToHsv(rgb.r, rgb.g, rgb.b);
  cpHue = hsv.h; cpSat = hsv.s; cpVal = hsv.v;
}
function renderCustomTab(skip) {
  const rgb = Engine.Color.hsvToRgb(cpHue, cpSat, cpVal);
  cpNewColor = Engine.Color.rgbToHex(rgb.r, rgb.g, rgb.b);
  document.getElementById('cp-preview-new').style.background = cpNewColor;
  if (skip !== 'r') document.getElementById('cp-r').value = rgb.r;
  if (skip !== 'g') document.getElementById('cp-g').value = rgb.g;
  if (skip !== 'b') document.getElementById('cp-b').value = rgb.b;
  if (skip !== 'hex') document.getElementById('cp-hex').value = cpNewColor.slice(1).toUpperCase();
  if (skip !== 'hue') document.getElementById('cp-hue').value = Math.round(cpHue);
  Engine.Color.drawSpectrum(document.getElementById('cp-spectrum'), cpHue);
  positionSpectrumCursor();
}
function positionSpectrumCursor() {
  const canvas = document.getElementById('cp-spectrum'), cursor = document.getElementById('cp-spectrum-cursor');
  cursor.style.left = (cpSat * canvas.clientWidth) + 'px'; cursor.style.top = ((1 - cpVal) * canvas.clientHeight) + 'px';
}
function onHueChange(val) { cpHue = +val; renderCustomTab('hue'); }
function clamp255(v) { v = parseInt(v, 10); if (isNaN(v)) v = 0; return Math.max(0, Math.min(255, v)); }
function onRgbInput(field) {
  const r = clamp255(document.getElementById('cp-r').value), g = clamp255(document.getElementById('cp-g').value), b = clamp255(document.getElementById('cp-b').value);
  const hsv = Engine.Color.rgbToHsv(r, g, b); cpHue = hsv.h; cpSat = hsv.s; cpVal = hsv.v; renderCustomTab(field);
}
function onHexInput(val) {
  const rgb = Engine.Color.hexToRgb(val); if (!rgb) return;
  const hsv = Engine.Color.rgbToHsv(rgb.r, rgb.g, rgb.b); cpHue = hsv.h; cpSat = hsv.s; cpVal = hsv.v; renderCustomTab('hex');
}
function initSpectrumEvents() {
  Engine.Color.wireSpectrumPicker(document.getElementById('cp-spectrum'), (x, y) => { cpSat = x; cpVal = y; renderCustomTab(); });
}

/* ══ 목차 ═════════════════════════════════════════════════ */
function openBookmark() { document.getElementById('bookmark-modal').classList.add('open'); renderBookmarkList(); }
function closeBookmark() { document.getElementById('bookmark-modal').classList.remove('open'); }
function renderBookmarkList() {
  const list = document.getElementById('bm-list');
  const prevScroll = list.scrollTop; list.innerHTML = '';
  function addSection(title) {
    const sec = document.createElement('div');
    sec.style.cssText = 'padding:6px 16px;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-light);background:var(--bg);border-bottom:1px solid var(--border);';
    sec.textContent = title; list.appendChild(sec);
  }
  const map = PAGE_MAPS[bookId] || [];
  if (map.length) {
    let frontAdded = false, contentAdded = false;
    map.forEach(entry => {
      const curEntry = Engine.PageOrder.getOrderEntry(curPage);
      const isCur = !!(curEntry && curEntry.kind === 'pdf' && curEntry.pdfPage === entry.pdf);
      const row = document.createElement('div'); row.className = 'bm-item' + (isCur ? ' cur' : '');
      if (entry.type === 'front' && !frontAdded) { addSection('앞부분 · 참고자료'); frontAdded = true; }
      if (entry.type === 'content' && !contentAdded) { addSection('본문 페이지'); contentAdded = true; }
      const pgLabel = entry.type === 'front' ? '—' : ('G' + entry.edu);
      row.innerHTML = `<div style="display:flex;flex-direction:column;gap:2px;flex:1;">
        <div style="font-size:13px;font-weight:${isCur ? '700' : '500'};color:${isCur ? 'var(--accent)' : 'var(--ink)'};">${entry.label}</div>
        <div style="font-size:11px;color:var(--ink-mid);">${entry.sub}</div></div>
        <div style="font-family:var(--mono);font-size:11px;color:${isCur ? 'var(--accent)' : 'var(--ink-light)'};min-width:28px;text-align:right;">${pgLabel}</div>`;
      row.onclick = () => goToPdfPage(entry.pdf);
      list.appendChild(row);
    });
  } else {
    for (let i = 1; i <= totalPg; i++) {
      const isCur = i === curPage;
      const item = document.createElement('div'); item.className = 'bm-item' + (isCur ? ' cur' : '');
      item.innerHTML = `<div class="bm-lbl">${pageLabel(i)}</div><div class="bm-pg">${i}p</div>`;
      item.onclick = () => goToPage(i);
      list.appendChild(item);
    }
  }
  list.scrollTop = prevScroll;
}

/* ══ PDF 텍스트 검색 ══════════════════════════════════════ */
function togglePdfSearch() {
  const bar = document.getElementById('pdf-search-bar');
  const show = bar.classList.toggle('show');
  if (show) setTimeout(() => document.getElementById('pdf-search-inp').focus(), 100); else closePdfSearch();
}
function closePdfSearch() {
  document.getElementById('pdf-search-bar').classList.remove('show');
  document.getElementById('pdf-search-inp').value = '';
  pdfSearchMatches = []; pdfSearchIdx = -1; pdfSearchQuery = '';
  clearHighlights();
  document.getElementById('pdf-scount').textContent = '결과 없음';
}
function pdfSearchLive(val) {
  clearTimeout(pdfSearchTimer);
  if (!val.trim()) { document.getElementById('pdf-scount').textContent = '결과 없음'; return; }
  pdfSearchTimer = setTimeout(() => runPdfSearch(val), 500);
}
async function runPdfSearch(query) {
  if (!pdfDoc) return;
  pdfSearchMatches = []; pdfSearchQuery = query.trim();
  const q = query.toLowerCase().trim();
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    try {
      const pg = await pdfDoc.getPage(p);
      const tc = await pg.getTextContent();
      const text = tc.items.map(i => i.str).join(' ').toLowerCase();
      if (text.includes(q)) pdfSearchMatches.push({ page: p });
    } catch (e) { }
  }
  if (!pdfSearchMatches.length) { document.getElementById('pdf-scount').textContent = '결과 없음'; showToast('"' + query + '" 검색 결과 없음'); pdfSearchQuery = ''; return; }
  pdfSearchIdx = 0;
  document.getElementById('pdf-scount').textContent = '1 / ' + pdfSearchMatches.length + '페이지';
  goToPdfPage(pdfSearchMatches[0].page);
  showToast('🔍 "' + query + '" — ' + pdfSearchMatches.length + '개 페이지 발견');
}
async function applyHighlight(pos, vp, query) {
  const layer = document.getElementById('hl-layer-' + pos); if (!layer) return;
  layer.innerHTML = '';
  const entry = Engine.PageOrder.getOrderEntry(pos);
  if (!entry || entry.kind === 'inserted') return;
  const pdfNum = entry.pdfPage, q = query.toLowerCase().trim();
  try {
    const page = await pdfDoc.getPage(pdfNum);
    const tc = await page.getTextContent();
    tc.items.forEach(item => {
      const str = item.str.toLowerCase(); if (!str.includes(q)) return;
      const tx = item.transform, pdfX = tx[4], pdfY = tx[5], fw = item.width, fh = Math.abs(tx[3]) || item.height || 12;
      const [a, b, c, d, e, f] = vp.transform;
      const screenX = a * pdfX + c * pdfY + e, screenY = b * pdfX + d * pdfY + f;
      const fullLen = item.str.length, charW = fw > 0 ? fw / fullLen : 8;
      let searchFrom = 0;
      while (true) {
        const idx = str.indexOf(q, searchFrom); if (idx < 0) break;
        const offsetX = idx * charW * (a || 1), kwW = q.length * charW * Math.abs(a || 1), kwH = fh * Math.abs(d || 1);
        const box = document.createElement('div'); box.className = 'hl-box';
        const focusPage = pdfSearchMatches[pdfSearchIdx] && pdfSearchMatches[pdfSearchIdx].page;
        if (pdfNum === focusPage) box.classList.add('current');
        box.style.left = (screenX + offsetX - 2) + 'px'; box.style.top = (screenY - kwH - 2) + 'px';
        box.style.width = (kwW + 4) + 'px'; box.style.height = (kwH + 4) + 'px';
        layer.appendChild(box);
        searchFrom = idx + q.length;
      }
    });
  } catch (e) { }
}
async function refreshHighlights() {
  if (!pdfSearchQuery) { clearHighlights(); return; }
  const scale = zoom / 100;
  const pages = layout === 'single' ? [curPage] : (curPage % 2 === 0 ? [curPage - 1, curPage] : [curPage, curPage + 1]);
  for (const p of pages) {
    if (p < 1 || p > totalPg) continue;
    const entry = Engine.PageOrder.getOrderEntry(p); if (!entry || entry.kind === 'inserted') continue;
    const page = await pdfDoc.getPage(entry.pdfPage); const vp = page.getViewport({ scale });
    await applyHighlight(p, vp, pdfSearchQuery);
  }
}
function clearHighlights() { document.querySelectorAll('.hl-layer').forEach(l => l.innerHTML = ''); }
function pdfNextMatch() { if (!pdfSearchMatches.length) return; pdfSearchIdx = (pdfSearchIdx + 1) % pdfSearchMatches.length; document.getElementById('pdf-scount').textContent = (pdfSearchIdx + 1) + ' / ' + pdfSearchMatches.length + '페이지'; goToPdfPage(pdfSearchMatches[pdfSearchIdx].page); }
function pdfPrevMatch() { if (!pdfSearchMatches.length) return; pdfSearchIdx = (pdfSearchIdx - 1 + pdfSearchMatches.length) % pdfSearchMatches.length; document.getElementById('pdf-scount').textContent = (pdfSearchIdx + 1) + ' / ' + pdfSearchMatches.length + '페이지'; goToPdfPage(pdfSearchMatches[pdfSearchIdx].page); }

/* ══ 동기화 상태/충돌 ═════════════════════════════════════ */
const Sync = (function () {
  let conflictCtx = null;
  async function checkPageSyncUI(pos) {
    if (!bookId) return;
    const r = await Engine.Sync.checkPageSync(bookId, pos);
    if (r.status === 'conflict') openConflictModal(pos, r.serverJson);
    updateSyncBadge();
  }
  function updateSyncBadge() {
    const el = document.getElementById('sb-sync');
    if (!Engine.PWA.isServerOnline()) { el.textContent = '📴 오프라인(로컬 저장만)'; el.className = 'sb-sync offline'; }
    else { el.textContent = '✅ 저장됨'; el.className = 'sb-sync saved'; }
  }
  function relativeTimeKo(iso) {
    if (!iso) return '알 수 없음';
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return '방금'; if (min < 60) return min + '분 전';
    const hr = Math.round(min / 60); if (hr < 24) return hr + '시간 전';
    return new Date(iso).toLocaleString('ko-KR');
  }
  function openConflictModal(pos, serverJson) {
    conflictCtx = { pos, serverJson };
    const localName = Engine.Device.getLabel(), serverName = serverJson.device || '다른 기기';
    Engine.Device.noteOtherDevice(serverName, serverJson.deviceId);
    const rec = Engine.Elements.record(pos);
    document.getElementById('cf-page-label').textContent = pageLabel(pos);
    document.getElementById('cf-local-device').textContent = localName;
    document.getElementById('cf-server-device').textContent = serverName;
    document.getElementById('cf-btn-local').textContent = localName + ' 내용 사용';
    document.getElementById('cf-btn-server').textContent = serverName + ' 내용 사용';
    showConflictPreview('local');
    document.getElementById('conflict-modal').classList.add('open');
  }
  async function showConflictPreview(which) {
    document.querySelectorAll('.cf-preview-tab').forEach(b => b.classList.toggle('on', b.dataset.which === which));
    if (!conflictCtx) return;
    const { pos, serverJson } = conflictCtx;
    const rec = Engine.Elements.record(pos);
    const data = which === 'local' ? rec.strokes : (serverJson.strokes || {});
    const layers = which === 'local' ? rec.layers : (serverJson.layers || []);
    const canvas = document.getElementById('cf-preview-canvas'); const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    let scale = 0.15;
    try { if (pdfDoc) { const vp = await getPageViewport1(pos); scale = canvas.width / vp.width; } } catch (e) { }
    layers.forEach(l => {
      if (l.visible === false) return;
      const strokes = data[l.id]; if (!strokes || !strokes.length) return;
      strokes.forEach(s => { if (!s.type || s.type === 'ink') Engine.Ink.paintStroke(ctx, s, scale); });
    });
  }
  async function resolveConflictChoice(choice) {
    if (!conflictCtx) return;
    await Engine.Sync.resolveConflict(bookId, conflictCtx.pos, choice, conflictCtx.serverJson);
    document.getElementById('conflict-modal').classList.remove('open');
    if (choice === 'both') showToast('다른 기기의 필기를 백업으로 보관했어요 — 레이어 관리 패널에서 복원할 수 있어요');
    conflictCtx = null;
    if (document.getElementById('layer-panel').classList.contains('open')) renderLayerPanel();
  }
  return { checkPageSyncUI, updateSyncBadge, showConflictPreview, resolveConflictChoice };
})();
function showConflictPreview(which) { Sync.showConflictPreview(which); }
function resolveConflictChoice(choice) { Sync.resolveConflictChoice(choice); }

/* ══ PWA / 상태줄 ═════════════════════════════════════════ */
async function checkServerHealth() {
  const { online } = await Engine.PWA.refreshServerOnline(3000);
  const sl = document.getElementById('statusline');
  sl.classList.toggle('online', online); sl.classList.toggle('offline', !online);
  document.getElementById('sl-text').textContent = online ? '서버 연결됨 · ' + Engine.Device.getLabel() : '오프라인 모드 · 캐시된 자료';
  document.getElementById('offline-banner').classList.toggle('show', !online);
  Sync.updateSyncBadge();
  // 전체 교재 오프라인 저장은 상단 📥 아이콘을 직접 눌렀을 때만 실행한다 — 서버가
  // 다시 연결됐다고 해서 자동으로 큰 PDF들을 전부 받기 시작하지 않는다.
}
function buildPrecacheUrls() {
  const urls = ['../../index.html', '../../subjects.json', '../../manifest.json', '../../shared/annotation-engine.js', './viewer.html', './viewer.js', './hanja-data.js'];
  MATERIALS.forEach(m => urls.push(Engine.pdfUrl(m.file))); // R2 공개 URL
  return urls;
}
// 배지 색으로만 상태를 표시(idle=투명, 진행중=노랑 깜빡, 완료=초록, 실패=빨강) —
// 진행률 자체는 파일 개수가 많지 않아 토스트 스팸 없이 시작/완료 알림 정도면 충분하다.
function setPrecacheBadge(state) {
  const badge = document.getElementById('precache-badge');
  if (badge) badge.className = 'precache-badge' + (state ? ' ' + state : '');
}
let precacheBusy = false;
async function precacheAllScience(manual) {
  if (precacheBusy) return;
  precacheBusy = true;
  setPrecacheBadge('saving');
  if (manual) showToast('📥 오프라인 저장을 시작했어요');
  try {
    await Engine.PWA.precacheAll(CACHE_NAME, buildPrecacheUrls(), {
      manual,
      onDone: (done, total) => {
        setPrecacheBadge('done');
        if (manual) showToast('✅ 오프라인 저장 완료 (' + total + '개)');
        setTimeout(() => setPrecacheBadge(''), 3000);
      },
      onError: () => {
        setPrecacheBadge('error');
        showToast('⚠️ 일부 자료를 저장하지 못했어요');
        setTimeout(() => setPrecacheBadge(''), 4000);
      },
      onBusy: () => { if (manual) showToast('이미 저장을 진행 중이에요'); }
    });
  } finally { precacheBusy = false; }
}
async function manualPrecacheAll() {
  const btn = document.getElementById('precache-btn'); btn.disabled = true;
  try { await precacheAllScience(true); } finally { btn.disabled = false; }
}

/* ══ 과목 전환기 / 허브 이동 ══════════════════════════════ */
function goHome() { releaseCurrentLock(); location.href = '../../index.html'; }
async function initSubjectSwitcher() {
  try {
    const res = await fetch('../../subjects.json', { cache: 'no-store' });
    const subjects = await res.json();
    const sel = document.getElementById('subject-switcher-select');
    sel.innerHTML = subjects.map(s => `<option value="${s.viewer}" ${s.id === CURRENT_SUBJECT_ID ? 'selected' : ''}>${s.icon} ${s.name}</option>`).join('');
  } catch (e) { }
}
function onSubjectSwitch(viewerPath) { if (viewerPath) { releaseCurrentLock(); location.href = '../../' + viewerPath; } }

/* ══ 토스트 ═══════════════════════════════════════════════ */
function showToast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200);
}
function showActionToast(msg, actionLabel, onAction, durationMs) {
  const t = document.getElementById('toast-action');
  document.getElementById('toast-action-msg').textContent = msg;
  const btn = document.getElementById('toast-action-btn'); btn.textContent = actionLabel;
  btn.onclick = () => { clearTimeout(t._t); t.classList.remove('show'); onAction(); };
  t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), durationMs || 5000);
}
function toggleDark() { darkMode = !darkMode; document.body.classList.toggle('dark', darkMode); localStorage.setItem('ann:dark', darkMode ? '1' : '0'); }

/* ══ 키보드 단축키 ════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  // INPUT/TEXTAREA/SELECT/contenteditable 등 다른 입력 필드에 포커스가 있을 때는
  // 아래 어떤 단축키도(특히 Delete/Backspace로 블록 선택 삭제) 오작동하면 안 된다.
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); togglePdfSearch(); return; }
  if (!pdfDoc) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goToPage(curPage + 1);
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goToPage(curPage - 1);
  if (e.key === 'p' || e.key === 'P') togglePen();
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); doUndo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); doRedo(); }
  if (Engine.Tools.getTool() === 'select') {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // 토스트는 여기서 직접 띄우지 않는다 — deleteSelectedGroup()이 쏘는
      // kumon:structure-changed(reason:'groupDelete')를 handleStructureChanged가
      // 구독해서 띄우므로, 플로팅 툴바의 삭제 버튼과 완전히 같은 경로로 통일된다.
      if (Engine.Page.deleteSelectedGroup()) e.preventDefault();
    } else if (e.key === 'Escape') {
      Engine.Page.clearSelection();
    }
  }
});

/* ══ 초기화 ═══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('ann:dark') === '1') { darkMode = true; document.body.classList.add('dark'); }
  buildColorSwatches();
  populateStageFilter();
  renderList();
  initSubjectSwitcher();
  const savedW = parseInt(localStorage.getItem('ann:sidebarwidth'), 10);
  applySidebarWidth(savedW >= SIDEBAR_MIN_W && savedW <= SIDEBAR_MAX_W ? savedW : SIDEBAR_BASE_W);
  initSidebarResizer();
  initSpectrumEvents();
  initWheelPageNav();
  Engine.Events.on(handleStructureChanged);
  makeDialogDraggable('te-box', 'te-drag-handle');
  makeDialogDraggable('ie-box', 'ie-drag-handle');
  Engine.PWA.registerServiceWorker('../../sw.js', {}); // 앱 셸만 SW가 자동 캐싱 — PDF 전체 저장은 📥 버튼으로만
  checkServerHealth();
  setInterval(checkServerHealth, 30000);
  openFromDeepLink();
});

// 레이어 추가/삭제/이름변경, 페이지 삽입/삭제/재배치 — 구조가 바뀌는 모든 동작이
// 공통으로 내는 kumon:structure-changed 신호의 유일한 구독자. 개별 동작 호출부는
// "패널을 다시 그려라" 코드를 갖지 않는다 — 전부 여기 한 곳에서만 결정한다.
// 신호는 두 번 온다: 데이터가 이미 바뀐 직후(locked:true, 여기서 다시 그림) →
// 약 0.5초 뒤 잠금 해제(locked:false, "갱신 중" 표시만 내려감). 페이지 순서 변경은
// curPage/totalPg를 먼저 손댄 호출부 코드 다음에 이 신호가 오므로, setTimeout(0)으로
// 한 틱 미뤄서 항상 최신 curPage 기준으로 다시 그리게 한다.
function handleStructureChanged(e) {
  const { scope, pageRebuild, totalPages, reason, count } = e.detail;
  setTimeout(() => {
    document.querySelectorAll('.pen-toolbar .pt-tool').forEach(b => { b.disabled = Engine.Events.isLocked(); });
    if (scope === 'pageOrder' && e.detail.locked) {
      if (totalPages) totalPg = totalPages;
      if (pageRebuild === 'full') { buildThumbs(); renderPages(); updatePageInfo(); }
      else if (pageRebuild === 'thumbs') { buildThumbs(); }
    }
    // 블록 선택 삭제(플로팅 툴바 🗑 버튼 / Delete·Backspace 키 공통 경로)의 유일한
    // 피드백 지점 — 신호가 두 번(locked:true→false) 오므로 첫 번째에서만 띄운다.
    if (scope === 'layers' && reason === 'groupDelete' && e.detail.locked) {
      showToast('선택한 필기 ' + count + '개를 삭제했어요');
    }
    if (document.getElementById('layer-panel').classList.contains('open')) renderLayerPanel();
  }, 0);
}

// 허브 검색 결과("이동")에서 ?book=<bookId>&page=<pdf페이지>로 들어왔을 때 자동으로 연다.
function openFromDeepLink() {
  const params = new URLSearchParams(location.search);
  const bid = params.get('book'), page = parseInt(params.get('page'), 10);
  if (!bid) return;
  const m = materialByBookId(bid);
  if (!m) return;
  openMaterial(m.file).then(() => { if (page) goToPdfPage(page); });
}
