// shared/image-viewer.js — 교재 낱장 캡처(원본+정답오버레이) 전용 경량 뷰어.
//
// 기존 shared/annotation-engine.js(필기 레이어, 7개 과목 뷰어+자료실+나의폴더 공용,
// 2600여 줄)와는 완전히 독립된 신규 파일이다. 이 뷰어는 필기/편집 기능이 전혀 없는
// "원본 이미지 + 고정 정답오버레이 토글"만 하는 읽기 전용 화면이라, 기존 엔진을
// 재사용하지 않고 따로 만들었다 — 설계 이유는 DESIGN-image-capture-viewer.md 1-D 참고.
//
// URL 파라미터: ?book=<bookId> (예: image-viewer.html?book=kumon-japanese-002-3A)
//
// 접근 제한 보완(DESIGN-image-capture-viewer.md 1-A-1): 이미지 URL은 bookId만으로
// 조립할 수 없다 — 먼저 /api/image-books/:bookId로 메타데이터(pathToken 포함)를
// 조회해야 하고, 이 파일이 그 조회와 URL 조립을 전부 담당한다. 정적 HTML(image-viewer.html)
// 어디에도 완성된 이미지 URL이 미리 박혀있지 않다.

(function () {
  'use strict';

  const SITE_ROOT = location.href.replace(/shared\/image-viewer\.html.*$/, '').replace(/\?.*$/, '');
  const WORKERS_API_URL = 'https://kumon-teacher-hub-api.kumon-teacher-hub-api.workers.dev/api/';
  const API_BASE_URL = (function () {
    const h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return SITE_ROOT + 'api/';
    return WORKERS_API_URL;
  })();

  // R2 공개 버킷(kumon-page-captures) dev URL — PDF_BASE_URL(annotation-engine.js)과
  // 같은 패턴. 이 상수 하나가 유일한 설정 지점이다.
  const CAPTURES_BASE_URL = 'https://pub-f6db5a787c604d65916b9791cc7aa24a.r2.dev/';

  function qs(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function imgUrl(book, n, side, kind) {
    const num = String(n).padStart(3, '0');
    const ext = kind === 'base' ? book.baseExt : book.overlayExt;
    return CAPTURES_BASE_URL + book.bookId + '/' + book.pathToken + '/' + kind + '/' + num + '-' + side + '.' + ext;
  }

  async function fetchBook(bookId) {
    const res = await fetch(API_BASE_URL + 'image-books/' + encodeURIComponent(bookId));
    if (!res.ok) throw new Error('metadata fetch failed: ' + res.status);
    return res.json();
  }

  function setStatus(html) {
    document.getElementById('main').innerHTML = '<div id="statusMsg">' + html + '</div>';
  }

  async function init() {
    const bookId = qs('book');
    if (!bookId) { setStatus('book 파라미터가 없습니다. 예: image-viewer.html?book=kumon-japanese-002-3A'); return; }

    let data;
    try {
      data = await fetchBook(bookId);
    } catch (e) {
      setStatus('메타데이터를 불러오지 못했습니다: ' + (e && e.message || e));
      return;
    }
    if (!data.found) { setStatus('해당 교재를 찾을 수 없습니다 (bookId: ' + bookId + ')'); return; }
    const book = data;

    document.getElementById('headerTitle').textContent = book.label || book.bookId;
    document.getElementById('headerBadge').textContent = (book.subjectLabel || book.subject || '') + ' · ' + (book.stage || '');
    document.title = (book.label || book.bookId) + ' — 구몬 학습 허브';

    const sides = book.sides && book.sides.length ? book.sides : ['a', 'b'];
    const pages = [];
    for (let n = 1; n <= book.totalPages; n++) {
      for (const side of sides) {
        pages.push({ n, side, label: n + side });
      }
    }

    let idx = 0;

    document.getElementById('main').innerHTML =
      '<div id="toolbar">' +
      '  <button id="prevBtn">◀ 이전</button>' +
      '  <span id="pageLabel"></span>' +
      '  <button id="nextBtn">다음 ▶</button>' +
      (book.hasOverlay ? '  <label><input type="checkbox" id="overlayToggle" checked> 정답 표시</label>' : '') +
      '</div>' +
      '<div id="stage"><img id="baseImg" alt="교재 원본">' +
      (book.hasOverlay ? '<img id="overlayImg" alt="정답 레이어">' : '') +
      '</div>';

    const sidebar = document.getElementById('sidebar');
    sidebar.style.display = '';
    document.getElementById('sidebarTitle').textContent = pages.length + '면 (1~' + book.totalPages + '장)';
    const thumbList = document.getElementById('thumbList');
    thumbList.innerHTML = pages.map((p, i) =>
      '<div class="thumb" data-i="' + i + '"><img loading="lazy" src="' + imgUrl(book, p.n, p.side, 'base') + '"><span>' + p.label + '</span></div>'
    ).join('');
    thumbList.querySelectorAll('.thumb').forEach(t => t.addEventListener('click', () => { idx = +t.dataset.i; render(); }));

    const baseImg = document.getElementById('baseImg');
    const overlayImg = book.hasOverlay ? document.getElementById('overlayImg') : null;
    const stage = document.getElementById('stage');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const pageLabel = document.getElementById('pageLabel');
    const overlayToggle = book.hasOverlay ? document.getElementById('overlayToggle') : null;

    // 페이지 실제 크기를 모르면(과목마다 캡처 해상도가 다를 수 있음) 첫 이미지 로드 시
    // naturalWidth/Height로 스테이지 비율을 맞춘다 — 하드코딩한 560x894를 쓰지 않는다.
    baseImg.addEventListener('load', () => {
      const w = baseImg.naturalWidth, h = baseImg.naturalHeight;
      if (w && h) {
        const maxW = Math.min(window.innerWidth - 280, 820);
        const maxH = window.innerHeight - 140;
        let dispW = maxW, dispH = dispW * (h / w);
        if (dispH > maxH) { dispH = maxH; dispW = dispH * (w / h); }
        stage.style.width = dispW + 'px';
        stage.style.height = dispH + 'px';
      }
    }, { once: false });

    function render() {
      const p = pages[idx];
      baseImg.src = imgUrl(book, p.n, p.side, 'base');
      if (overlayImg) overlayImg.src = imgUrl(book, p.n, p.side, 'overlay');
      pageLabel.textContent = p.label;
      prevBtn.disabled = idx === 0;
      nextBtn.disabled = idx === pages.length - 1;
      thumbList.querySelectorAll('.thumb').forEach((t, i) => t.classList.toggle('active', i === idx));
      const active = thumbList.querySelector('.thumb.active');
      if (active) active.scrollIntoView({ block: 'nearest' });
    }

    prevBtn.addEventListener('click', () => { if (idx > 0) { idx--; render(); } });
    nextBtn.addEventListener('click', () => { if (idx < pages.length - 1) { idx++; render(); } });
    if (overlayToggle) {
      overlayToggle.addEventListener('change', e => { overlayImg.style.display = e.target.checked ? 'block' : 'none'; });
    }
    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' && idx > 0) { idx--; render(); }
      if (e.key === 'ArrowRight' && idx < pages.length - 1) { idx++; render(); }
    });

    render();
  }

  init();
})();
