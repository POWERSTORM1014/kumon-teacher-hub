// subjects/japanese/japanese-data.js
// 일본어 전용 큐레이션 데이터 — 교재 목록/목차. AnnotationEngine과는 무관한 순수
// 콘텐츠 데이터라 여기 과목 폴더에 둔다.
//
// bookId는 보통 PDF 파일명(확장자 제외)이지만, kind:'image' 항목(교재 낱장 캡처
// 원본+정답오버레이 — PDF가 아니라 R2에 올라간 JPG/PNG 시퀀스)은 bookId를 직접
// 명시한다. kind는 viewer.js의 openMaterial()이 PDF.js로 열지 이미지북 메타데이터
// (GET /api/image-books/:bookId)로 열지 내부적으로 판단하는 데만 쓰이고, 카드
// 렌더링/클릭/자료실 구조 자체는 PDF 자료와 완전히 동일하다(별도 UI 분기 없음).
// 설계: DESIGN-image-capture-viewer.md
const MATERIALS = [
  { file: 'kumon-japanese-C-171-180.pdf', subject: '일본어', stage: 'C', range: 'C171~C180', icon: '🇯🇵', category: 'textbook', label: 'C단계 교재 (C171~C180)' },
  { bookId: 'kumon-japanese-002-3A', kind: 'image', subject: '일본어', stage: '3A', range: '1~200장', icon: '🇯🇵', category: 'textbook', label: '3A단계 교재 원본+정답 (전체 200장)' },
];
function bookIdOf(material) { return material.bookId || material.file.replace(/\.pdf$/i, ''); }
function materialByBookId(bookId) { return MATERIALS.find(m => bookIdOf(m) === bookId) || null; }

// 교재별 페이지 지도 — "PDF 페이지 번호(pdf) → 표시 라벨" 매핑. kind:'image' 교재도
// 똑같이 이 pdf 필드를 키로 쓴다 — 이미지북의 PageOrder 엔트리(viewer.js
// buildImageOrder())가 1..totalPages 순번을 pdfPage 필드에 그대로 담아 생성되므로,
// pdfPageLabel()/findPosByPdfPage()/검색/북마크 목록 등 PDF용으로 이미 있던 코드를
// 그대로 재사용할 수 있다(이미지인지 PDF인지는 PageOrder 엔트리의 kind로만 구분).
const PAGE_MAPS = {};

// kumon-japanese-002-3A(일어 3A, 200장=400면, 1a,1b,2a,2b...200a,200b) — 캡처
// 업로드 스크립트가 보고한 totalPages(200)·sides(a,b) 그대로 기계적으로 생성한다.
// 손으로 400줄을 쓰는 대신 매 페이지 "{장번호}{a|b}"로 라벨을 계산한다.
(function buildJ002Page3AMap() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-10-10) 기준 — 바뀌면 여기만 고칠 것
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
  PAGE_MAPS['kumon-japanese-002-3A'] = entries;
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
