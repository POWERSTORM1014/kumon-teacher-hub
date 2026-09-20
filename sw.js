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

// 앱 셸(index.html/JS 등) 코드를 바꿀 때마다 이 번호를 올릴 것 — activate에서
// SHELL_CACHE/CONTENT_CACHE가 아닌 캐시를 전부 지우므로, 번호를 올리면 옛 SHELL_CACHE가
// 자동으로 삭제되고 새 코드가 다시 캐싱된다. 번호를 안 올리면 배포해도 사용자 브라우저에
// 옛 코드가 계속 남을 수 있다.
const SW_VERSION = 'v15';
const SHELL_CACHE = 'kth-shell-' + SW_VERSION;
// CONTENT_CACHE는 SW_VERSION과 별개로 관리한다 — 교재 PDF/오프라인 저장본이 들어있어서,
// 앱 셸 코드만 바뀐 배포마다 같이 버전을 올리면 사용자가 이미 받아둔 대용량 PDF까지
// 매번 다시 받아야 한다. 각 뷰어의 CACHE_NAME 상수와 반드시 동일한 문자열을 유지할 것.
const CONTENT_CACHE = 'kth-content-v1';

// sw.js 자신은 항상 저장소 루트에 있으므로(로컬이든 GitHub Pages 하위 경로든), 여기서
// './'로 시작하는 상대경로는 이 스크립트 자신의 위치(=사이트 루트) 기준으로 풀리며
// 배포 환경에 무관하게 항상 올바르다. 맨 앞에 '/'를 쓰면 하위 경로 배포에서
// 도메인 최상위로 잘못 풀려 404가 난다.
const SHELL_URLS = [
  './index.html',
  './subjects.json',
  './archives.json',
  './manifest.json',
  './shared/annotation-engine.js',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=DM+Mono:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js',
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
  if (!sameOrigin) return handleCrossOrigin(req);
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

// 외부 오리진(R2 사진/삽입 이미지, 구글 폰트, CDN 스크립트 등) 처리 — 항상 CORS
// 모드로 직접 fetch해서, 캐시에는 "불투명(opaque)하지 않은" 완전한 응답만 남긴다.
//
// 예전에는 가로챈 요청(req)을 그대로 fetch()에 넘겼는데, 페이지의 <img src="...">가
// crossorigin 속성 없이 사진을 표시할 때는 그 요청 자체가 원래 no-cors 모드라
// 응답이 무조건 "불투명"으로 캐시됐다. 나중에 PDF 내보내기가 같은 URL을
// crossOrigin='anonymous'(cors 모드)로 다시 요청하면, 캐시에 있던 그 불투명
// 응답을 그대로 돌려주게 되는데 — 브라우저는 "cors 요청에 no-cors(불투명) 응답을
// 쓸 수 없다"며 net::ERR_FAILED로 거부한다(콘솔의 "opaque response was used for
// a request whose type is not no-cors" 메시지가 바로 이 상황).
//
// FetchEvent.respondWith()는 원래 요청이 어떤 모드였든 상관없이 어떤 Response를
// 돌려줘도 되므로, 실제 네트워크 요청은 항상 { mode: 'cors' }로 직접 만들어서
// 보내고, 그 완전한 응답을 캐시에 넣어둔 뒤 그대로 돌려준다 — 화면 표시(<img>,
// crossorigin 없음)든 PDF 내보내기(crossOrigin='anonymous')든 이후로는 항상 같은
// "완전한" 캐시 응답을 받는다. R2(pub-....r2.dev)는 이미 실제로
// Access-Control-Allow-Origin: * 를 내려주는 것을 curl로 확인했고, 구글 폰트·
// cdnjs도 원래 크로스오리진 임베드를 전제로 CORS를 지원하는 서비스라 안전하다.
async function handleCrossOrigin(req) {
  const cached = await caches.match(req, { ignoreVary: true });
  if (cached && cached.type !== 'opaque') return cached; // 예전에 남은 불투명 캐시는 재사용하지 않고 새로 받는다
  try {
    const res = await fetch(new Request(req.url, { mode: 'cors' }));
    if (res && res.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(req, res.clone()); // 캐시 키는 원래 요청(req) 그대로 — 요청 모드와 무관하게 URL로 찾아진다
      return res;
    }
    throw new Error('cors fetch not ok: ' + (res && res.status));
  } catch (e) {
    // CORS 헤더를 안 보내는 예외적인 리소스(다른 경로/리다이렉트 등)에 한해서만
    // 원래 요청 그대로 폴백한다 — 화면 표시는 계속되게 하되, 이 경우 응답은
    // 여전히 불투명이라 PDF 내보내기용으로는 못 쓴다(예외 상황이라 감수).
    if (cached) return cached;
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) { const cache = await caches.open(SHELL_CACHE); cache.put(req, res.clone()); }
    return res;
  }
}

// 콘텐츠(교재 PDF + 과목/자료실/워크스페이스별 데이터/화면)는 CONTENT_CACHE로, 그 외
// 공통 앱 셸은 SHELL_CACHE로 분류한다 — precacheAll()이 명시적으로 채우는 캐시와
// 이름을 맞춰야 isMaterialCached()류 조회가 어느 쪽에 들어있든 일관되게 찾아낸다.
// workspace/도 같은 이유로 포함한다 — workspace/viewer.html·js·folder.html은
// subjects/archives의 viewer.html·js와 같은 성격(같은 origin의 뷰어 화면)이라 같은
// 분류를 받아야 한다. (R2에 올라간 사진 페이지 원본은 다른 origin이라 이 판정 이전에
// handleFetch()의 sameOrigin 분기에서 이미 SHELL_CACHE로 처리되며, 이 함수와는 무관하다.
// workspace:folders/books 같은 동적 API 응답 자체는 애초에 여기서 캐싱 대상이 아니다.)
function isContentUrl(url) {
  // GitHub Pages 하위 경로 배포에서는 pathname이 '/kumon-teacher-hub/subjects/...'
  // 처럼 접두사가 붙으므로, startsWith 대신 includes로 배포 경로 깊이에 무관하게 판정한다.
  const pathname = new URL(url).pathname;
  return pathname.includes('/pdf/') || pathname.includes('/subjects/') || pathname.includes('/archives/') || pathname.includes('/workspace/');
}
