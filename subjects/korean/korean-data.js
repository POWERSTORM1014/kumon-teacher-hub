// subjects/korean/korean-data.js
// 국어 전용 큐레이션 데이터 — 교재 목록/목차. bookId는 항상 PDF 파일명(확장자 제외).
// AnnotationEngine과는 무관한 순수 콘텐츠 데이터라 여기 과목 폴더에 둔다.
// (PAGE_MAPS는 아직 단원별 목차/요점정리를 정리해두지 않아 비워둔다 — viewer.js는
// PAGE_MAPS[bookId]가 없으면 "N페이지" 같은 기본 라벨로 자동 대체하므로 정상 동작한다.)

// pdf/kumon-korean-*.pdf를 인식해서 자료실 목록에 그대로 노출한다.
const MATERIALS = [
  { file: 'kumon-korean-E1-101-110.pdf', subject: '국어', stage: 'E1', range: 'E1-101~110', icon: '📖', category: 'textbook', label: 'E1단계 교재 (101~110)', archived: true }, // 초기 샘플(구방식) — 자료실 화면에서 숨김(2026-10-11)
  { file: 'kumon-korean-G1-041-050.pdf', subject: '국어', stage: 'G1', range: 'G1-041~050', icon: '📚', category: 'textbook', label: 'G1단계 교재 (041~050)', archived: true }, // 초기 샘플(구방식) — 자료실 화면에서 숨김(2026-10-11)
  { bookId: 'kumon-korean-001-8A', kind: 'image', subject: '국어', stage: '8A', range: '1~200장', icon: '📖', category: 'textbook', label: '8A단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-002-7A', kind: 'image', subject: '국어', stage: '7A', range: '1~200장', icon: '📖', category: 'textbook', label: '7A단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-003-6A', kind: 'image', subject: '국어', stage: '6A', range: '1~200장', icon: '📖', category: 'textbook', label: '6A단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-004-5A', kind: 'image', subject: '국어', stage: '5A', range: '1~200장', icon: '📖', category: 'textbook', label: '5A단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-005-4A', kind: 'image', subject: '국어', stage: '4A', range: '1~200장', icon: '📖', category: 'textbook', label: '4A단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-006-3A', kind: 'image', subject: '국어', stage: '3A', range: '1~200장', icon: '📖', category: 'textbook', label: '3A단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-007-2A', kind: 'image', subject: '국어', stage: '2A', range: '1~200장', icon: '📖', category: 'textbook', label: '2A단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-008-A1', kind: 'image', subject: '국어', stage: 'A1', range: '1~200장', icon: '📖', category: 'textbook', label: 'A1단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-009-A2', kind: 'image', subject: '국어', stage: 'A2', range: '1~200장', icon: '📖', category: 'textbook', label: 'A2단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-010-B1', kind: 'image', subject: '국어', stage: 'B1', range: '1~200장', icon: '📖', category: 'textbook', label: 'B1단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-011-B2', kind: 'image', subject: '국어', stage: 'B2', range: '1~200장', icon: '📖', category: 'textbook', label: 'B2단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-012-C1', kind: 'image', subject: '국어', stage: 'C1', range: '1~200장', icon: '📖', category: 'textbook', label: 'C1단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-013-C2', kind: 'image', subject: '국어', stage: 'C2', range: '1~200장', icon: '📖', category: 'textbook', label: 'C2단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-014-D1', kind: 'image', subject: '국어', stage: 'D1', range: '1~200장', icon: '📖', category: 'textbook', label: 'D1단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-015-D2', kind: 'image', subject: '국어', stage: 'D2', range: '1~200장', icon: '📖', category: 'textbook', label: 'D2단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-016-E1', kind: 'image', subject: '국어', stage: 'E1', range: '1~200장', icon: '📖', category: 'textbook', label: 'E1단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-017-E2', kind: 'image', subject: '국어', stage: 'E2', range: '1~200장', icon: '📖', category: 'textbook', label: 'E2단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-018-F1', kind: 'image', subject: '국어', stage: 'F1', range: '1~200장', icon: '📖', category: 'textbook', label: 'F1단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-019-F2', kind: 'image', subject: '국어', stage: 'F2', range: '1~200장', icon: '📖', category: 'textbook', label: 'F2단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-020-G1', kind: 'image', subject: '국어', stage: 'G1', range: '1~200장', icon: '📖', category: 'textbook', label: 'G1단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-021-G2', kind: 'image', subject: '국어', stage: 'G2', range: '1~200장', icon: '📖', category: 'textbook', label: 'G2단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-022-H1', kind: 'image', subject: '국어', stage: 'H1', range: '1~200장', icon: '📖', category: 'textbook', label: 'H1단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-023-H2', kind: 'image', subject: '국어', stage: 'H2', range: '1~200장', icon: '📖', category: 'textbook', label: 'H2단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-024-I1', kind: 'image', subject: '국어', stage: 'I1', range: '1~200장', icon: '📖', category: 'textbook', label: 'I1단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-025-I2', kind: 'image', subject: '국어', stage: 'I2', range: '1~200장', icon: '📖', category: 'textbook', label: 'I2단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-026-J', kind: 'image', subject: '국어', stage: 'J', range: '1~200장', icon: '📖', category: 'textbook', label: 'J단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-027-K', kind: 'image', subject: '국어', stage: 'K', range: '1~200장', icon: '📖', category: 'textbook', label: 'K단계 교재 원본+정답 (전체 200장)' },
  { bookId: 'kumon-korean-028-L', kind: 'image', subject: '국어', stage: 'L', range: '1~200장', icon: '📖', category: 'textbook', label: 'L단계 교재 원본+정답 (전체 200장)' },
];
function bookIdOf(material) { return material.bookId || material.file.replace(/\.pdf$/i, ''); }
function materialByBookId(bookId) { return MATERIALS.find(m => bookIdOf(m) === bookId) || null; }

