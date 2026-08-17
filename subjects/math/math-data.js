// subjects/math/math-data.js
// 수학 전용 큐레이션 데이터 — 교재 목록/목차. bookId는 항상 PDF 파일명(확장자 제외).
// AnnotationEngine과는 무관한 순수 콘텐츠 데이터라 여기 과목 폴더에 둔다.
// (science-data.js와 달리 아직 단원별 목차/요점정리를 정리해두지 않아 PAGE_MAPS는
// 비워둔다 — viewer.js는 PAGE_MAPS[bookId]가 없으면 "N페이지" 같은 기본 라벨로
// 자동 대체하므로 정상 동작한다. 나중에 채워 넣으면 목차/검색이 그대로 살아난다.)

// pdf/kumon-math-*.pdf 4개를 인식해서 자료실 목록에 그대로 노출한다.
const MATERIALS = [
  { file: 'kumon-math-D-071-080.pdf', subject: '수학', stage: 'D', range: 'D71~D80', icon: '🔢', category: 'textbook', label: 'D단계 교재 (D71~D80)' },
  { file: 'kumon-math-D-131-140.pdf', subject: '수학', stage: 'D', range: 'D131~D140', icon: '➗', category: 'textbook', label: 'D단계 교재 (D131~D140)' },
  { file: 'kumon-math-E-171-180.pdf', subject: '수학', stage: 'E', range: 'E171~E180', icon: '✖️', category: 'textbook', label: 'E단계 교재 (E171~E180)' },
  { file: 'kumon-math-H-081-090.pdf', subject: '수학', stage: 'H', range: 'H81~H90', icon: '📐', category: 'textbook', label: 'H단계 교재 (H81~H90)' },
];
function bookIdOf(material) { return material.file.replace(/\.pdf$/i, ''); }
function materialByBookId(bookId) { return MATERIALS.find(m => bookIdOf(m) === bookId) || null; }

// 교재별 페이지 지도(PDF 실제 페이지 번호 → 표시 라벨) — 아직 정리된 게 없음.
const PAGE_MAPS = {};

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
