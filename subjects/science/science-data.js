// subjects/science/science-data.js
// 과학 전용 큐레이션 데이터 — 교재 목록/목차/요점정리. bookId는 항상 PDF 파일명(확장자 제외).
// AnnotationEngine과는 무관한 순수 콘텐츠 데이터라 여기 과목 폴더에 둔다.

// pdf/kumon-science-*.pdf 4개를 인식해서 자료실 목록에 그대로 노출한다.
const MATERIALS = [
  { file: 'kumon-science-D-081-090.pdf', subject: '과학', stage: 'D', range: 'D81~D90', icon: '🌋', category: 'textbook', label: 'D단계 교재 (D81~D90)' },
  { file: 'kumon-science-G-001-010.pdf', subject: '과학', stage: 'G', range: 'G1~G10', icon: '🔬', category: 'textbook', label: 'G단계 교재 (G1~G10)' },
  { file: 'kumon-science-G-041-050.pdf', subject: '과학', stage: 'G', range: 'G41~G50', icon: '🌱', category: 'textbook', label: 'G단계 교재 (G41~G50)', unit: '지권의 변화 5 · 풍화' },
  { file: 'kumon-science-H-101-110.pdf', subject: '과학', stage: 'H', range: 'H101~H110', icon: '⚛️', category: 'textbook', label: 'H단계 교재 (H101~H110)' },
];
function bookIdOf(material) { return material.file.replace(/\.pdf$/i, ''); }
function materialByBookId(bookId) { return MATERIALS.find(m => bookIdOf(m) === bookId) || null; }

