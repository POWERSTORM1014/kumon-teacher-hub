// shared/annotation-engine.js
// 과목/교재 무관 필기 엔진 — bookId(=PDF 파일명, 확장자 제외)와 pageId(=페이지 로컬 id)
// 두 값만으로 동작한다. 사람이 지어 붙이는 짧은 교재 ID는 절대 쓰지 않는다.
//
// 저장소 접근 원칙: localStorage/fetch를 직접 호출하는 코드는 이 파일의
// Storage 모듈 안에만 존재한다. 엔진의 다른 모듈, 그리고 이 엔진을 쓰는
// viewer.html 쪽 코드도 반드시 saveLayer()/loadLayer() 등 Storage의 함수를
// 통해서만 필기 데이터를 읽고 쓴다 — 나중에 저장 방식을 통째로 바꾸더라도
// 고칠 곳이 이 모듈 하나로 고정되게 하기 위함이다.
//
// DOM 계약: mountPage()가 만드는 요소는 항상 다음 id 규칙을 따른다.
//   page-wrap-<pos>  (뷰어가 만들어 넘겨주는 컨테이너, pos=화면 표시 순서 1..N)
//   ink-<pos>         (완성된 필기가 쌓이는 캔버스)
//   ink-live-<pos>    (그리는 중인 스트로크만 매 프레임 다시 그리는 캔버스)
//   elwrap-<pos>      (텍스트/이미지/오디오·영상 핀 DOM 오버레이 컨테이너)
// redrawPage(pos) 등은 이 id로 요소를 다시 찾으므로, 뷰어는 이 규칙을 반드시 지켜야 한다.

