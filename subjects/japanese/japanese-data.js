// subjects/japanese/japanese-data.js
// 일본어 전용 큐레이션 데이터 — 교재 목록/목차. bookId는 항상 PDF 파일명(확장자 제외).
// AnnotationEngine과는 무관한 순수 콘텐츠 데이터라 여기 과목 폴더에 둔다.
// (PAGE_MAPS는 아직 단원별 목차/요점정리를 정리해두지 않아 비워둔다 — viewer.js는
// PAGE_MAPS[bookId]가 없으면 "N페이지" 같은 기본 라벨로 자동 대체하므로 정상 동작한다.)

// pdf/kumon-japanese-*.pdf를 인식해서 자료실 목록에 그대로 노출한다.
//
// kind:'image' 항목(교재 낱장 캡처 원본+정답오버레이, PDF 아님)은 file 대신 bookId를
// 직접 쓴다 — 업로드 스크립트(D:\kumon-page-edit\upload_page_captures.py)가 끝나면
// 콘솔에 출력해주는 내용을 그대로 붙여넣은 것이다. 클릭 시 분기는 viewer.js의
// renderList()/openMaterial() 참고. 설계: DESIGN-image-capture-viewer.md
const MATERIALS = [
  { file: 'kumon-japanese-C-171-180.pdf', subject: '일본어', stage: 'C', range: 'C171~C180', icon: '🇯🇵', category: 'textbook', label: 'C단계 교재 (C171~C180)' },
  { bookId: 'kumon-japanese-002-3A', kind: 'image', subject: '일본어', stage: '3A', range: '1~200장', icon: '🇯🇵', category: 'textbook', label: '3A단계 교재 원본+정답 (전체 200장)' },
];
function bookIdOf(material) { return material.bookId || material.file.replace(/\.pdf$/i, ''); }
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