// 교재별 페이지 지도(PDF 실제 페이지 번호 → 표시 라벨). bookId 키로 직접 저장한다 —
// 예전처럼 'g1'/'g2' 같은 축약 id를 별도로 짓지 않는다.
const PAGE_MAPS = {
  'kumon-science-G-001-010': [
    { pdf: 1, label: '표지', sub: '구몬과학 G단계', type: 'front' },
    { pdf: 2, label: 'G교재 내용 일람표', sub: '단원별 목록', type: 'front' },
    { pdf: 3, label: 'G단계 세트별 교재 내용', sub: '학습 내용 일람', type: 'front' },
    { pdf: 4, label: 'G단계 참고사항', sub: '개념 요약 정리', type: 'front' },
    { pdf: 5, label: 'G 1a', sub: '지권의 변화 1 · 지구계 및 지권의 특징 (앞)', type: 'content', edu: 1 },
    { pdf: 6, label: 'G 1b', sub: '지권의 변화 1 · 생태계·소화계·순환계 (뒤)', type: 'content', edu: 1 },
    { pdf: 7, label: 'G 2a', sub: '지권의 변화 1 · 지구계 구성 요소 (앞)', type: 'content', edu: 2 },
    { pdf: 8, label: 'G 2b', sub: '지권의 변화 1 · 기권·수권의 역할 (뒤)', type: 'content', edu: 2 },
    { pdf: 9, label: 'G 3a', sub: '지권의 변화 1 · 지권·생물권·외권 (앞)', type: 'content', edu: 3 },
    { pdf: 10, label: 'G 3b', sub: '지권의 변화 1 · 지구계 상호 영향 (뒤)', type: 'content', edu: 3 },
    { pdf: 11, label: 'G 4a', sub: '지권의 변화 1 · 태양에너지와 지구계 (앞)', type: 'content', edu: 4 },
    { pdf: 12, label: 'G 4b', sub: '지권의 변화 1 · 물의 순환 (뒤)', type: 'content', edu: 4 },
    { pdf: 13, label: 'G 5a', sub: '지권의 변화 1 · 지구 내부 직접 조사법 (앞)', type: 'content', edu: 5 },
    { pdf: 14, label: 'G 5b', sub: '지권의 변화 1 · 지진파 조사·운석 연구 (뒤)', type: 'content', edu: 5 },
    { pdf: 15, label: 'G 6a', sub: '지권의 변화 1 · 지진과 지진파 (앞)', type: 'content', edu: 6 },
    { pdf: 16, label: 'G 6b', sub: '지권의 변화 1 · 지진파 조사 방법 (뒤)', type: 'content', edu: 6 },
    { pdf: 17, label: 'G 7a', sub: '지권의 변화 1 · 지구 내부 층 구조 (앞)', type: 'content', edu: 7 },
    { pdf: 18, label: 'G 7b', sub: '지권의 변화 1 · P파·S파 속도 변화 (뒤)', type: 'content', edu: 7 },
    { pdf: 19, label: 'G 8a', sub: '지권의 변화 1 · 모호면과 지구 내부 (앞)', type: 'content', edu: 8 },
    { pdf: 20, label: 'G 8b', sub: '지권의 변화 1 · 지각의 구조 (뒤)', type: 'content', edu: 8 },
    { pdf: 21, label: 'G 9a', sub: '지권의 변화 1 · 대륙지각·해양지각 (앞)', type: 'content', edu: 9 },
    { pdf: 22, label: 'G 9b', sub: '지권의 변화 1 · 맨틀·외핵·내핵 (뒤)', type: 'content', edu: 9 },
    { pdf: 23, label: 'G 10a', sub: '지권의 변화 1 · 종합 정리 (앞)', type: 'content', edu: 10 },
    { pdf: 24, label: 'G 10b', sub: '지권의 변화 1 · 지구 내부 조사 종합 (뒤)', type: 'content', edu: 10 },
  ],
  'kumon-science-G-041-050': [
    { pdf: 1, label: 'G 41a', sub: '지권의 변화 5 · 풍화 — 암석의 기계적 부서짐', type: 'content', edu: 41 },
    { pdf: 2, label: 'G 41b', sub: '지권의 변화 5 · 풍화 — 물에 의한 암석 풍화', type: 'content', edu: 41 },
    { pdf: 3, label: 'G 42a', sub: '지권의 변화 5 · 풍화 — 풍화의 정의와 원인', type: 'content', edu: 42 },
    { pdf: 4, label: 'G 42b', sub: '지권의 변화 5 · 풍화 — 동결-융해 풍화', type: 'content', edu: 42 },
    { pdf: 5, label: 'G 43a', sub: '지권의 변화 5 · 풍화 — 압력·식물 뿌리 풍화', type: 'content', edu: 43 },
    { pdf: 6, label: 'G 43b', sub: '지권의 변화 5 · 풍화 — 화학적 풍화(용해·산화)', type: 'content', edu: 43 },
    { pdf: 7, label: 'G 44a', sub: '지권의 변화 5 · 풍화 — 조각 vs 가루 풍화속도', type: 'content', edu: 44 },
    { pdf: 8, label: 'G 44b', sub: '지권의 변화 5 · 풍화 — 산성 물질과 풍화속도', type: 'content', edu: 44 },
    { pdf: 9, label: 'G 45a', sub: '지권의 변화 5 · 풍화 — 풍화가 잘 일어나는 조건', type: 'content', edu: 45 },
    { pdf: 10, label: 'G 45b', sub: '지권의 변화 5 · 풍화 — 표면적과 풍화속도', type: 'content', edu: 45 },
    { pdf: 11, label: 'G 46a', sub: '지권의 변화 5 · 풍화 — 흙이 만들어지는 과정', type: 'content', edu: 46 },
    { pdf: 12, label: 'G 46b', sub: '지권의 변화 5 · 풍화 — 토양의 정의와 특징', type: 'content', edu: 46 },
    { pdf: 13, label: 'G 47a', sub: '지권의 변화 5 · 풍화 — 토양의 생성 과정', type: 'content', edu: 47 },
    { pdf: 14, label: 'G 47b', sub: '지권의 변화 5 · 풍화 — 토양의 단면 구조', type: 'content', edu: 47 },
    { pdf: 15, label: 'G 48a', sub: '지권의 변화 5 · 풍화 — 토양 생성 순서와 단면', type: 'content', edu: 48 },
    { pdf: 16, label: 'G 48b', sub: '지권의 변화 5 · 풍화 — 토양의 중요성과 보전', type: 'content', edu: 48 },
    { pdf: 17, label: 'G 49a', sub: '지권의 변화 5 · 풍화 — 토양 유실과 예방', type: 'content', edu: 49 },
    { pdf: 18, label: 'G 49b', sub: '지권의 변화 5 · 풍화 — 토양 오염과 예방', type: 'content', edu: 49 },
    { pdf: 19, label: 'G 50a', sub: '지권의 변화 5 · 풍화 — 풍화 종합 정리 ①', type: 'content', edu: 50 },
    { pdf: 20, label: 'G 50b', sub: '지권의 변화 5 · 풍화 — 풍화 종합 정리 ②', type: 'content', edu: 50 },
  ],
};

