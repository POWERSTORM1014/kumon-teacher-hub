// subjects/chinese/chinese-data.js
// 중국어 전용 큐레이션 데이터 — 교재 목록/목차. bookId는 항상 PDF 파일명(확장자 제외).
// AnnotationEngine과는 무관한 순수 콘텐츠 데이터라 여기 과목 폴더에 둔다.
// (PAGE_MAPS는 아직 단원별 목차/요점정리를 정리해두지 않아 비워둔다 — viewer.js는
// PAGE_MAPS[bookId]가 없으면 "N페이지" 같은 기본 라벨로 자동 대체하므로 정상 동작한다.)

// pdf/kumon-chinese-*.pdf를 인식해서 자료실 목록에 그대로 노출한다.
const MATERIALS = [
  { file: 'kumon-chinese-D-131-140.pdf', subject: '중국어', stage: 'D', range: 'D131~D140', icon: '🇨🇳', category: 'textbook', label: 'D단계 교재 (D131~D140)', archived: true }, // 초기 샘플(구방식) — 자료실 화면에서 숨김(2026-10-11)
  { bookId: 'kumon-chinese-001-3A', kind: 'image', subject: '중국어', stage: '3A', range: '1~50장', icon: '🇨🇳', category: 'textbook', label: '3A단계 교재 원본+정답 (1~50장, 진행중)' },
];
function bookIdOf(material) { return material.bookId || material.file.replace(/\.pdf$/i, ''); }
function materialByBookId(bookId) { return MATERIALS.find(m => bookIdOf(m) === bookId) || null; }

// 교재별 페이지 지도(PDF 실제 페이지 번호 → 표시 라벨) — 아직 정리된 게 없음.
const PAGE_MAPS = {};

(function buildC001Page3AMap() {
  const TOTAL_SHEETS = 50; // 현재 1~50장까지만 캡처 완료(진행 중) — 추후 51~200 업로드 시 숫자 갱신 필요
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: '3A ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-chinese-001-3A'] = entries;
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
