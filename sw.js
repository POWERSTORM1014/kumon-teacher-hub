// sw.js — 구몬 학습 허브 오프라인 캐싱용 Service Worker.
// 과목/교재를 특정 짓지 않는다: 여기서는 허브 화면(index.html 등) "앱 셸"만 install
// 시점에 미리 캐싱하고, 과목별 PDF/데이터 같은 "콘텐츠"는 각 뷰어가
// shared/annotation-engine.js의 PWA.precacheAll()로 CONTENT_CACHE에 채워 넣는다
// (진행률을 화면에 보여줘야 하니 뷰어가 직접 하는 편이 SW와 메시지를 주고받는 것보다 단순함).
//
// CONTENT_CACHE 이름(kth-content-v1)은 각 뷰어의 CACHE_NAME 상수와 반드시 일치해야 한다.
//
// fetch 전략: 같은 기기 안의 로컬 서버(server.js)로 가는 요청은 network-first(실제로
// fetch를 시도해보고 정말 실패했을 때만 캐시로 폴백 — navigator.onLine 같은 사전 판단은
// 쓰지 않는다). 외부 CDN(pdf.js, 구글 폰트)만 예외적으로 cache-first를 유지한다.
// 필기 동기화 API(/api/*)는 여기서 절대 가로채지 않는다 — 서버 온라인 판정 로직이
// 실제 네트워크 성공/실패를 그대로 봐야 정확하기 때문.
//
// Range 요청(PDF.js가 큰 PDF를 부분적으로 받을 때 보내는 "bytes=..." 요청)은 캐시를
// 아예 안 쓴다 — Cache API는 기본적으로 URL만으로 매칭하고 요청 헤더(Range)는 키에
// 반영하지 않으므로, 같은 URL에 대해 서로 다른 바이트 구간의 206 응답들이 캐시에서
// 서로를 덮어써 "파일 전체인 척하는 조각난 응답"이 남는 문제가 생길 수 있다. 오프라인
// 전체 저장(precacheAll)은 Range 헤더 없는 요청으로 파일 전체를 받아 캐싱하므로 이
// 예외와 무관하게 계속 정상 동작한다.

const SW_VERSION = 'v1';
const SHELL_CACHE = 'kth-shell-' + SW_VERSION;
const CONTENT_CACHE = 'kth-content-v1'; // 각 뷰어의 CACHE_NAME과 반드시 동일해야 함

// sw.js 자신은 항상 저장소 루트에 있으므로(로컬이든 GitHub Pages 하위 경로든), 여기서
// './'로 시작하는 상대경로는 이 스크립트 자신의 위치(=사이트 루트) 기준으로 풀리며
// 배포 환경에 무관하게 항상 올바르다. 맨 앞에 '/'를 쓰면 하위 경로 배포에서
// 도메인 최상위로 잘못 풀려 404가 난다.
const SHELL_URLS = [
  './index.html',
  './subjects.json',
  './manifest.json',
  './shared/annotation-engine.js',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=DM+Mono:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache =>
      Promise.all(SHELL_URLS.map(url => cache.add(url).catch(e => console.warn('[sw] 앱쉘 캐시 실패', url, e))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== CONTENT_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return; // 필기 저장(POST /api/layers/...)은 손대지 않는다
  const url = new URL(req.url);
  if (url.pathname.includes('/api/')) return; // 동기화 API는 항상 네트워크 직행 — 서버 온/오프라인 판정용
  if (req.headers.has('range')) return; // 부분 요청은 캐시 조회/저장 없이 그대로 네트워크로 흘려보낸다

  if (req.mode === 'navigate') { event.respondWith(handleNavigate(req)); return; }
  event.respondWith(handleFetch(req));
});

async function handleNavigate(req) {
  try {
    const res = await fetch(req, { signal: AbortSignal.timeout(4000) });
    if (res && res.ok) { const cache = await caches.open(SHELL_CACHE); cache.put(req, res.clone()); }
    return res;
  } catch (e) {
    const cached = await caches.match(req, { ignoreVary: true, ignoreSearch: true });
    if (cached) return cached;
    const shellFallback = await caches.match('./index.html', { ignoreSearch: true });
    if (shellFallback) return shellFallback;
    throw e;
  }
}

async function handleFetch(req) {
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  if (!sameOrigin) {
    const cached = await caches.match(req, { ignoreVary: true });
    if (cached) return cached;
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) { const cache = await caches.open(SHELL_CACHE); cache.put(req, res.clone()); }
    return res;
  }
  try {
    const res = await fetch(req, { signal: AbortSignal.timeout(4000) });
    if (res && res.ok) {
      const cacheName = isContentUrl(req.url) ? CONTENT_CACHE : SHELL_CACHE;
      const cache = await caches.open(cacheName);
      cache.put(req, res.clone());
    }
    return res;
  } catch (e) {
    const cached = await caches.match(req, { ignoreVary: true });
    if (cached) return cached;
    throw e;
  }
}

// 콘텐츠(교재 PDF + 과목별 데이터/화면)는 CONTENT_CACHE로, 그 외 공통 앱 셸은
// SHELL_CACHE로 분류한다 — precacheAll()이 명시적으로 채우는 캐시와 이름을 맞춰야
// isMaterialCached()류 조회가 어느 쪽에 들어있든 일관되게 찾아낸다.
function isContentUrl(url) {
  // GitHub Pages 하위 경로 배포에서는 pathname이 '/kumon-teacher-hub/subjects/...'
  // 처럼 접두사가 붙으므로, startsWith 대신 includes로 배포 경로 깊이에 무관하게 판정한다.
  const pathname = new URL(url).pathname;
  return pathname.includes('/pdf/') || pathname.includes('/subjects/');
}
