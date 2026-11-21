// subjects/math/math-data.js
// 수학 전용 큐레이션 데이터 — 교재 목록/목차. bookId는 항상 PDF 파일명(확장자 제외).
// AnnotationEngine과는 무관한 순수 콘텐츠 데이터라 여기 과목 폴더에 둔다.
// (science-data.js와 달리 아직 단원별 목차/요점정리를 정리해두지 않아 PAGE_MAPS는
// 비워둔다 — viewer.js는 PAGE_MAPS[bookId]가 없으면 "N페이지" 같은 기본 라벨로
// 자동 대체하므로 정상 동작한다. 나중에 채워 넣으면 목차/검색이 그대로 살아난다.)

// pdf/kumon-math-*.pdf 4개를 인식해서 자료실 목록에 그대로 노출한다.
// kind:'image' 항목(J/K/L/M/N/O단계)은 PDF가 아니라 교재 낱장 캡처 원본+정답오버레이를
// R2에 올린 것 — 구조는 japanese-data.js와 동일(설계: DESIGN-image-capture-viewer.md).
const MATERIALS = [
  { file: 'kumon-math-D-071-080.pdf', subject: '수학', stage: 'D', range: 'D71~D80', icon: '🔢', category: 'textbook', label: 'D단계 교재 (D71~D80)', archived: true }, // 초기 샘플(구방식) — 자료실 화면에서 숨김(2026-10-11)
  { file: 'kumon-math-D-131-140.pdf', subject: '수학', stage: 'D', range: 'D131~D140', icon: '➗', category: 'textbook', label: 'D단계 교재 (D131~D140)', archived: true }, // 초기 샘플(구방식) — 자료실 화면에서 숨김(2026-10-11)
  { file: 'kumon-math-E-171-180.pdf', subject: '수학', stage: 'E', range: 'E171~E180', icon: '✖️', category: 'textbook', label: 'E단계 교재 (E171~E180)', archived: true }, // 초기 샘플(구방식) — 자료실 화면에서 숨김(2026-10-11)
  { file: 'kumon-math-H-081-090.pdf', subject: '수학', stage: 'H', range: 'H81~H90', icon: '📐', category: 'textbook', label: 'H단계 교재 (H81~H90)', archived: true }, // 초기 샘플(구방식) — 자료실 화면에서 숨김(2026-10-11)
  { bookId: 'kumon-math-015-J', kind: 'image', subject: '수학', stage: 'J', range: '1~200장', icon: '🔢', category: 'textbook', label: 'J단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-math-016-K', kind: 'image', subject: '수학', stage: 'K', range: '1~200장', icon: '🔢', category: 'textbook', label: 'K단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-math-017-L', kind: 'image', subject: '수학', stage: 'L', range: '1~200장', icon: '🔢', category: 'textbook', label: 'L단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-math-018-M', kind: 'image', subject: '수학', stage: 'M', range: '1~200장', icon: '🔢', category: 'textbook', label: 'M단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-math-019-N', kind: 'image', subject: '수학', stage: 'N', range: '1~200장', icon: '🔢', category: 'textbook', label: 'N단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-math-020-O', kind: 'image', subject: '수학', stage: 'O', range: '1~200장', icon: '🔢', category: 'textbook', label: 'O단계 교재 원본+정답 (전체 200장)' },
];
function bookIdOf(material) { return material.bookId || material.file.replace(/\.pdf$/i, ''); }
function materialByBookId(bookId) { return MATERIALS.find(m => bookIdOf(m) === bookId) || null; }

// 교재별 페이지 지도(PDF 실제 페이지 번호 → 표시 라벨). kind:'image' 교재도 똑같이
// pdf 필드를 키로 쓴다(일어 데이터와 동일한 이유 — viewer.js 재사용).
const PAGE_MAPS = {};

// kumon-math-015-J(수학 J, 200장=400면, 1a,1b,2a,2b...200a,200b) — 업로드
// 스크립트가 보고한 totalPages(200)·sides(a,b) 그대로 기계적으로 생성.
(function buildM015PageJMap() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-11-21) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'J ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-math-015-J'] = entries;
})();

// kumon-math-016-K(수학 K, 200장=400면) — 위와 동일한 방식.
(function buildM016PageKMap() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-11-21) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'K ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-math-016-K'] = entries;
})();

// kumon-math-017-L(수학 L, 200장=400면) — 위와 동일한 방식.
(function buildM017PageLMap() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-11-21) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'L ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-math-017-L'] = entries;
})();

// kumon-math-018-M(수학 M, 200장=400면) — 위와 동일한 방식.
(function buildM018PageMMap() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-11-22) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'M ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-math-018-M'] = entries;
})();

// kumon-math-019-N(수학 N, 200장=400면) — 위와 동일한 방식.
(function buildM019PageNMap() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-11-22) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'N ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-math-019-N'] = entries;
})();

// kumon-math-020-O(수학 O, 200장=400면) — 위와 동일한 방식.
(function buildM020PageOMap() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-11-22) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'O ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-math-020-O'] = entries;
})();

// PAGE_MAPS에서 검색 인덱스를 자동 생성 — PAGE_MAPS가 채워지는 순간 검색도 자동으로 살아난다.
function buildSearchIndex() {
  const items = [];
  Object.keys(PAGE_MAPS).forEach(bookId => {
    PAGE_MAPS[bookId].forEach(entry => {
      items.push({ bookId, pdfPage: entry.pdf, label: entry.label, sub: entry.sub || '', keywords: (entry.label + ' ' + (entry.sub || '')).toLowerCase() });
    });
  });
  return items;
}
const SEARCH_INDEX = buildSearchIndex();
