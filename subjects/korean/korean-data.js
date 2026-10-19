// subjects/korean/korean-data.js
// 국어 전용 큐레이션 데이터 — 교재 목록/목차. bookId는 항상 PDF 파일명(확장자 제외).
// AnnotationEngine과는 무관한 순수 콘텐츠 데이터라 여기 과목 폴더에 둔다.
// (PAGE_MAPS는 아직 단원별 목차/요점정리를 정리해두지 않아 비워둔다 — viewer.js는
// PAGE_MAPS[bookId]가 없으면 "N페이지" 같은 기본 라벨로 자동 대체하므로 정상 동작한다.)

// pdf/kumon-korean-*.pdf를 인식해서 자료실 목록에 그대로 노출한다.
const MATERIALS = [
  { file: 'kumon-korean-E1-101-110.pdf', subject: '국어', stage: 'E1', range: 'E1-101~110', icon: '📖', category: 'textbook', label: 'E1단계 교재 (101~110)', archived: true }, // 초기 샘플(구방식) — 자료실 화면에서 숨김(2026-10-11)
  { file: 'kumon-korean-G1-041-050.pdf', subject: '국어', stage: 'G1', range: 'G1-041~050', icon: '📚', category: 'textbook', label: 'G1단계 교재 (041~050)', archived: true }, // 초기 샘플(구방식) — 자료실 화면에서 숨김(2026-10-11)
  { bookId: 'kumon-korean-008-A1', kind: 'image', subject: '국어', stage: 'A1', range: '1~200장', icon: '📖', category: 'textbook', label: 'A1단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-009-A2', kind: 'image', subject: '국어', stage: 'A2', range: '1~200장', icon: '📖', category: 'textbook', label: 'A2단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-010-B1', kind: 'image', subject: '국어', stage: 'B1', range: '1~200장', icon: '📖', category: 'textbook', label: 'B1단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-011-B2', kind: 'image', subject: '국어', stage: 'B2', range: '1~200장', icon: '📖', category: 'textbook', label: 'B2단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-012-C1', kind: 'image', subject: '국어', stage: 'C1', range: '1~200장', icon: '📖', category: 'textbook', label: 'C1단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-013-C2', kind: 'image', subject: '국어', stage: 'C2', range: '1~200장', icon: '📖', category: 'textbook', label: 'C2단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-014-D1', kind: 'image', subject: '국어', stage: 'D1', range: '1~200장', icon: '📖', category: 'textbook', label: 'D1단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-015-D2', kind: 'image', subject: '국어', stage: 'D2', range: '1~200장', icon: '📖', category: 'textbook', label: 'D2단계 교재 원본+정답 (전체 200장)' },
];
function bookIdOf(material) { return material.bookId || material.file.replace(/\.pdf$/i, ''); }
function materialByBookId(bookId) { return MATERIALS.find(m => bookIdOf(m) === bookId) || null; }

// 교재별 페이지 지도(PDF 실제 페이지 번호 → 표시 라벨) — 아직 정리된 게 없음.
const PAGE_MAPS = {};

// kumon-korean-008-A1(국어 A1, 200장=400면, 1a,1b,2a,2b...200a,200b) — 과학/일어와 같은 방식.
(function buildK008PageA1Map() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-10-18) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'A1 ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-008-A1'] = entries;
})();

// kumon-korean-009-A2(국어 A2, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK009PageA2Map() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-10-18) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'A2 ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-009-A2'] = entries;
})();

// kumon-korean-010-B1(국어 B1, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK010PageB1Map() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-10-18) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'B1 ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-010-B1'] = entries;
})();

// kumon-korean-011-B2(국어 B2, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK011PageB2Map() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-10-18) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'B2 ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-011-B2'] = entries;
})();

// kumon-korean-012-C1(국어 C1, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK012PageC1Map() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-10-18) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'C1 ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-012-C1'] = entries;
})();

// kumon-korean-013-C2(국어 C2, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK013PageC2Map() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-10-19) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'C2 ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-013-C2'] = entries;
})();

// kumon-korean-014-D1(국어 D1, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK014PageD1Map() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-10-19) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'D1 ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-014-D1'] = entries;
})();

// kumon-korean-015-D2(국어 D2, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK015PageD2Map() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-10-20) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'D2 ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-015-D2'] = entries;
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