(function (global) {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     0. 공통 유틸
  ══════════════════════════════════════════════════════════ */
  function genId(prefix) { return prefix + Date.now() + Math.random().toString(36).slice(2, 8); }
  function genElementId() { return genId('el'); }
  function genPageId() { return genId('ins_'); }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function nowIso() { return new Date().toISOString(); }

  function debounce(fn, ms) {
    const timers = {};
    return function (key) {
      const args = Array.prototype.slice.call(arguments, 1);
      if (timers[key]) clearTimeout(timers[key]);
      timers[key] = setTimeout(function () { delete timers[key]; fn.apply(null, [key].concat(args)); }, ms);
    };
  }

  /* ══════════════════════════════════════════════════════════
     1. Storage — localStorage/fetch를 만지는 유일한 모듈
  ══════════════════════════════════════════════════════════ */
  const Storage = (function () {
    const LS_PREFIX = 'ann'; // "annotation" — localStorage 키 네임스페이스
    const SERVER_SAVE_DEBOUNCE_MS = 4000;
    const PAGE_ORDER_SAVE_DEBOUNCE_MS = 2000;
    const MAX_BACKUPS_PER_PAGE = 10;

    function fullKey(bookId, pageId) { return bookId + '__' + pageId; }
    function lsLayerKey(bookId, pageId) { return LS_PREFIX + ':layer:' + fullKey(bookId, pageId); }
    function lsPageOrderKey(bookId) { return LS_PREFIX + ':pageorder:' + bookId; }
    function lsBackupPrefix(bookId, pageId) { return LS_PREFIX + ':backup:' + fullKey(bookId, pageId) + ':'; }

    function defaultLayerRecord() {
      return { layers: [{ id: 'default', name: '기본 레이어', visible: true }], strokes: {}, activeLayerId: 'default', savedAt: '', lastSyncAt: '' };
    }

    // ── 필기/레이어 데이터: saveLayer/loadLayer가 유일한 진입점 ──
    function loadLayer(bookId, pageId) {
      try {
        const raw = localStorage.getItem(lsLayerKey(bookId, pageId));
        if (raw) {
          const rec = JSON.parse(raw);
          if (rec && Array.isArray(rec.layers)) return Object.assign(defaultLayerRecord(), rec);
        }
      } catch (e) { /* 손상된 데이터 — 기본값으로 폴백 */ }
      return defaultLayerRecord();
    }
    function saveLayer(bookId, pageId, record, opts) {
      opts = opts || {};
      record.savedAt = opts.savedAt || nowIso();
      localStorage.setItem(lsLayerKey(bookId, pageId), JSON.stringify(record));
      // record(=Elements가 들고 있는 살아있는 메모리 객체)를 그대로 넘긴다 — 나중에
      // pushLayerToServer가 dataURL을 서버 경로로 치환할 때 이 객체를 직접 고쳐야
      // 화면에 이미 붙어있는 <img>가 참조하는 값도 같이 갱신된다(별도로 다시
      // loadLayer()해서 고치면 메모리 캐시와 로컬스토리지가 따로 놀게 됨).
      if (!opts.skipServerPush) scheduleServerPush(bookId + '__' + pageId, bookId, pageId, record);
      return record;
    }
    function setLastSyncAt(bookId, pageId, iso) {
      const rec = loadLayer(bookId, pageId);
      rec.lastSyncAt = iso;
      localStorage.setItem(lsLayerKey(bookId, pageId), JSON.stringify(rec));
    }
    function removeLayer(bookId, pageId) {
      localStorage.removeItem(lsLayerKey(bookId, pageId));
    }

    // 디바운스 키는 bookId 하나가 아니라 bookId+pageId 조합이어야 한다 — 같은 책의
    // 서로 다른 두 페이지를 4초 안에 잇달아 고치면, bookId만 키로 쓸 경우 두 번째
    // 저장 예약이 첫 번째 페이지의 예약 타이머를 취소해버려 그 페이지는 서버에
    // 영영 안 올라갈 수 있었다. dedupKey는 순수 식별용이고, fn에는 실제 인자
    // (bookId, pageId, record)가 그대로 전달된다.
    const scheduleServerPush = debounce(function (dedupKey, bookId, pageId, record) {
      pushLayerToServer(bookId, pageId, record);
    }, SERVER_SAVE_DEBOUNCE_MS);

    async function pushLayerToServer(bookId, pageId, record) {
      const rec = record || loadLayer(bookId, pageId); // 살아있는 객체가 있으면 그걸 그대로 쓴다(위 saveLayer 주석 참고)
      if (!(await ping())) return { ok: false, offline: true };
      try {
        await migrateDataUrlAssets(bookId, pageId, rec);
        const res = await fetch('/api/layers/' + encodeURIComponent(fullKey(bookId, pageId)), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ layers: rec.layers, strokes: rec.strokes, device: Device.getLabel(), deviceId: Device.getId(), deviceType: Device.getTypeDesc() })
        });
        if (!res.ok) throw new Error('save failed (' + res.status + ')');
        const j = await res.json();
        setLastSyncAt(bookId, pageId, j.savedAt);
        return { ok: true, savedAt: j.savedAt };
      } catch (e) {
        console.warn('[ann-engine] 서버 저장 실패', pageId, e);
        return { ok: false, error: e };
      }
    }

    async function fetchRemoteLayer(bookId, pageId) {
      try {
        const res = await fetch('/api/layers/' + encodeURIComponent(fullKey(bookId, pageId)), { cache: 'no-store' });
        if (!res.ok) return null;
        return await res.json();
      } catch (e) { return null; }
    }

    // dataURL로 남아있는 이미지/미디어 자산을 서버 업로드 경로로 치환한다(전송 직전).
    async function migrateDataUrlAssets(bookId, pageId, rec) {
      let changed = false;
      for (const layerId in rec.strokes) {
        for (const el of rec.strokes[layerId]) {
          if (el.type === 'image' && el.src && el.src.startsWith('data:')) {
            const p = await uploadAsset(bookId, pageId, 'image', el.src, 'image.png');
            if (p) { el.src = p; changed = true; }
          } else if (el.type === 'media' && el.fileSrc && el.fileSrc.startsWith('data:')) {
            const p = await uploadAsset(bookId, pageId, 'audio', el.fileSrc, 'media.bin');
            if (p) { el.fileSrc = p; changed = true; }
          }
        }
      }
      if (changed) localStorage.setItem(lsLayerKey(bookId, pageId), JSON.stringify(rec));
      return changed;
    }

    async function uploadAsset(bookId, pageId, kind, dataUrl, filename) {
      if (!(await ping())) return null;
      try {
        const res = await fetch('/api/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, pageId: fullKey(bookId, pageId), dataUrl, filename })
        });
        if (!res.ok) return null;
        const j = await res.json();
        return j.path || null;
      } catch (e) { console.warn('[ann-engine] 업로드 실패', e); return null; }
    }
    // 과거 버전(서버가 슬래시 없는 상대경로를 돌려주던 시절)에 저장된 값을 방어적으로
    // 보정한다 — 뷰어가 /subjects/science/처럼 중첩 경로에서 서빙되므로, 슬래시 없는
    // "data/images/..."를 그대로 쓰면 엉뚱한 위치에서 찾다 깨진다.
    function normalizeAssetSrc(src) {
      if (!src) return src;
      if (src.startsWith('data:') || src.startsWith('http:') || src.startsWith('https:') || src.startsWith('/')) return src;
      return '/' + src;
    }

    // ── 페이지 순서 ──
    function loadPageOrder(bookId) {
      try {
        const raw = localStorage.getItem(lsPageOrderKey(bookId));
        if (raw) { const j = JSON.parse(raw); if (Array.isArray(j.order)) return j; }
      } catch (e) { /* 무시 */ }
      return null;
    }
    function savePageOrder(bookId, order, opts) {
      opts = opts || {};
      const savedAt = opts.savedAt || nowIso();
      localStorage.setItem(lsPageOrderKey(bookId), JSON.stringify({ order, savedAt }));
      if (!opts.skipServerPush) schedulePageOrderPush(bookId, order);
      return savedAt;
    }
    const schedulePageOrderPush = debounce(function (key, order) {
      pushPageOrderToServer(key, order);
    }, PAGE_ORDER_SAVE_DEBOUNCE_MS);
    async function pushPageOrderToServer(bookId, order) {
      if (!(await ping())) return;
      try {
        const res = await fetch('/api/page-order/' + encodeURIComponent(bookId), {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order })
        });
        if (!res.ok) return;
        const j = await res.json();
        localStorage.setItem(lsPageOrderKey(bookId), JSON.stringify({ order, savedAt: j.savedAt }));
      } catch (e) { console.warn('[ann-engine] 페이지 순서 저장 실패', e); }
    }
    async function fetchRemotePageOrder(bookId) {
      try {
        const res = await fetch('/api/page-order/' + encodeURIComponent(bookId), { cache: 'no-store' });
        if (!res.ok) return null;
        return await res.json();
      } catch (e) { return null; }
    }

    // ── 서버 온라인 여부: 오직 이 함수만이 판단 기준이다(navigator.onLine 사용 금지 —
    // 로컬 서버는 같은 기기 안에서 돌기 때문에 와이파이 상태와 무관하다). ──
    async function ping(timeoutMs) {
      try {
        const res = await fetch('/api/ping', { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs || 3000) });
        return !!(res && res.ok);
      } catch (e) { return false; }
    }

    // ── 페이지별 백업(충돌 "둘 다 보관" 선택 시) ──
    function backupTimestamp() {
      const d = new Date(); const p = n => String(n).padStart(2, '0');
      return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
    }
    function stashBackup(bookId, pageId, record) {
      const key = lsBackupPrefix(bookId, pageId) + backupTimestamp();
      localStorage.setItem(key, JSON.stringify(Object.assign({}, record, { savedAt: nowIso() })));
      return key;
    }
    function getBackups(bookId, pageId) {
      const prefix = lsBackupPrefix(bookId, pageId);
      const items = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) {
          try { items.push({ key: k, ts: k.slice(prefix.length), data: JSON.parse(localStorage.getItem(k)) }); } catch (e) { }
        }
      }
      items.sort((a, b) => b.ts.localeCompare(a.ts));
      return items;
    }
    function restoreBackup(key) {
      try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
    }
    function deleteBackup(key) { localStorage.removeItem(key); }

    // 페이지 완전 삭제(5초 되돌리기 만료) 뒤 로컬 흔적 정리
    function removePageTraces(bookId, pageId) { removeLayer(bookId, pageId); }

    // ── 최근 학습(허브 화면의 "최근 학습" 섹션용) ── 과목 허브는 이 기록만으로
    // 카드를 그린다. localStorage 직접 접근은 여기 한 곳으로 고정한다.
    const RECENTS_KEY = LS_PREFIX + ':recents';
    const RECENTS_MAX = 5;
    function recordRecent(entry) {
      let list = [];
      try { list = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); } catch (e) { /* 손상 시 새로 시작 */ }
      list = list.filter(r => !(r.subjectId === entry.subjectId && r.bookId === entry.bookId));
      list.unshift(Object.assign({}, entry, { openedAt: nowIso() }));
      if (list.length > RECENTS_MAX) list.length = RECENTS_MAX;
      localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
    }
    function getRecents() {
      try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); } catch (e) { return []; }
    }

    return {
      loadLayer, saveLayer, removeLayer, setLastSyncAt, pushLayerToServer, fetchRemoteLayer, uploadAsset,
      loadPageOrder, savePageOrder, fetchRemotePageOrder,
      ping, stashBackup, getBackups, restoreBackup, deleteBackup, removePageTraces,
      recordRecent, getRecents,
      fullKey, normalizeAssetSrc
    };
  })();

  /* ══════════════════════════════════════════════════════════
     2. Device — 기기 식별(충돌 해결 시 "어느 기기"인지 표시용)
  ══════════════════════════════════════════════════════════ */
  const Device = (function () {
    function getId() {
      let id = localStorage.getItem('ann:device:id');
      if (!id) {
        id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('dev-' + Date.now() + '-' + Math.random().toString(16).slice(2));
        localStorage.setItem('ann:device:id', id);
      }
      return id;
    }
    function detectDeviceTypeLabel() {
      const ua = navigator.userAgent || '';
      return /Android|iPad|iPhone|iPod|Mobile/i.test(ua) ? '태블릿' : '노트북';
    }
    function detectPlatformLabel() {
      const ua = navigator.userAgent || '';
      if (/Windows/i.test(ua)) return 'Windows';
      if (/Android/i.test(ua)) return 'Android';
      if (/iPad|iPhone|iPod/i.test(ua)) return 'iOS';
      if (/Mac OS X/i.test(ua)) return 'Mac';
      if (/Linux/i.test(ua)) return 'Linux';
      return '';
    }
    function getTypeDesc() {
      const t = detectDeviceTypeLabel(), p = detectPlatformLabel();
      return p ? (t + '/' + p) : t;
    }
    function getKnownOtherDevices() {
      try {
        const list = JSON.parse(localStorage.getItem('ann:device:known') || '[]');
        return Array.isArray(list) ? list.filter(d => d && d.name && d.deviceId) : [];
      } catch (e) { return []; }
    }
    function noteOtherDevice(name, deviceId) {
      if (!name || !deviceId || deviceId === getId()) return;
      const list = getKnownOtherDevices().filter(d => d.deviceId !== deviceId);
      list.push({ name, deviceId });
      while (list.length > 10) list.shift();
      localStorage.setItem('ann:device:known', JSON.stringify(list));
    }
    function uniqueDeviceLabel(base) {
      const otherNames = getKnownOtherDevices().map(d => d.name);
      if (!otherNames.includes(base)) return base;
      let n = 2;
      while (otherNames.includes(base + '(' + n + ')')) n++;
      return base + '(' + n + ')';
    }
    function getLabel() {
      let label = localStorage.getItem('ann:device:label');
      if (!label) { label = uniqueDeviceLabel(detectDeviceTypeLabel()); localStorage.setItem('ann:device:label', label); }
      return label;
    }
    function setLabel(name) { localStorage.setItem('ann:device:label', name); }
    function hasNameCollision() {
      const mine = getLabel();
      return getKnownOtherDevices().some(d => d.name === mine);
    }
    return { getId, getLabel, setLabel, getTypeDesc, detectDeviceTypeLabel, getKnownOtherDevices, noteOtherDevice, hasNameCollision };
  })();

  /* ══════════════════════════════════════════════════════════
     2b. Events — "구조가 바뀌었다" 신호를 하나로 통합.
     레이어 추가/삭제/이름변경, 페이지 삽입/삭제/재배치 등 "레이어 패널·페이지
     썸네일이 다시 그려져야 하는" 모든 동작이 이 신호 하나만 발생시킨다. 뷰어 쪽은
     개별 동작마다 "패널 갱신해라" 코드를 따로 넣는 대신, 이 신호 하나만 구독하면
     된다 — 그래야 나중에 비슷한 동작이 추가돼도 "갱신 깜빡함" 버그가 재발하지 않는다.
     신호는 두 번 발생한다: 데이터가 이미 바뀐 직후(locked:true, "1차 즉시 갱신" —
     구독자는 최신 데이터로 다시 그리되, 이 시점부터 짧게 잠긴다) → 약 0.5초 뒤
     한 번 더(locked:false, "2차 잠금 해제"). 이 사이 짧은 잠금 구간 동안은 필기
     입력도 막아서, 옛 상태를 보고 있는 채로 그리는 사고를 막는다(과거 페이지
     삽입/삭제 버그의 해결책과 동일한 원칙).
  ══════════════════════════════════════════════════════════ */
  const Events = (function () {
    const target = new EventTarget();
    const STRUCTURE_CHANGED = 'kumon:structure-changed';
    const LOCK_MS = 500;
    let locked = false, lockTimer = null;

    function emitStructureChanged(detail) {
      locked = true;
      if (lockTimer) clearTimeout(lockTimer);
      target.dispatchEvent(new CustomEvent(STRUCTURE_CHANGED, { detail: Object.assign({}, detail, { locked: true }) }));
      lockTimer = setTimeout(() => {
        locked = false; lockTimer = null;
        target.dispatchEvent(new CustomEvent(STRUCTURE_CHANGED, { detail: Object.assign({}, detail, { locked: false }) }));
      }, LOCK_MS);
    }
    function isLocked() { return locked; }
    function on(handler) { target.addEventListener(STRUCTURE_CHANGED, handler); }
    function off(handler) { target.removeEventListener(STRUCTURE_CHANGED, handler); }

    return { STRUCTURE_CHANGED, emitStructureChanged, isLocked, on, off };
  })();

  /* ══════════════════════════════════════════════════════════
     3. PageOrder — 페이지 삽입/삭제/재배치 (position ↔ id 브리지)
  ══════════════════════════════════════════════════════════ */
  const PageOrder = (function () {
    let bookId = null, order = [], savedAt = '', pendingDelete = null;
    const MAX_INSERTED_PAGES = 100;

    function synthesize(pdfNumPages) {
      const arr = [];
      for (let p = 1; p <= pdfNumPages; p++) arr.push({ id: String(p), kind: 'pdf', pdfPage: p });
      return arr;
    }
    function isConsistent(ord, pdfNumPages) {
      if (!Array.isArray(ord) || !ord.length) return false;
      const pdfNums = ord.filter(e => e && e.kind === 'pdf').map(e => e.pdfPage);
      if (pdfNums.length !== pdfNumPages) return false;
      const uniq = new Set(pdfNums);
      if (uniq.size !== pdfNumPages) return false;
      for (let p = 1; p <= pdfNumPages; p++) if (!uniq.has(p)) return false;
      return true;
    }

    async function init(bid, pdfNumPages) {
      bookId = bid;
      const local = Storage.loadPageOrder(bookId);
      if (local && isConsistent(local.order, pdfNumPages)) { order = local.order; savedAt = local.savedAt || ''; }
      else { order = synthesize(pdfNumPages); savedAt = ''; }
      Elements.invalidateCaches();
      syncFromServer(pdfNumPages); // 결과를 기다리지 않는다 — 서버가 더 최신이면 조용히 반영
      return { order: order.slice(), totalPages: order.length };
    }

    async function syncFromServer(pdfNumPages) {
      if (!bookId) return { changed: false };
      const j = await Storage.fetchRemotePageOrder(bookId);
      if (!j || !j.found) {
        if (order.some(e => e.kind === 'inserted')) Storage.savePageOrder(bookId, order, { savedAt });
        return { changed: false };
      }
      if (!savedAt || j.savedAt > savedAt) {
        if (!isConsistent(j.order, pdfNumPages != null ? pdfNumPages : order.filter(e => e.kind === 'pdf').length)) return { changed: false };
        order = j.order; savedAt = j.savedAt;
        Storage.savePageOrder(bookId, order, { savedAt, skipServerPush: true });
        Elements.invalidateCaches();
        return { changed: true, order: order.slice(), totalPages: order.length };
      } else if (savedAt > j.savedAt) {
        Storage.savePageOrder(bookId, order, { savedAt });
      }
      return { changed: false };
    }

    function persist() { savedAt = Storage.savePageOrder(bookId, order); }
    function getOrder() { return order.slice(); }
    function getTotalPages() { return order.length; }
    function getOrderEntry(pos) { return order[pos - 1] || null; }
    function pageIdOf(pos) { const e = getOrderEntry(pos); return e ? e.id : String(pos); }
    function findPosByPdfPage(pdfPage) { const idx = order.findIndex(e => e.kind === 'pdf' && e.pdfPage === pdfPage); return idx >= 0 ? idx + 1 : pdfPage; }
    function countInsertedPages() { return order.filter(e => e.kind === 'inserted').length; }

    // position↔내용 매핑이 바뀌는 동작(삽입/삭제/재배치) 뒤에는 항상 이 함수를 거친다 —
    // 캐시 무효화 + "구조 변경" 신호(레이어 패널·썸네일 갱신용)를 한 곳에서 같이 낸다.
    function notifyStructureChanged(extra) {
      Elements.invalidateCaches();
      Events.emitStructureChanged(Object.assign({ scope: 'pageOrder', pageRebuild: 'full', bookId, totalPages: order.length }, extra));
    }

    function insertPages(afterPos, count, template, refSize) {
      const remaining = MAX_INSERTED_PAGES - countInsertedPages();
      count = clamp(count, 1, Math.max(0, remaining));
      if (count <= 0) return { inserted: 0, remaining };
      const entries = [];
      for (let i = 0; i < count; i++) {
        entries.push({ id: genPageId(), kind: 'inserted', template, label: count > 1 ? ('새 페이지 ' + (i + 1)) : '새 페이지', width: refSize.width, height: refSize.height });
      }
      order.splice(afterPos, 0, ...entries);
      persist();
      notifyStructureChanged();
      return { inserted: count, firstPos: afterPos + 1, totalPages: order.length };
    }

    function deletePageAt(pos, onFinalize) {
      const entry = getOrderEntry(pos);
      if (!entry || entry.kind !== 'inserted') return null; // 원본 PDF 페이지는 삭제 대상 아님
      if (pendingDelete) { finalizePendingDelete(); }
      order.splice(pos - 1, 1);
      persist();
      notifyStructureChanged();
      const pending = { entry, pos, bookId };
      pendingDelete = pending;
      pending.timer = setTimeout(() => {
        if (pendingDelete === pending) { finalizePendingDelete(); if (onFinalize) onFinalize(); }
      }, 5000);
      return { totalPages: order.length, pending };
    }
    function finalizePendingDelete() {
      if (!pendingDelete) return;
      if (pendingDelete.timer) clearTimeout(pendingDelete.timer);
      Storage.removePageTraces(pendingDelete.bookId, pendingDelete.entry.id);
      pendingDelete = null;
    }
    function undoPendingDelete() {
      if (!pendingDelete) return null;
      const pending = pendingDelete;
      if (pending.timer) clearTimeout(pending.timer);
      pendingDelete = null;
      const insertAt = Math.min(pending.pos - 1, order.length);
      order.splice(insertAt, 0, pending.entry);
      persist();
      notifyStructureChanged();
      return { insertedAtPos: insertAt + 1, totalPages: order.length };
    }

    function movePage(fromPos, targetPos, before) {
      if (targetPos === fromPos) return null;
      const [moved] = order.splice(fromPos - 1, 1);
      let targetIdx = targetPos - 1;
      if (targetPos > fromPos) targetIdx -= 1;
      let insertIdx = before ? targetIdx : targetIdx + 1;
      insertIdx = clamp(insertIdx, 0, order.length);
      order.splice(insertIdx, 0, moved);
      persist();
      notifyStructureChanged();
      return { totalPages: order.length, newPosOf: id => order.findIndex(e => e.id === id) + 1 };
    }

    function renamePage(pos, label) {
      const entry = getOrderEntry(pos);
      if (!entry || entry.kind !== 'inserted') return false;
      entry.label = label;
      persist();
      // 이름표만 바뀜 — position 매핑은 그대로라 캐시 무효화·전체 재렌더는 불필요, 썸네일만 다시 그리면 됨
      Events.emitStructureChanged({ scope: 'pageOrder', pageRebuild: 'thumbs', bookId, totalPages: order.length });
      return true;
    }

    return {
      init, syncFromServer, getOrder, getTotalPages, getOrderEntry, pageIdOf, findPosByPdfPage,
      countInsertedPages, insertPages, deletePageAt, undoPendingDelete, movePage, renamePage,
      MAX_INSERTED_PAGES
    };
  })();

  /* ══════════════════════════════════════════════════════════
     4. Layers + Elements — 페이지×레이어 데이터, undo/redo
  ══════════════════════════════════════════════════════════ */
  const Elements = (function () {
    let bookId = null;
    const cache = {}; // pos -> record (loadLayer 결과 메모리 캐시, invalidateCaches로만 비움)
    let undoStack = [], redoStack = [];
    const HISTORY_MAX = 50;

    function setBook(bid) { bookId = bid; invalidateCaches(); }
    function invalidateCaches() { for (const k in cache) delete cache[k]; }
    function resetHistory() { undoStack = []; redoStack = []; }

    function pid(pos) { return PageOrder.pageIdOf(pos); }
    function record(pos) {
      if (!cache[pos]) cache[pos] = Storage.loadLayer(bookId, pid(pos));
      return cache[pos];
    }
    function persist(pos) {
      Storage.saveLayer(bookId, pid(pos), cache[pos]);
    }

    function normalizeElement(el) { if (el && !el.type) el.type = 'ink'; return el; }

    // ── 레이어 목록 ──
    function getLayerList(pos) { return record(pos).layers; }
    function getActiveLayerId(pos) {
      const rec = record(pos);
      if (rec.activeLayerId && rec.layers.some(l => l.id === rec.activeLayerId)) return rec.activeLayerId;
      rec.activeLayerId = rec.layers[0].id;
      return rec.activeLayerId;
    }
    function setActiveLayer(pos, id) {
      const rec = record(pos);
      if (!rec.layers.some(l => l.id === id)) return;
      rec.activeLayerId = id;
      persist(pos);
    }
    function addLayer(pos, name) {
      const rec = record(pos);
      const id = genId('l');
      rec.layers.push({ id, name, visible: true });
      rec.activeLayerId = id;
      persist(pos);
      Events.emitStructureChanged({ scope: 'layers', pos, bookId });
      return id;
    }
    function renameLayer(pos, id, name) {
      const rec = record(pos);
      const layer = rec.layers.find(l => l.id === id);
      if (!layer) return;
      layer.name = name;
      persist(pos);
      Events.emitStructureChanged({ scope: 'layers', pos, bookId });
    }
    function toggleLayerVisible(pos, id) {
      const rec = record(pos);
      const layer = rec.layers.find(l => l.id === id);
      if (!layer) return;
      layer.visible = !layer.visible;
      persist(pos);
    }
    function deleteLayer(pos, id) {
      const rec = record(pos);
      if (rec.layers.length <= 1) return { error: 'last-layer' };
      const layer = rec.layers.find(l => l.id === id);
      if (!layer) return { error: 'not-found' };
      rec.layers = rec.layers.filter(l => l.id !== id);
      delete rec.strokes[id];
      if (rec.activeLayerId === id) rec.activeLayerId = rec.layers[0].id;
      persist(pos);
      Events.emitStructureChanged({ scope: 'layers', pos, bookId });
      return { ok: true, name: layer.name };
    }
    function clearPage(pos) {
      const rec = record(pos);
      rec.strokes = {};
      persist(pos);
    }

    // ── 요소(잉크/텍스트/이미지/미디어) ──
    function getElements(pos, layerId) {
      const rec = record(pos);
      return (rec.strokes[layerId] || []).map(normalizeElement);
    }
    function getAllElements(pos) {
      const rec = record(pos);
      for (const k in rec.strokes) rec.strokes[k].forEach(normalizeElement);
      return rec.strokes;
    }
    function pushHistory(action) {
      undoStack.push(action);
      if (undoStack.length > HISTORY_MAX) undoStack.shift();
      redoStack.length = 0;
    }
    // 여러 요소에 걸친 동작(블록 선택 이동/삭제)을 undo 한 번으로 묶어서 기록한다.
    // actions는 실행한 순서 그대로 저장 — undo 시 applyHistoryOp가 역순으로 재생한다.
    function pushGroupHistory(actions) {
      if (!actions || !actions.length) return;
      const entry = actions.length === 1 ? actions[0] : { op: 'group', pos: actions[0].pos, actions };
      pushHistory(entry);
    }
    function addElement(pos, layerId, element, opts) {
      opts = opts || {};
      const rec = record(pos);
      if (!rec.strokes[layerId]) rec.strokes[layerId] = [];
      element.id = element.id || genElementId();
      rec.strokes[layerId].push(element);
      persist(pos);
      if (!opts.skipHistory) pushHistory({ op: 'add', pos, layerId, element });
      return element;
    }
    function deleteElement(pos, layerId, id, opts) {
      opts = opts || {};
      const rec = record(pos);
      const arr = rec.strokes[layerId];
      if (!arr) return null;
      const idx = arr.findIndex(e => e.id === id);
      if (idx < 0) return null;
      const [element] = arr.splice(idx, 1);
      persist(pos);
      if (!opts.skipHistory) pushHistory({ op: 'delete', pos, layerId, element, index: idx });
      return element;
    }
    function updateElement(pos, layerId, id, from, to, opts) {
      opts = opts || {};
      const rec = record(pos);
      const el = (rec.strokes[layerId] || []).find(e => e.id === id);
      if (!el) return null;
      Object.assign(el, to);
      persist(pos);
      if (!opts.skipHistory) pushHistory({ op: 'edit', pos, layerId, element: { id }, from, to });
      return el;
    }
    function findStrokeNear(pos, layerId, x, y) {
      const arr = getElements(pos, layerId);
      let best = null, bestDist = Infinity;
      arr.forEach(el => {
        if (el.type !== 'ink') return;
        const threshold = Math.max(10, (el.size || 3) * 2);
        const d = strokeHitDistance(el, x, y);
        if (d <= threshold && d < bestDist) { bestDist = d; best = el; }
      });
      return best;
    }
    // 사각 영역(마퀴)과 경계 상자가 겹치는 잉크/형광펜 획 id 목록 — 블록 선택.
    function findStrokesInRect(pos, layerId, rect) {
      const ids = [];
      getElements(pos, layerId).forEach(el => {
        if (el.type !== 'ink') return;
        const b = Ink.computeBounds([el]);
        if (b && Ink.rectsIntersect(b, rect)) ids.push(el.id);
      });
      return ids;
    }
    // 블록 선택된 여러 획을 한 번에 옮긴다 — moves: [{id, from:{pts}, to:{pts}}].
    // 되돌리기는 하나의 그룹으로 묶여서, Undo 한 번으로 전체가 같이 복원된다.
    function moveElements(pos, layerId, moves) {
      const rec = record(pos);
      const arr = rec.strokes[layerId] || [];
      const actions = [];
      moves.forEach(({ id, from, to }) => {
        const el = arr.find(e => e.id === id);
        if (!el) return;
        Object.assign(el, to);
        actions.push({ op: 'edit', pos, layerId, element: { id }, from, to });
      });
      persist(pos);
      pushGroupHistory(actions);
      return actions;
    }
    // 블록 선택된 여러 획을 한 번에 지운다 — 하나의 그룹 undo로 전체가 같이 복원된다.
    function deleteElements(pos, layerId, ids) {
      const rec = record(pos);
      const arr = rec.strokes[layerId];
      if (!arr || !arr.length) return [];
      const targets = ids.map(id => ({ id, index: arr.findIndex(e => e.id === id) })).filter(x => x.index >= 0);
      targets.sort((a, b) => b.index - a.index); // 높은 인덱스부터 지워야 낮은 인덱스가 안 밀림
      const actions = [];
      targets.forEach(({ id, index }) => {
        const [element] = arr.splice(index, 1);
        actions.push({ op: 'delete', pos, layerId, element, index });
      });
      persist(pos);
      pushGroupHistory(actions);
      return actions.map(a => a.element);
    }
    function pointSegDist(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1, dy = y2 - y1;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
      t = clamp(t, 0, 1);
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }
    function strokeHitDistance(stroke, x, y) {
      const pts = stroke.pts || [];
      if (!pts.length) return Infinity;
      if (pts.length === 1) return Math.hypot(x - pts[0].x, y - pts[0].y);
      let min = Infinity;
      for (let i = 0; i < pts.length - 1; i++) min = Math.min(min, pointSegDist(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y));
      return min;
    }

    function applyHistoryOp(action, direction) {
      if (action.op === 'group') {
        // undo는 실행한 순서의 역순으로, redo는 실행한 순서 그대로 재생해야 정확히 복원된다.
        const ordered = direction === 'undo' ? action.actions.slice().reverse() : action.actions;
        ordered.forEach(sub => applyHistoryOp(sub, direction));
        return;
      }
      const { op, pos, layerId, element, index, from, to } = action;
      const rec = record(pos);
      if (!rec.strokes[layerId]) rec.strokes[layerId] = [];
      const arr = rec.strokes[layerId];
      if (op === 'add') {
        if (direction === 'undo') { const i = arr.findIndex(e => e.id === element.id); if (i >= 0) arr.splice(i, 1); }
        else if (!arr.some(e => e.id === element.id)) arr.push(element);
      } else if (op === 'delete') {
        if (direction === 'undo') { const i = Math.min(index, arr.length); if (!arr.some(e => e.id === element.id)) arr.splice(i, 0, element); }
        else { const i = arr.findIndex(e => e.id === element.id); if (i >= 0) arr.splice(i, 1); }
      } else if (op === 'move' || op === 'resize' || op === 'edit') {
        const target = arr.find(e => e.id === element.id);
        if (target) Object.assign(target, direction === 'undo' ? from : to);
      }
      persist(pos);
    }
    function undo() {
      if (!undoStack.length) return false;
      const action = undoStack.pop();
      applyHistoryOp(action, 'undo');
      redoStack.push(action);
      return action;
    }
    function redo() {
      if (!redoStack.length) return false;
      const action = redoStack.pop();
      applyHistoryOp(action, 'redo');
      undoStack.push(action);
      return action;
    }

    return {
      setBook, invalidateCaches, resetHistory, record, persist,
      getLayerList, getActiveLayerId, setActiveLayer, addLayer, renameLayer, toggleLayerVisible, deleteLayer, clearPage,
      getElements, getAllElements, addElement, deleteElement, updateElement, findStrokeNear,
      findStrokesInRect, moveElements, deleteElements,
      undo, redo, genElementId
    };
  })();

  /* ══════════════════════════════════════════════════════════
     5. Color — 색상 계산(HSV/RGB/HEX) + 표준 팔레트
  ══════════════════════════════════════════════════════════ */
  const Color = (function () {
    const PEN_COLORS = ['#1a1814', '#e8401c', '#1a7fd4', '#1aad6e', '#f5a623', '#9b59b6'];
    function hsvToRgb(h, s, v) {
      const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
      let r, g, b;
      if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; } else if (h < 180) { r = 0; g = c; b = x; }
      else if (h < 240) { r = 0; g = x; b = c; } else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
      return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
    }
    function rgbToHsv(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      let h = 0;
      if (d !== 0) {
        if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
      }
      if (h < 0) h += 360;
      return { h, s: max === 0 ? 0 : d / max, v: max };
    }
    function rgbToHex(r, g, b) { return '#' + [r, g, b].map(x => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join(''); }
    function hexToRgb(hex) {
      hex = (hex || '').replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
      const n = parseInt(hex, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    function hslToHex(h, s, l) {
      s /= 100; l /= 100;
      const k = n => (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
    }
    // 표준 팔레트 — 6톤(밝기별) x 12색상 + 그레이스케일 한 줄, 육각형 그리드로 그리기 좋은 순서.
    function buildStandardPaletteRows() {
      const hues = []; for (let h = 0; h < 360; h += 30) hues.push(h);
      const shadeRows = [[100, 50], [100, 65], [65, 80], [100, 35], [100, 20]];
      const rows = shadeRows.map(([s, l]) => hues.map(h => hslToHex(h, s, l)));
      const grays = []; for (let i = 0; i < hues.length; i++) { const v = Math.round(255 * i / (hues.length - 1)); grays.push(rgbToHex(v, v, v)); }
      rows.push(grays);
      return rows;
    }
    // 스펙트럼 캔버스(채도x명도) + Hue 슬라이더 픽커에 필요한 포인터 연결을 제공한다 —
    // 실제 DOM/CSS는 이 엔진을 쓰는 뷰어가 만들고, 여기서는 좌표→HSV 변환만 담당한다.
    function wireSpectrumPicker(canvasEl, onDrag) {
      let dragging = false;
      function update(e) {
        const r = canvasEl.getBoundingClientRect();
        const x = clamp((e.clientX - r.left) / r.width, 0, 1);
        const y = clamp((e.clientY - r.top) / r.height, 0, 1);
        onDrag(x, 1 - y);
      }
      canvasEl.addEventListener('pointerdown', e => { dragging = true; canvasEl.setPointerCapture(e.pointerId); update(e); });
      canvasEl.addEventListener('pointermove', e => { if (dragging) update(e); });
      canvasEl.addEventListener('pointerup', () => { dragging = false; });
      canvasEl.addEventListener('pointercancel', () => { dragging = false; });
    }
    function drawSpectrum(canvasEl, hue) {
      const ctx = canvasEl.getContext('2d');
      const w = canvasEl.width, h = canvasEl.height;
      const hueRgb = hsvToRgb(hue, 1, 1);
      ctx.fillStyle = 'rgb(' + hueRgb.r + ',' + hueRgb.g + ',' + hueRgb.b + ')';
      ctx.fillRect(0, 0, w, h);
      const satGrad = ctx.createLinearGradient(0, 0, w, 0);
      satGrad.addColorStop(0, 'rgba(255,255,255,1)'); satGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = satGrad; ctx.fillRect(0, 0, w, h);
      const valGrad = ctx.createLinearGradient(0, 0, 0, h);
      valGrad.addColorStop(0, 'rgba(0,0,0,0)'); valGrad.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = valGrad; ctx.fillRect(0, 0, w, h);
    }
    return { PEN_COLORS, hsvToRgb, rgbToHsv, rgbToHex, hexToRgb, hslToHex, buildStandardPaletteRows, wireSpectrumPicker, drawSpectrum };
  })();

  /* ══════════════════════════════════════════════════════════
     6. Ink — 잉크 렌더링/캡처 (배율 1 기준 좌표로 저장)
  ══════════════════════════════════════════════════════════ */
  const Ink = (function () {
    const PEN_SMOOTH_MIN_DIST = 0.7; // 배율1 기준 px — 더 가까운 점은 잡음으로 보고 건너뜀

    function applyStrokeStyle(ctx, stroke, scale) {
      const size = (stroke.size || 3) * scale, color = stroke.color || '#1a1814';
      if (stroke.tool === 'er') { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = 'rgba(0,0,0,1)'; ctx.lineWidth = size * 3; }
      else if (stroke.tool === 'hi') { ctx.globalCompositeOperation = 'multiply'; ctx.strokeStyle = color; ctx.lineWidth = size * 4; ctx.globalAlpha = 0.3; }
      else { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = color; ctx.lineWidth = size; }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    }
    function strokeSmoothPath(ctx, pts, scale) {
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x * scale, pts[0].y * scale);
      if (pts.length === 2) { ctx.lineTo(pts[1].x * scale, pts[1].y * scale); }
      else {
        for (let i = 1; i < pts.length - 1; i++) {
          const cur = pts[i], next = pts[i + 1];
          const mx = (cur.x + next.x) / 2 * scale, my = (cur.y + next.y) / 2 * scale;
          ctx.quadraticCurveTo(cur.x * scale, cur.y * scale, mx, my);
        }
        ctx.lineTo(pts[pts.length - 1].x * scale, pts[pts.length - 1].y * scale);
      }
      ctx.stroke();
    }
    function paintStroke(ctx, stroke, scale) {
      if (!stroke.pts || stroke.pts.length < 2) return;
      ctx.save();
      applyStrokeStyle(ctx, stroke, scale);
      strokeSmoothPath(ctx, stroke.pts, scale);
      ctx.restore();
    }
    // 레이어별로 오프스크린에 그린 뒤 합성 — 지우개가 다른 레이어를 침범하지 않게 함.
    function renderLayersToCanvas(ctx, layers, strokesByLayer, scale, w, h, excludeId) {
      ctx.clearRect(0, 0, w, h);
      layers.forEach(layer => {
        if (layer.visible === false) return;
        const elements = strokesByLayer[layer.id];
        if (!elements || !elements.length) return;
        const off = document.createElement('canvas');
        off.width = w; off.height = h;
        const octx = off.getContext('2d');
        elements.forEach(s => { if ((!s.type || s.type === 'ink') && s.id !== excludeId) paintStroke(octx, s, scale); });
        ctx.drawImage(off, 0, 0);
      });
    }
    function addPointsFromEvent(e, canvas, scale, pts) {
      const r = canvas.getBoundingClientRect();
      const sx = canvas.width / r.width, sy = canvas.height / r.height;
      const events = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
      events.forEach(ev => {
        const cx = (ev.clientX - r.left) * sx, cy = (ev.clientY - r.top) * sy;
        const x = cx / scale, y = cy / scale;
        if (pts.length) {
          const last = pts[pts.length - 1];
          const dx = x - last.x, dy = y - last.y;
          if (dx * dx + dy * dy < PEN_SMOOTH_MIN_DIST * PEN_SMOOTH_MIN_DIST) return;
        }
        pts.push({ x, y });
      });
    }
    function getPagePos(e, canvas, scale) {
      const r = canvas.getBoundingClientRect();
      const sx = canvas.width / r.width, sy = canvas.height / r.height;
      const cx = (e.clientX - r.left) * sx, cy = (e.clientY - r.top) * sy;
      return { x: cx / scale, y: cy / scale };
    }
    // 블록(영역) 선택 — 획들의 점 좌표를 감싸는 경계 상자, 두 상자가 겹치는지 판정.
    function computeBounds(strokes) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      strokes.forEach(s => (s.pts || []).forEach(pt => {
        if (pt.x < minX) minX = pt.x; if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x; if (pt.y > maxY) maxY = pt.y;
      }));
      return minX === Infinity ? null : { minX, minY, maxX, maxY };
    }
    function rectsIntersect(a, b) {
      return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
    }
    return { applyStrokeStyle, strokeSmoothPath, paintStroke, renderLayersToCanvas, addPointsFromEvent, getPagePos, computeBounds, rectsIntersect };
  })();

  /* ══════════════════════════════════════════════════════════
     7. Tools — 필기 도구 전역 상태 (모든 마운트된 페이지가 공유)
  ══════════════════════════════════════════════════════════ */
  const Tools = (function () {
    let penMode = false, tool = 'pen', color = Color.PEN_COLORS[0], size = 3, opacity = 1;
    return {
      isPenMode: () => penMode,
      setPenMode(v) { penMode = !!v; },
      getTool: () => tool,
      setTool(t) { tool = t; },
      getColor: () => color,
      setColor(c) { color = c; },
      getSize: () => size,
      setSize(s) { size = clamp(parseInt(s, 10) || size, 1, 60); },
      getOpacity: () => opacity,
      setOpacity(o) { opacity = o; }
    };
  })();

  /* ══════════════════════════════════════════════════════════
     8. Page — 페이지 마운트(캔버스/오버레이 생성 + 이벤트 와이어링)
  ══════════════════════════════════════════════════════════ */
  const Page = (function () {
    const EL_DRAG_THRESHOLD = 6; // 화면 px
    const mounted = {}; // pos -> {scale, canvas, liveCanvas, elLayer, drawBackground}
    let isDrawing = false, curStroke = null, curLayerId = null, curPos = null;
    let liveCanvas = null, liveCtx = null, inkRAF = null;
    // 블록(영역) 선택 — 확정된 선택은 groupSel, 드래그로 사각 영역을 지정하는 중이면
    // marquee, 선택된 획들을 함께 옮기는 중이면 groupDrag에 상태가 담긴다.
    let groupSel = null;  // {pos, layerId, ids:Set<string>}
    let marquee = null;   // {pos, layerId, startX, startY, curX, curY, pointerId}
    let groupDrag = null; // {pos, layerId, ids, origPtsById:Map, startX, startY, pointerId, moved, dx, dy}

    function templateBackground(ctx, w, h, template) {
      ctx.save();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      if (template === 'lined') {
        ctx.strokeStyle = '#d8d4c8'; ctx.lineWidth = 1;
        const gap = Math.max(18, h / 40);
        for (let y = gap; y < h; y += gap) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
      } else if (template === 'grid') {
        ctx.strokeStyle = '#d8d4c8'; ctx.lineWidth = 1;
        const gap = Math.max(18, Math.min(w, h) / 30);
        for (let x = gap; x < w; x += gap) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); }
        for (let y = gap; y < h; y += gap) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
      }
      ctx.restore();
    }

    // wrapEl 안에 ink/ink-live/el-layer 캔버스·오버레이를 만들고 이벤트를 건다.
    // opts: { pos, widthPx, heightPx, scale, drawBackground(ctx,w,h) 또는 template,
    //         onElementPlacement(kind,pos,layerId,x,y), onTextTap, onImageTap, onMediaTap }
    function mountPage(wrapEl, opts) {
      const pos = opts.pos, scale = opts.scale;
      wrapEl.id = 'page-wrap-' + pos;
      wrapEl.style.width = opts.widthPx + 'px';
      wrapEl.style.height = opts.heightPx + 'px';

      const bgCanvas = document.createElement('canvas');
      bgCanvas.width = opts.widthPx; bgCanvas.height = opts.heightPx;
      wrapEl.appendChild(bgCanvas);
      if (opts.drawBackground) opts.drawBackground(bgCanvas.getContext('2d'), opts.widthPx, opts.heightPx);
      else templateBackground(bgCanvas.getContext('2d'), opts.widthPx, opts.heightPx, opts.template || 'blank');

      const hlLayer = document.createElement('div');
      hlLayer.className = 'hl-layer'; hlLayer.id = 'hl-layer-' + pos;
      hlLayer.style.width = opts.widthPx + 'px'; hlLayer.style.height = opts.heightPx + 'px';
      wrapEl.appendChild(hlLayer);

      const ink = document.createElement('canvas');
      ink.className = 'ink-canvas' + (Tools.isPenMode() ? ' pen-active' : ''); ink.id = 'ink-' + pos;
      ink.width = opts.widthPx; ink.height = opts.heightPx;
      ink.style.width = opts.widthPx + 'px'; ink.style.height = opts.heightPx + 'px';
      wrapEl.appendChild(ink);

      const inkLive = document.createElement('canvas');
      inkLive.className = 'ink-live-canvas'; inkLive.id = 'ink-live-' + pos;
      inkLive.width = opts.widthPx; inkLive.height = opts.heightPx;
      inkLive.style.width = opts.widthPx + 'px'; inkLive.style.height = opts.heightPx + 'px';
      wrapEl.appendChild(inkLive);

      const elLayer = document.createElement('div');
      elLayer.className = 'el-layer' + (Tools.isPenMode() ? ' pen-active' : ''); elLayer.id = 'elwrap-' + pos;
      elLayer.style.width = opts.widthPx + 'px'; elLayer.style.height = opts.heightPx + 'px';
      wrapEl.appendChild(elLayer);

      mounted[pos] = { scale, wrapEl, opts };
      setupInkEvents(ink, pos, scale, opts);
      redrawPage(pos);
      return { bgCanvas, ink, inkLive, elLayer, hlLayer };
    }

    function setPenModeClasses(penMode) {
      document.querySelectorAll('.ink-canvas').forEach(c => c.classList.toggle('pen-active', penMode));
      document.querySelectorAll('.el-layer').forEach(w => w.classList.toggle('pen-active', penMode));
    }

    function redrawPage(pos) {
      const m = mounted[pos];
      if (!m) return;
      const canvas = document.getElementById('ink-' + pos);
      if (!canvas) return;
      const layers = Elements.getLayerList(pos);
      const strokes = Elements.getAllElements(pos);
      Ink.renderLayersToCanvas(canvas.getContext('2d'), layers, strokes, m.scale, canvas.width, canvas.height);
      drawElementOverlay(pos);
      drawSelectionOverlay(pos);
    }

    function selectionBounds(pos, layerId, ids) {
      const strokes = Elements.getElements(pos, layerId).filter(el => el.type === 'ink' && ids.has(el.id));
      return Ink.computeBounds(strokes);
    }
    function pointInBounds(b, x, y, margin) {
      if (!b) return false;
      return x >= b.minX - margin && x <= b.maxX + margin && y >= b.minY - margin && y <= b.maxY + margin;
    }
    // 확정된 블록 선택을 점선 사각형으로 표시한다 — 그리는 중이 아닐 때도 ink-live
    // 캔버스에 계속 남아있어야 하므로 redrawPage() 끝에서 매번 다시 그린다.
    function drawSelectionOverlay(pos) {
      const liveC = document.getElementById('ink-live-' + pos);
      if (!liveC) return;
      const ctx = liveC.getContext('2d');
      ctx.clearRect(0, 0, liveC.width, liveC.height);
      if (!groupSel || groupSel.pos !== pos || !groupSel.ids.size) return;
      const scale = mounted[pos] ? mounted[pos].scale : 1;
      const b = selectionBounds(pos, groupSel.layerId, groupSel.ids);
      if (!b) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(232,64,28,0.9)';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.minX * scale - 5, b.minY * scale - 5, (b.maxX - b.minX) * scale + 10, (b.maxY - b.minY) * scale + 10);
      ctx.restore();
    }
    function clearSelection() {
      const pos = groupSel ? groupSel.pos : null;
      groupSel = null;
      if (pos !== null) redrawPage(pos);
    }
    function getSelection() { return groupSel ? { pos: groupSel.pos, layerId: groupSel.layerId, ids: Array.from(groupSel.ids) } : null; }
    // 블록 선택된 획을 전부 지운다 — 하나의 undo 단위로 기록된다(Elements.deleteElements).
    function deleteSelectedGroup() {
      if (!groupSel || !groupSel.ids.size) return false;
      const { pos, layerId, ids } = groupSel;
      Elements.deleteElements(pos, layerId, Array.from(ids));
      groupSel = null;
      redrawPage(pos);
      return true;
    }

    function drawElementOverlay(pos) {
      const m = mounted[pos];
      const wrap = document.getElementById('elwrap-' + pos);
      if (!wrap || !m) return;
      wrap.innerHTML = '';
      const layers = Elements.getLayerList(pos);
      const scale = m.scale;
      layers.forEach(layer => {
        if (!layer.visible) return;
        Elements.getElements(pos, layer.id).forEach(el => {
          if (el.type === 'text') wrap.appendChild(buildTextNode(pos, layer.id, el, scale, m.opts));
          else if (el.type === 'image') wrap.appendChild(buildImageNode(pos, layer.id, el, scale, m.opts));
          else if (el.type === 'media') wrap.appendChild(buildMediaNode(pos, layer.id, el, scale, m.opts));
        });
      });
    }

    function makeElementDraggable(node, pos, layerId, el, onTap, alwaysTappable) {
      let dragging = false, pointerId = null, startX = 0, startY = 0, fromX = 0, fromY = 0, canDrag = false;
      node.addEventListener('pointerdown', e => {
        canDrag = Tools.isPenMode() && layerId === Elements.getActiveLayerId(pos);
        if (!canDrag && !alwaysTappable) return;
        pointerId = e.pointerId; dragging = false;
        startX = e.clientX; startY = e.clientY; fromX = el.x; fromY = el.y;
        node.setPointerCapture(pointerId);
      });
      node.addEventListener('pointermove', e => {
        if (pointerId === null || e.pointerId !== pointerId || !canDrag) return;
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (!dragging && (dx * dx + dy * dy) > EL_DRAG_THRESHOLD * EL_DRAG_THRESHOLD) dragging = true;
        if (!dragging) return;
        const scale = mounted[pos].scale;
        el.x = fromX + dx / scale; el.y = fromY + dy / scale;
        node.style.left = (el.x * scale) + 'px'; node.style.top = (el.y * scale) + 'px';
      });
      function endDrag(e) {
        if (pointerId === null || (e && e.pointerId !== pointerId)) return;
        pointerId = null;
        if (dragging && canDrag) {
          Elements.updateElement(pos, layerId, el.id, { x: fromX, y: fromY }, { x: el.x, y: el.y });
        } else if (onTap) onTap(canDrag);
        dragging = false;
      }
      node.addEventListener('pointerup', endDrag);
      node.addEventListener('pointercancel', endDrag);
    }
    function makeResizeHandle(handle, pos, layerId, el, imgWrap) {
      let pointerId = null, startX = 0, fromW = 0, fromH = 0, ratio = 1;
      handle.addEventListener('pointerdown', e => {
        if (!Tools.isPenMode() || layerId !== Elements.getActiveLayerId(pos)) return;
        e.stopPropagation();
        pointerId = e.pointerId; startX = e.clientX; fromW = el.width; fromH = el.height; ratio = fromW / fromH || 1;
        handle.setPointerCapture(pointerId);
      });
      handle.addEventListener('pointermove', e => {
        if (pointerId === null || e.pointerId !== pointerId) return;
        const scale = mounted[pos].scale;
        const dx = (e.clientX - startX) / scale;
        const w = Math.max(20, fromW + dx), h = w / ratio;
        el.width = w; el.height = h;
        imgWrap.style.width = (w * scale) + 'px'; imgWrap.style.height = (h * scale) + 'px';
      });
      function endResize(e) {
        if (pointerId === null || (e && e.pointerId !== pointerId)) return;
        pointerId = null;
        Elements.updateElement(pos, layerId, el.id, { width: fromW, height: fromH }, { width: el.width, height: el.height });
      }
      handle.addEventListener('pointerup', endResize);
      handle.addEventListener('pointercancel', endResize);
    }
    // 필기 지도용으로 무난한 3종만 제공 — 목록을 늘리고 싶으면 여기만 고치면 된다.
    const TEXT_FONT_FAMILIES = {
      gothic: "'Noto Sans KR',sans-serif",
      serif: "'Noto Serif KR',serif",
      handwriting: "'Gaegu',cursive"
    };
    function buildTextNode(pos, layerId, el, scale, opts) {
      const node = document.createElement('div');
      node.className = 'el-node el-text';
      node.style.left = (el.x * scale) + 'px'; node.style.top = (el.y * scale) + 'px';
      node.style.fontSize = ((el.fontSize || 16) * scale) + 'px';
      node.style.color = el.color || '#1a1814';
      node.style.fontWeight = el.bold ? 'bold' : 'normal';
      node.style.fontFamily = TEXT_FONT_FAMILIES[el.fontFamily] || TEXT_FONT_FAMILIES.gothic;
      node.textContent = el.content || '';
      makeElementDraggable(node, pos, layerId, el, () => opts.onTextTap && opts.onTextTap(pos, layerId, el));
      return node;
    }
    // 이미지 요소는 el.rotation(0/90/180/270)을 지원한다. 90도 회전마다 바운딩
    // 박스의 가로/세로가 서로 바뀌므로(회전 전 100x60 → 90도 회전 후 60x100),
    // rotateImageElement 쪽에서 width/height를 같이 스왑해 el에 저장해둔다 — 여기서는
    // 그 값을 그대로 읽어 "회전 전 크기(swap된 값)"로 그린 뒤 중앙 기준으로 돌리기만 한다.
    function buildImageNode(pos, layerId, el, scale, opts) {
      const wrap = document.createElement('div');
      wrap.className = 'el-node el-image-wrap';
      wrap.style.left = (el.x * scale) + 'px'; wrap.style.top = (el.y * scale) + 'px';
      wrap.style.width = (el.width * scale) + 'px'; wrap.style.height = (el.height * scale) + 'px';
      if (el.opacity != null) wrap.style.opacity = el.opacity;
      const img = document.createElement('img');
      img.className = 'el-image'; img.src = Storage.normalizeAssetSrc(el.src); img.draggable = false;
      if (el.brightness != null && el.brightness !== 1) img.style.filter = 'brightness(' + el.brightness + ')';
      const rot = el.rotation || 0;
      const flipX = el.flipH ? -1 : 1, flipY = el.flipV ? -1 : 1;
      const scalePart = (flipX !== 1 || flipY !== 1) ? ' scale(' + flipX + ',' + flipY + ')' : '';
      if (rot === 90 || rot === 270) {
        img.style.position = 'absolute'; img.style.left = '50%'; img.style.top = '50%';
        img.style.width = (el.height * scale) + 'px'; img.style.height = (el.width * scale) + 'px';
        img.style.transform = 'translate(-50%,-50%) rotate(' + rot + 'deg)' + scalePart;
      } else if (rot === 180 || scalePart) {
        img.style.transform = (rot === 180 ? 'rotate(180deg)' : '') + scalePart;
      }
      wrap.appendChild(img);
      const handle = document.createElement('div');
      handle.className = 'el-resize-handle';
      wrap.appendChild(handle);
      makeElementDraggable(wrap, pos, layerId, el, () => opts.onImageTap && opts.onImageTap(pos, layerId, el));
      makeResizeHandle(handle, pos, layerId, el, wrap);
      wireHoverCaption(wrap, () => el.description);
      return wrap;
    }
    function mediaPinIcon(el) { if (el.linkUrl) return '▶'; if (el.fileSrc) return '🔊'; return '📌'; }
    function buildMediaNode(pos, layerId, el, scale, opts) {
      const node = document.createElement('div');
      node.className = 'el-node el-media-pin';
      node.style.left = (el.x * scale) + 'px'; node.style.top = (el.y * scale) + 'px';
      node.textContent = mediaPinIcon(el);
      makeElementDraggable(node, pos, layerId, el, canEdit => opts.onMediaTap && opts.onMediaTap(pos, layerId, el, !canEdit), true);
      wireHoverCaption(node, () => el.description);
      return node;
    }
    // 클릭하지 않고도 설명(캡션)을 바로 볼 수 있게 하는 공용 컴포넌트 — 이미지/
    // 오디오·영상 핀이 전부 이 함수 하나를 공유한다. 데스크탑은 마우스 호버, 터치/펜은
    // 길게 누르기로 같은 말풍선을 띄운다. getCaption()이 빈 값을 주면 아무 것도 안 뜬다
    // (요소가 나중에 캡션을 추가/삭제해도 항상 최신 값을 읽도록 콜백 형태로 받는다).
    let tooltipEl = null;
    function getTooltipEl() {
      if (tooltipEl) return tooltipEl;
      tooltipEl = document.createElement('div');
      tooltipEl.style.cssText = 'position:fixed;transform:translate(-50%,-100%);background:#1a1814;color:#fff;padding:6px 10px;border-radius:6px;font-size:12px;font-family:sans-serif;line-height:1.4;white-space:pre-wrap;max-width:220px;pointer-events:none;opacity:0;transition:opacity .15s;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,.3);';
      document.body.appendChild(tooltipEl);
      return tooltipEl;
    }
    function showCaptionTooltip(text, x, y) {
      const b = getTooltipEl();
      b.textContent = text;
      b.style.left = x + 'px'; b.style.top = y + 'px';
      b.style.opacity = '1';
    }
    function hideCaptionTooltip() { if (tooltipEl) tooltipEl.style.opacity = '0'; }
    function wireHoverCaption(node, getCaption) {
      const LONG_PRESS_MS = 450;
      let pressTimer = null;
      function reveal() {
        const text = getCaption();
        if (!text) return; // 설명이 없으면 아예 안 띄움
        const r = node.getBoundingClientRect();
        showCaptionTooltip(text, r.left + r.width / 2, r.top - 6);
      }
      node.addEventListener('mouseenter', reveal); // 데스크탑: 마우스 호버
      node.addEventListener('mouseleave', hideCaptionTooltip);
      node.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return; // 마우스는 mouseenter로 충분
        pressTimer = setTimeout(reveal, LONG_PRESS_MS); // 터치/펜: 길게 누르기
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(evt => node.addEventListener(evt, () => { clearTimeout(pressTimer); hideCaptionTooltip(); }));
    }

    function setupInkEvents(canvas, pos, scale, opts) {
      canvas.addEventListener('pointerdown', e => {
        if (!Tools.isPenMode()) return;
        if (Events.isLocked()) { if (opts.onLockedInput) opts.onLockedInput(); return; } // 구조 변경 직후 짧은 잠금 구간 — 옛 상태에 그리는 사고 방지
        const layerId = Elements.getActiveLayerId(pos);
        const tool = Tools.getTool();
        if (tool === 'text' || tool === 'media') {
          const p = Ink.getPagePos(e, canvas, mounted[pos].scale);
          if (opts.onElementPlacement) opts.onElementPlacement(tool, pos, layerId, p.x, p.y);
          return;
        }
        if (tool === 'select') {
          const p = Ink.getPagePos(e, canvas, mounted[pos].scale);
          // 1) 이미 선택된 영역 안을 다시 눌렀으면 → 선택된 획 전체를 함께 이동 시작
          if (groupSel && groupSel.pos === pos && groupSel.layerId === layerId && groupSel.ids.size &&
              pointInBounds(selectionBounds(pos, layerId, groupSel.ids), p.x, p.y, 8)) {
            startGroupDrag(pos, layerId, groupSel.ids, p, e.pointerId, canvas);
            return;
          }
          // 2) 획 하나를 탭했으면 → 그 하나로 선택을 교체하고 바로 이동 시작(기존 단일 선택과 같은 사용감)
          const stroke = Elements.findStrokeNear(pos, layerId, p.x, p.y);
          if (stroke) {
            groupSel = { pos, layerId, ids: new Set([stroke.id]) };
            startGroupDrag(pos, layerId, groupSel.ids, p, e.pointerId, canvas);
            return;
          }
          // 3) 빈 곳을 눌렀으면 → 드래그로 사각 영역을 지정하는 블록 선택 시작
          groupSel = null;
          marquee = { pos, layerId, startX: p.x, startY: p.y, curX: p.x, curY: p.y, pointerId: e.pointerId };
          canvas.setPointerCapture(e.pointerId);
          redrawPage(pos);
          return;
        }
        isDrawing = true; curLayerId = layerId; curPos = pos;
        curStroke = { tool, color: Tools.getColor(), size: Tools.getSize(), opacity: Tools.getOpacity(), pts: [], pointerType: e.pointerType };
        canvas.setPointerCapture(e.pointerId);
        liveCanvas = document.getElementById('ink-live-' + pos);
        liveCtx = liveCanvas ? liveCanvas.getContext('2d') : null;
        if (liveCtx) liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
        Ink.addPointsFromEvent(e, canvas, mounted[pos].scale, curStroke.pts);
        scheduleInkFrame();
      });
      canvas.addEventListener('pointermove', e => {
        if (!isDrawing) return;
        if (e.buttons === 0) { endStroke(); return; } // pointerup 유실 방어 — "유령 필기" 방지
        Ink.addPointsFromEvent(e, canvas, mounted[pos].scale, curStroke.pts);
        scheduleInkFrame();
      });
      canvas.addEventListener('pointerup', endStroke);
      canvas.addEventListener('pointerleave', endStroke);
      canvas.addEventListener('pointercancel', endStroke);

      // ── 블록 선택: 사각 영역(마퀴) 드래그 ──
      canvas.addEventListener('pointermove', e => {
        if (!marquee || e.pointerId !== marquee.pointerId) return;
        const p = Ink.getPagePos(e, canvas, mounted[pos].scale);
        marquee.curX = p.x; marquee.curY = p.y;
        drawMarqueeOverlay(pos);
      });
      function endMarquee(e) {
        if (!marquee || (e && e.pointerId !== marquee.pointerId)) return;
        const { pos: p2, layerId: lid, startX, startY, curX, curY } = marquee;
        const liveC = document.getElementById('ink-live-' + p2);
        if (liveC) liveC.getContext('2d').clearRect(0, 0, liveC.width, liveC.height);
        marquee = null;
        const rect = { minX: Math.min(startX, curX), minY: Math.min(startY, curY), maxX: Math.max(startX, curX), maxY: Math.max(startY, curY) };
        const DRAG_MIN = 4; // 배율1 기준 px — 이보다 작은 드래그는 "탭"으로 보고 선택 해제만 한다
        if ((rect.maxX - rect.minX) < DRAG_MIN && (rect.maxY - rect.minY) < DRAG_MIN) { redrawPage(p2); return; }
        const ids = Elements.findStrokesInRect(p2, lid, rect);
        groupSel = ids.length ? { pos: p2, layerId: lid, ids: new Set(ids) } : null;
        redrawPage(p2);
      }
      canvas.addEventListener('pointerup', endMarquee);
      canvas.addEventListener('pointerleave', endMarquee);
      canvas.addEventListener('pointercancel', endMarquee);

      // ── 블록 선택: 선택된 획들을 함께 이동 ──
      canvas.addEventListener('pointermove', e => {
        if (!groupDrag || e.pointerId !== groupDrag.pointerId) return;
        const p = Ink.getPagePos(e, canvas, mounted[pos].scale);
        const scale = mounted[pos].scale;
        const dx = p.x - groupDrag.startX, dy = p.y - groupDrag.startY;
        if (!groupDrag.moved && Math.hypot(dx * scale, dy * scale) < EL_DRAG_THRESHOLD) return;
        groupDrag.moved = true; groupDrag.dx = dx; groupDrag.dy = dy;
        const liveC = document.getElementById('ink-live-' + pos);
        if (!liveC) return;
        const lctx = liveC.getContext('2d');
        lctx.clearRect(0, 0, liveC.width, liveC.height);
        Elements.getElements(pos, groupDrag.layerId).forEach(s => {
          if (!groupDrag.ids.has(s.id)) return;
          const orig = groupDrag.origPtsById.get(s.id);
          Ink.paintStroke(lctx, Object.assign({}, s, { pts: orig.map(pt => ({ x: pt.x + dx, y: pt.y + dy })) }), scale);
        });
      });
      function endGroupDrag(e) {
        if (!groupDrag || (e && e.pointerId !== groupDrag.pointerId)) return;
        const { pos: p2, layerId: lid, origPtsById, moved, dx, dy } = groupDrag;
        const liveC = document.getElementById('ink-live-' + p2);
        if (liveC) liveC.getContext('2d').clearRect(0, 0, liveC.width, liveC.height);
        if (moved) {
          const moves = [];
          origPtsById.forEach((origPts, id) => {
            moves.push({ id, from: { pts: origPts }, to: { pts: origPts.map(pt => ({ x: pt.x + dx, y: pt.y + dy })) } });
          });
          Elements.moveElements(p2, lid, moves); // 여러 획이어도 Undo 한 번으로 묶여서 기록됨
        }
        groupDrag = null;
        redrawPage(p2); // groupSel은 유지 — 이동 후에도 계속 선택된 상태로 남아 다시 옮기거나 삭제할 수 있다
      }
      canvas.addEventListener('pointerup', endGroupDrag);
      canvas.addEventListener('pointerleave', endGroupDrag);
      canvas.addEventListener('pointercancel', endGroupDrag);
    }
    function startGroupDrag(pos, layerId, ids, p, pointerId, canvas) {
      const strokes = Elements.getElements(pos, layerId).filter(el => el.type === 'ink' && ids.has(el.id));
      const origPtsById = new Map(strokes.map(s => [s.id, s.pts.map(pt => ({ x: pt.x, y: pt.y }))]));
      groupDrag = { pos, layerId, ids: new Set(ids), origPtsById, startX: p.x, startY: p.y, pointerId, moved: false, dx: 0, dy: 0 };
      canvas.setPointerCapture(pointerId);
    }
    function drawMarqueeOverlay(pos) {
      const liveC = document.getElementById('ink-live-' + pos);
      if (!liveC || !marquee) return;
      const scale = mounted[pos] ? mounted[pos].scale : 1;
      const ctx = liveC.getContext('2d');
      ctx.clearRect(0, 0, liveC.width, liveC.height);
      const x = Math.min(marquee.startX, marquee.curX) * scale, y = Math.min(marquee.startY, marquee.curY) * scale;
      const w = Math.abs(marquee.curX - marquee.startX) * scale, h = Math.abs(marquee.curY - marquee.startY) * scale;
      ctx.save();
      ctx.fillStyle = 'rgba(232,64,28,0.12)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(232,64,28,0.8)';
      ctx.setLineDash([5, 3]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }
    function scheduleInkFrame() { if (inkRAF !== null) return; inkRAF = requestAnimationFrame(flushInkFrame); }
    function flushInkFrame() {
      inkRAF = null;
      if (!isDrawing || !curStroke) return;
      const scale = mounted[curPos].scale;
      if (curStroke.tool === 'er') {
        const realCanvas = document.getElementById('ink-' + curPos);
        if (!realCanvas) return;
        const rctx = realCanvas.getContext('2d');
        rctx.save(); Ink.applyStrokeStyle(rctx, curStroke, scale); Ink.strokeSmoothPath(rctx, curStroke.pts, scale); rctx.restore();
        return;
      }
      if (!liveCtx) return;
      liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
      liveCtx.save(); Ink.applyStrokeStyle(liveCtx, curStroke, scale); Ink.strokeSmoothPath(liveCtx, curStroke.pts, scale); liveCtx.restore();
    }
    function endStroke() {
      if (!isDrawing) return;
      isDrawing = false;
      if (inkRAF !== null) { cancelAnimationFrame(inkRAF); inkRAF = null; }
      if (liveCtx && liveCanvas) liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
      liveCanvas = null; liveCtx = null;
      if (curStroke && curLayerId && curPos !== null) {
        curStroke.type = 'ink';
        Elements.addElement(curPos, curLayerId, curStroke);
        redrawPage(curPos);
      }
      curStroke = null; curLayerId = null; curPos = null;
    }
    function resetStuckDrawing() { endStroke(); }
    window.addEventListener('blur', resetStuckDrawing);
    document.addEventListener('visibilitychange', () => { if (document.hidden) resetStuckDrawing(); });

    function unmountAll() { for (const k in mounted) delete mounted[k]; groupSel = null; marquee = null; groupDrag = null; }

    // 마우스 휠로 이전/다음 페이지 이동. 확대 상태(scale>1)면 휠은 화면을 훑어보는
    // 용도가 우선이어야 하므로 페이지 전환을 하지 않고, 필기 모드 중에도 화면이
    // 실수로 넘어가면 안 되므로 막는다 — 둘 다 opts.canNavigate()로 판단을 맡긴다.
    // 좌우(가로) 휠/트랙패드 제스처는 페이지 전환 대상이 아니므로 무시한다.
    function initWheelNav(containerEl, opts) {
      let cooldown = false;
      containerEl.addEventListener('wheel', e => {
        if (!opts.canNavigate || !opts.canNavigate()) return;
        if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
        e.preventDefault();
        if (cooldown) return;
        cooldown = true; setTimeout(() => { cooldown = false; }, 350);
        if (opts.onDelta) opts.onDelta(e.deltaY > 0 ? 1 : (e.deltaY < 0 ? -1 : 0));
      }, { passive: false });
    }

    return {
      mountPage, redrawPage, drawElementOverlay, setPenModeClasses, unmountAll, templateBackground, initWheelNav,
      clearSelection, getSelection, deleteSelectedGroup, TEXT_FONT_FAMILIES,
      getPageSize1: pos => { const c = document.getElementById('ink-' + pos); const scale = mounted[pos] ? mounted[pos].scale : 1; return c ? { w: c.width / scale, h: c.height / scale } : { w: 600, h: 800 }; }
    };
  })();

  /* ══════════════════════════════════════════════════════════
     9. Sync — 서버 동기화 + 충돌 감지(자동 병합/덮어쓰기 금지)
  ══════════════════════════════════════════════════════════ */
  const Sync = (function () {
    const checked = new Set(); // 이번 세션에서 이미 비교를 마친 pageId

    async function checkPageSync(bookId, pos) {
      const pageId = PageOrder.pageIdOf(pos);
      const key = bookId + '__' + pageId;
      if (checked.has(key)) return { status: 'skipped' };
      if (!(await Storage.ping())) return { status: 'offline' };
      const j = await Storage.fetchRemoteLayer(bookId, pageId);
      checked.add(key);
      if (!j || !j.found) return { status: 'no-remote' };
      Device.noteOtherDevice(j.device, j.deviceId);
      const rec = Elements.record(pos);
      const localSavedAt = rec.savedAt, lastSyncAt = rec.lastSyncAt, serverSavedAt = j.savedAt || '';
      const localHasContent = Object.keys(rec.strokes).some(k => (rec.strokes[k] || []).length > 0);
      const serverHasContent = !!(j.strokes && Object.keys(j.strokes).some(k => (j.strokes[k] || []).length > 0));
      const localChanged = localHasContent && !!localSavedAt && (!lastSyncAt || localSavedAt > lastSyncAt);
      const serverChanged = serverHasContent && (!lastSyncAt || serverSavedAt > lastSyncAt);
      if (!localChanged && !serverChanged) {
        if (serverSavedAt) Storage.setLastSyncAt(bookId, pageId, serverSavedAt);
        return { status: 'synced' };
      }
      if (serverChanged && !localChanged) {
        applyServerData(bookId, pos, j);
        Storage.setLastSyncAt(bookId, pageId, serverSavedAt);
        return { status: 'applied-server', serverJson: j };
      }
      if (localChanged && !serverChanged) {
        Storage.pushLayerToServer(bookId, pageId, rec);
        return { status: 'pushed-local' };
      }
      return { status: 'conflict', serverJson: j }; // 자동 처리 금지 — 뷰어가 사용자에게 물어본다
    }

    function applyServerData(bookId, pos, serverJson) {
      const pageId = PageOrder.pageIdOf(pos);
      const rec = Elements.record(pos);
      if (Array.isArray(serverJson.layers) && serverJson.layers.length) { rec.layers = serverJson.layers; rec.activeLayerId = serverJson.layers[0].id; }
      rec.strokes = serverJson.strokes || {};
      rec.savedAt = serverJson.savedAt || nowIso();
      Storage.saveLayer(bookId, pageId, rec, { skipServerPush: true, savedAt: rec.savedAt });
      Page.redrawPage(pos);
    }

    async function resolveConflict(bookId, pos, choice, serverJson) {
      const pageId = PageOrder.pageIdOf(pos);
      if (choice === 'local') {
        await Storage.pushLayerToServer(bookId, pageId, Elements.record(pos));
      } else if (choice === 'server') {
        applyServerData(bookId, pos, serverJson);
        Storage.setLastSyncAt(bookId, pageId, serverJson.savedAt);
      } else if (choice === 'both') {
        Storage.stashBackup(bookId, pageId, { layers: serverJson.layers, strokes: serverJson.strokes });
        await Storage.pushLayerToServer(bookId, pageId, Elements.record(pos));
      }
      Page.redrawPage(pos);
    }

    async function manualSaveNow(bookId, pos) {
      const pageId = PageOrder.pageIdOf(pos);
      return Storage.pushLayerToServer(bookId, pageId, Elements.record(pos));
    }

    return { checkPageSync, applyServerData, resolveConflict, manualSaveNow };
  })();

  /* ══════════════════════════════════════════════════════════
     10. PWA — 오프라인 캐싱 (실제 서버 ping 기반, navigator.onLine 미사용)
  ══════════════════════════════════════════════════════════ */
  const PWA = (function () {
    let serverOnline = false;
    let precacheRunning = false;

    async function refreshServerOnline(timeoutMs) {
      const wasOnline = serverOnline;
      serverOnline = await Storage.ping(timeoutMs);
      return { online: serverOnline, wasOnline };
    }
    function isServerOnline() { return serverOnline; }

    function registerServiceWorker(swUrl, opts) {
      opts = opts || {};
      if (!('serviceWorker' in navigator)) { console.warn('[ann-engine] Service Worker 미지원'); return; }
      window.addEventListener('load', () => {
        navigator.serviceWorker.register(swUrl, { scope: './' })
          .then(reg => { if (opts.onRegistered) opts.onRegistered(reg); })
          .catch(e => { if (opts.onError) opts.onError(e); });
      });
    }

    async function isCached(url) {
      if (!('caches' in window)) return false;
      try { return !!(await caches.match(url)); } catch (e) { return false; }
    }

    // urls 전체를 cacheName에 미리 받아둔다. 이미 있는 건 건너뛴다.
    async function precacheAll(cacheName, urls, opts) {
      opts = opts || {};
      if (precacheRunning) { if (opts.manual && opts.onBusy) opts.onBusy(); return; }
      if (!('caches' in window)) return;
      if (!serverOnline) { const r = await refreshServerOnline(); if (!r.online) { if (opts.onUnavailable) opts.onUnavailable(); return; } }
      precacheRunning = true;
      try {
        const cache = await caches.open(cacheName);
        const pending = [];
        for (const url of urls) { if (!(await cache.match(url))) pending.push(url); }
        const total = urls.length, alreadyDone = total - pending.length;
        if (pending.length === 0) { if (opts.manual && opts.onDone) opts.onDone(total, total); return; }
        let done = alreadyDone, quotaFailed = false, otherFailed = 0;
        if (opts.onProgress) opts.onProgress(done, total);
        let idx = 0;
        const concurrency = opts.concurrency || 3;
        const worker = async () => {
          while (idx < pending.length) {
            const url = pending[idx++];
            try {
              const res = await fetch(url, { cache: 'no-store' });
              if (res && res.ok) { await cache.put(url, res); done++; } else { otherFailed++; }
            } catch (e) {
              if (e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || ''))) quotaFailed = true; else otherFailed++;
            }
            if (opts.onProgress) opts.onProgress(done, total);
          }
        };
        await Promise.all(Array.from({ length: concurrency }, worker));
        if (quotaFailed) { if (opts.onError) opts.onError('quota'); }
        else if (otherFailed > 0) { if (opts.onError) opts.onError('partial', otherFailed); }
        else if (opts.onDone) opts.onDone(done, total);
      } finally { precacheRunning = false; }
    }

    return { refreshServerOnline, isServerOnline, registerServiceWorker, isCached, precacheAll };
  })();

  /* ══════════════════════════════════════════════════════════
     공개 API
  ══════════════════════════════════════════════════════════ */
  const AnnotationEngine = {
    Storage, Device, Events, PageOrder, Elements, Color, Ink, Tools, Page, Sync, PWA,
    genElementId, genPageId,

    // bookId(=PDF 파일명, 확장자 제외) 전환 — 새 교재를 열 때 반드시 호출.
    setBook(bookId) { Elements.setBook(bookId); Page.unmountAll(); },
    async initPageOrder(bookId, pdfNumPages) { return PageOrder.init(bookId, pdfNumPages); },
    resetHistory() { Elements.resetHistory(); }
  };

  global.AnnotationEngine = AnnotationEngine;
})(window);
