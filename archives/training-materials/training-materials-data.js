// archives/training-materials/training-materials-data.js
// 교사 연수 자료 전용 큐레이션 데이터 — 자료 목록/목차. bookId는 항상 PDF 파일명(확장자 제외).
// AnnotationEngine과는 무관한 순수 콘텐츠 데이터라 여기 카테고리 폴더에 둔다.
// subjects/*-data.js와 완전히 같은 구조를 그대로 재사용한다. 자료실 전용 확장 하나:
// 각 항목에 tags(문자열 배열) 필드를 예약해둔다 — 지금은 UI에서 태그로 검색/필터하지
// 않지만, 나중에 태그 검색 UI를 붙일 때 데이터 구조를 다시 바꾸지 않아도 되게 하기 위함.
// (subjects 쪽 교재 데이터에는 이 필드를 두지 않는다 — 자료실에만 해당하는 확장이다.)
//
// 아직 등록된 자료가 없다 — MATERIALS가 비어 있으면 viewer.js가 자동으로
// "해당 자료가 없습니다" 안내를 띄운다. 자료가 생기면 아래 형태로 채워 넣는다:
// {
//   file: 'kumon-training-materials-YYYY-example.pdf',       // pdf/ 폴더의 실제 파일명과 반드시 일치
//   subject: '교사 연수 자료',
//   stage: '지도법',                        // 필터 드롭다운에 노출되는 값(주제)
//   range: '지도법',
//   icon: '🎓',
//   category: 'textbook',                     // 'textbook'(본자료) | 'answer'(부속자료)
//   label: '신임 교사 연수 - 학습지도 기본 원칙',
//   tags: [],                                 // 예약 필드 — 지금은 채우지 않아도 됨
// }
const MATERIALS = [];

// 뷰어 상단/자료관리 화면의 필터 드롭다운에 쓰이는 라벨 — archives.json의 이 카테고리
// filterLabel 필드와 항상 같은 값을 유지할 것.
const FILTER_LABEL = '주제';

function bookIdOf(material) { return material.file.replace(/\.pdf$/i, ''); }
function materialByBookId(bookId) { return MATERIALS.find(m => bookIdOf(m) === bookId) || null; }

// 자료별 페이지 지도(PDF 실제 페이지 번호 → 표시 라벨) — 아직 정리된 게 없음.
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
