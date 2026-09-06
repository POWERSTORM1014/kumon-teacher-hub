# kumon-teacher-hub

## 배포 체크리스트
- index.html, shared/annotation-engine.js, subjects/*/viewer.html·js, archives/*/viewer.html·js,
  workspace/*.html·js 등 앱 셸 코드를 수정해서 배포할 때마다 `sw.js`의 `SW_VERSION`을
  올릴 것(v2 → v3 ...). 안 올리면 기존 사용자 브라우저에 Service Worker가 캐싱해둔 옛
  코드가 계속 서빙될 수 있다. (`CONTENT_CACHE`는 교재 PDF/오프라인 저장본용이라 별도
  버전으로 관리하며, 앱 셸 배포와 무관하게 그대로 둔다.)
- `worker/src/index.js`(Cloudflare Workers API)를 고치면 로컬 `server.js`도 라우트
  모양이 완전히 같은지 같이 확인할 것 — `shared/annotation-engine.js`가 base URL만
  바꿔서 둘 중 어디든 같은 fetch 호출을 그대로 재사용하기 때문이다. Worker 배포는
  `cd worker && npm run deploy`(Cloudflare 인증 필요)로 별도 실행해야 하며, 이 저장소에
  커밋/푸시한다고 자동으로 배포되지 않는다.
- Cloudflare KV/R2에서 삭제 명령을 쓰거나 KV TTL 정책을 확인/변경할 때, 자료실 bookId
  명명 규칙을 확인할 때, 또는 "나의 폴더" 데이터 구조/연쇄 삭제 범위를 확인할 때는
  [OPERATIONS.md](./OPERATIONS.md)를 먼저 볼 것.

## 구조
- `subjects.json` + `subjects/{과목}/` — 교과목 학습 7과목(국어/영어/수학/과학/한자/
  중국어/일본어). 뷰어 패턴: `viewer.html` + `viewer.js` + `{과목}-data.js`.
- `archives.json` + `archives/{카테고리}/` — 자료실 5개 카테고리(연구대회 수상작·교사
  연수 자료·구몬피아 소식지·구몬 교육 원론·현장 수업 사례). subjects와 완전히 분리된
  별도 파일/폴더이며, 같은 뷰어 패턴(`viewer.html` + `viewer.js` + `{카테고리}-data.js`)과
  `shared/annotation-engine.js`를 그대로 재사용한다. 카테고리마다 다른 필터 드롭다운
  라벨(단계/연도/발행호 등)은 `archives.json`의 `filterLabel` 필드로 지정한다.
- `workspace/` — "나의 폴더"(사용자가 실시간으로 만드는 폴더/책). subjects.json/
  archives.json 같은 정적 파일이 아니라 `/api/workspace/*`(KV `workspace:folders`/
  `workspace:books`) 기반 동적 데이터라는 점만 다르고, 책 안의 실제 페이지 구성은
  전부 기존 "페이지 삽입" 기능(빈 페이지/줄노트/모눈 + 이번에 추가한 사진)을 그대로
  쓴다. `workspace/folder.html`(폴더 안 책 목록) → `workspace/viewer.html`(뷰어,
  `?book=<id>`) 순서로 이동한다. 데이터 구조/연쇄 삭제 범위는 [OPERATIONS.md](./OPERATIONS.md) 참고.