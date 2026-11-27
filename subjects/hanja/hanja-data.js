// subjects/hanja/hanja-data.js
// 한자 전용 큐레이션 데이터 — 교재 목록/목차. bookId는 항상 PDF 파일명(확장자 제외).
// AnnotationEngine과는 무관한 순수 콘텐츠 데이터라 여기 과목 폴더에 둔다.
// (PAGE_MAPS는 아직 단원별 목차/요점정리를 정리해두지 않아 비워둔다 — viewer.js는
// PAGE_MAPS[bookId]가 없으면 "N페이지" 같은 기본 라벨로 자동 대체하므로 정상 동작한다.)

// pdf/kumon-hanja-*.pdf를 인식해서 자료실 목록에 그대로 노출한다.
// kind:'image' 항목(5A~A단계)은 PDF가 아니라 교재 낱장 캡처 원본+정답오버레이를
// R2에 올린 것 — 구조는 math-data.js/japanese-data.js와 동일(설계: DESIGN-image-capture-viewer.md).
const MATERIALS = [
  { file: 'kumon-hanja-D2-031-040.pdf', subject: '한자', stage: 'D2', range: 'D2-031~040', icon: '字', category: 'textbook', label: 'D2단계 교재 (031~040)', archived: true }, // 초기 샘플(구방식) — 자료실 화면에서 숨김(2026-10-11)
  { bookId: 'kumon-hanja-001-5A', kind: 'image', subject: '한자', stage: '5A', range: '1~200장', icon: '字', category: 'textbook', label: '5A단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-hanja-002-4A', kind: 'image', subject: '한자', stage: '4A', range: '1~200장', icon: '字', category: 'textbook', label: '4A단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-hanja-003-3A', kind: 'image', subject: '한자', stage: '3A', range: '1~200장', icon: '字', category: 'textbook', label: '3A단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-hanja-004-2A', kind: 'image', subject: '한자', stage: '2A', range: '1~200장', icon: '字', category: 'textbook', label: '2A단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-hanja-005-A', kind: 'image', subject: '한자', stage: 'A', range: '1~200장', icon: '字', category: 'textbook', label: 'A단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-hanja-006-B', kind: 'image', subject: '한자', stage: 'B', range: '1~200장', icon: '字', category: 'textbook', label: 'B단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-hanja-007-C', kind: 'image', subject: '한자', stage: 'C', range: '1~200장', icon: '字', category: 'textbook', label: 'C단계 교재 원본+정답 (전체 200장)' },
];
function bookIdOf(material) { return material.bookId || material.file.replace(/\.pdf$/i, ''); }
function materialByBookId(bookId) { return MATERIALS.find(m => bookIdOf(m) === bookId) || null; }

// 교재별 페이지 지도(PDF 실제 페이지 번호 → 표시 라벨). kind:'image' 교재도 똑같이
// pdf 필드를 키로 쓴다(수학/일어 데이터와 동일한 이유 — viewer.js 재사용).
const PAGE_MAPS = {};

// kumon-hanja-001-5A ~ 005-A(5A~A단계, 각 200장=400면) — math-data.js와 동일한 방식.
(function buildH001Page5AMap() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: '5A ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-hanja-001-5A'] = entries;
})();

(function buildH002Page4AMap() {
  const TOTAL_SHEETS = 200;
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: '4A ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-hanja-002-4A'] = entries;
})();

(function buildH003Page3AMap() {
  const TOTAL_SHEETS = 200;
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
  PAGE_MAPS['kumon-hanja-003-3A'] = entries;
})();

(function buildH004Page2AMap() {
  const TOTAL_SHEETS = 200;
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: '2A ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-hanja-004-2A'] = entries;
})();

(function buildH005PageAMap() {
  const TOTAL_SHEETS = 200;
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'A ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-hanja-005-A'] = entries;
})();

(function buildH006PageBMap() {
  const TOTAL_SHEETS = 200;
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'B ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-hanja-006-B'] = entries;
})();

(function buildH007PageCMap() {
  const TOTAL_SHEETS = 200;
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'C ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-hanja-007-C'] = entries;
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