const SUMMARY = {
  'kumon-science-G-041-050': {
    1: { label: 'G 41a', theme: '암석의 기계적 부서짐', points: ['암석이 서로 부딪히면 물리적으로 부서진다', '부서지는 순서: 암석 → 돌·모래 → 흙', '얼음 설탕 실험 = 암석 충돌 부서짐의 모형'], answer: '암석이 부서지면 【돌】과 【모래】가 되고, 이것이 더 잘게 부서지면 【흙】이 된다.' },
    2: { label: 'G 41b', theme: '물에 의한 암석의 풍화', points: ['암석·돌은 흐르는 물·빗물에 녹아 작아지거나 부서진다', '비석이 오래되면 형태가 흐릿해짐 → 빗물에 의한 풍화'], answer: '얼음 설탕이 물에 녹아 크기가 작아진다 ✓' },
    3: { label: 'G 42a', theme: '풍화의 정의와 3대 원인 ★', points: ['풍화 = 암석이 오랜 시간 잘게 부서지고 성분이 변하는 현상', '3대 원인: ① 물  ② 식물 뿌리  ③ 공기'], answer: '(1) 풍화  (2) 물, 식물 뿌리, 공기' },
    4: { label: 'G 42b', theme: '물(동결-융해)에 의한 풍화', points: ['암석 틈 → 물 스며듦 → 얼면 부피 증가 → 틈 넓어짐 → 반복 → 부서짐'], answer: '부피가 【증가하여】, 틈이 【넓어진다】' },
    5: { label: 'G 43a', theme: '압력·식물 뿌리에 의한 풍화', points: ['박리 작용: 땅속 암석 노출 → 압력 감소 → 겉 부분 얇게 떨어짐', '뿌리 작용: 식물 뿌리가 틈을 벌려 암석 부서짐'], answer: '(1) 압력이 【감소】한다  (2) 【뿌리】가 자라면' },
    6: { label: 'G 43b', theme: '화학적 풍화 (용해·산화)', points: ['용해 작용: CO₂ 녹은 지하수 + 석회암 → 석회 동굴 형성', '산화 작용: 암석 + 산소 → 표면 붉게 변함, 약해짐'], answer: '세 번째 항목에만 O표' },
    7: { label: 'G 44a', theme: '조각 vs 가루 — 풍화속도', points: ['비커 A(조각): 60g→58g (2g 감소)', '비커 B(가루): 60g→56.5g (3.5g 감소)', '가루일수록 표면적 증가 → 풍화 더 빠름'], answer: '(1) 비커 【B】  (2) 잘게 부서졌을 때 풍화가 잘 일어난다' },
    8: { label: 'G 44b', theme: '산성 물질과 풍화속도', points: ['비커 A(증류수): 60g→60g (변화 없음)', '비커 B(묽은 염산): 60g→58g (2g 감소)'], answer: '(1) 비커 【B】  (2) 더 【크다】, 더 【빨리】 일어남' },
    9: { label: 'G 45a', theme: '풍화가 잘 일어나는 3조건 ★', points: ['✅ 산성 물질과 반응할 때', '✅ 기온이 낮은 지역에서 물이 얼 때', '❌ 암석이 큰 덩어리일 때 (오답!)'], answer: '산성 물질과 반응할 때, 기온이 낮은 지역에서 물이 얼 때 O표' },
    10: { label: 'G 45b', theme: '표면적과 풍화속도', points: ['2cm 정육면체 1개 표면적: 4×6 = 24cm²', '1cm 정육면체 8개 표면적: 1×6×8 = 48cm² (2배!)'], answer: '표면적이 【증가한다】, 풍화가 【더 빨라진다】' },
    11: { label: 'G 46a', theme: '흙이 만들어지는 과정', points: ['순서: 암석 → 돌과 모래 → 흙', '암석과 흙은 성분이 다름'], answer: '암석 → 돌과 모래 → 흙  /  【다른】 성분' },
    12: { label: 'G 46b', theme: '토양의 정의와 특징', points: ['토양 = 암석 부스러기 + 동식물 썩은 물질 → 영양분 제공', '성숙한 토양 형성: 수백 년 이상 걸림'], answer: '【풍화 작용】을 받으면, 이를 【토양】이라고 한다' },
    13: { label: 'G 47a', theme: '토양의 생성 과정 순서 ★', points: ['① 암석이 풍화되어 작은 돌·모래로 부서진다', '② 더 잘게 부서져 식물이 자랄 수 있는 토양층이 만들어진다', '③ 물에 녹은 물질과 진흙이 아래쪽으로 이동하여 쌓인다'], answer: '암석→돌·모래로 부서짐【1】, 토양층 형성【2】, 진흙 이동·쌓임【3】' },
    14: { label: 'G 47b', theme: '토양 단면 4층 구조 ★', points: ['A층=표토, B층=심토, C층=모질물, D층=기반암'], answer: '① A(표토)  ② C(모질물)  ③ B(심토)' },
    15: { label: 'G 48a', theme: '토양 생성 순서와 단면 ★', points: ['생성 순서: 기반암 → 모질물 → 표토 → 심토'], answer: 'D→C→A→B (기반암→모질물→표토→심토)' },
    16: { label: 'G 48b', theme: '토양의 중요성과 보전', points: ['토양의 역할: 영양분 공급, 삶의 터전, 가뭄 방지, 물 정화'], answer: '【수백】년 이상의 【오랜】시간이 걸리기 때문' },
    17: { label: 'G 49a', theme: '토양 유실과 예방', points: ['원인: 자연적(풍화) + 인위적(산림 벌채, 도로 건설)'], answer: '경사진 논을 계단식으로, 무분별하게 나무를 베지 않는다 O표' },
    18: { label: 'G 49b', theme: '토양 오염과 예방', points: ['오염 원인: 공장 폐기물·폐수, 비닐, 농약(잘 분해 안 됨)'], answer: '비닐 함부로 버리지 않는다, 공장에 오염 방지 시설을 설치한다 O표' },
    19: { label: 'G 50a', theme: '풍화 종합 정리 ①', points: ['풍화 원인: 물, 식물 뿌리, 공기'], answer: '1번: 물·식물 뿌리·공기·풍화  /  2번: ㄱ,ㄴ,ㄹ  /  3번: ①④ O표' },
    20: { label: 'G 50b', theme: '풍화 종합 정리 ②', points: ['토양 생성 순서: 가→다→나', '층 생성 순서: D→C→A→B'], answer: '4번: 가-다-나  /  5번 생성순서: D→C→A→B  /  옳은것: ㄱ,ㄷ,ㄹ' },
  },
};
function getSummaryData(bookId, pdfPage) { return (SUMMARY[bookId] && SUMMARY[bookId][pdfPage]) || null; }

// PAGE_MAPS에서 검색 인덱스를 자동 생성 — 별도로 유지보수할 목차 데이터를 중복으로 두지 않는다.
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