// 교재별 페이지 지도(PDF 실제 페이지 번호 → 표시 라벨) — 아직 정리된 게 없음.
const PAGE_MAPS = {};

// kumon-korean-001-8A(국어 8A, 200장=400면, 1a,1b,2a,2b...200a,200b) — 과학/일어와 같은 방식.
(function buildK001Page8AMap() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-11-10) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: '8A ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-001-8A'] = entries;
})();

// kumon-korean-002-7A(국어 7A, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK002Page7AMap() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-11-10) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: '7A ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-002-7A'] = entries;
})();

// kumon-korean-003-6A(국어 6A, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK003Page6AMap() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-11-10) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: '6A ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-003-6A'] = entries;
})();

// kumon-korean-004-5A(국어 5A, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK004Page5AMap() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-11-10) 기준 — 바뀌면 여기만 고칠 것
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
  PAGE_MAPS['kumon-korean-004-5A'] = entries;
})();

// kumon-korean-005-4A(국어 4A, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK005Page4AMap() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-11-10) 기준 — 바뀌면 여기만 고칠 것
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
  PAGE_MAPS['kumon-korean-005-4A'] = entries;
})();

// kumon-korean-006-3A(국어 3A, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK006Page3AMap() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-11-11) 기준 — 바뀌면 여기만 고칠 것
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
  PAGE_MAPS['kumon-korean-006-3A'] = entries;
})();

// kumon-korean-007-2A(국어 2A, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK007Page2AMap() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-11-11) 기준 — 바뀌면 여기만 고칠 것
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
  PAGE_MAPS['kumon-korean-007-2A'] = entries;
})();

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

// kumon-korean-016-E1(국어 E1, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK016PageE1Map() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-10-22) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'E1 ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-016-E1'] = entries;
})();

// kumon-korean-017-E2(국어 E2, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK017PageE2Map() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-10-22) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'E2 ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-017-E2'] = entries;
})();

// kumon-korean-018-F1(국어 F1, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK018PageF1Map() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-10-22) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'F1 ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-018-F1'] = entries;
})();

// kumon-korean-019-F2(국어 F2, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK019PageF2Map() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-10-22) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'F2 ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-019-F2'] = entries;
})();

// kumon-korean-020-G1(국어 G1, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK020PageG1Map() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-10-22) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'G1 ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-020-G1'] = entries;
})();

// kumon-korean-021-G2(국어 G2, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK021PageG2Map() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-10-23) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'G2 ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-021-G2'] = entries;
})();

// kumon-korean-022-H1(국어 H1, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK022PageH1Map() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-11-08) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'H1 ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-022-H1'] = entries;
})();

// kumon-korean-023-H2(국어 H2, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK023PageH2Map() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-11-08) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'H2 ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-023-H2'] = entries;
})();

// kumon-korean-024-I1(국어 I1, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK024PageI1Map() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-11-08) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'I1 ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-024-I1'] = entries;
})();

// kumon-korean-025-I2(국어 I2, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK025PageI2Map() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-11-09) 기준 — 바뀌면 여기만 고칠 것
  const SIDES = ['a', 'b'];
  const entries = [];
  let pdfPage = 0;
  for (let sheet = 1; sheet <= TOTAL_SHEETS; sheet++) {
    for (const side of SIDES) {
      pdfPage++;
      const label = sheet + side;
      entries.push({ pdf: pdfPage, label, sub: 'I2 ' + label, type: 'content' });
    }
  }
  PAGE_MAPS['kumon-korean-025-I2'] = entries;
})();

// kumon-korean-026-J(국어 J, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK026PageJMap() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-11-09) 기준 — 바뀌면 여기만 고칠 것
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
  PAGE_MAPS['kumon-korean-026-J'] = entries;
})();

// kumon-korean-027-K(국어 K, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK027PageKMap() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-11-09) 기준 — 바뀌면 여기만 고칠 것
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
  PAGE_MAPS['kumon-korean-027-K'] = entries;
})();

// kumon-korean-028-L(국어 L, 200장=400면, 1a,1b,2a,2b...200a,200b) — 위와 동일한 방식.
(function buildK028PageLMap() {
  const TOTAL_SHEETS = 200; // 업로드 스크립트 콘솔 출력(2026-11-09) 기준 — 바뀌면 여기만 고칠 것
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
  PAGE_MAPS['kumon-korean-028-L'] = entries;
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
