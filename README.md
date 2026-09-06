# kumon-teacher-hub

## 배포 체크리스트
- index.html, shared/annotation-engine.js, subjects/*/viewer.html·js, archives/*/viewer.html·js
  등 앱 셸 코드를 수정해서 배포할 때마다 `sw.js`의 `SW_VERSION`을 올릴 것(v2 → v3 ...). 안
  올리면 기존 사용자 브라우저에 Service Worker가 캐싱해둔 옛 코드가 계속 서빙될 수 있다.
  (`CONTENT_CACHE`는 교재 PDF/오프라인 저장본용이라 별도 버전으로 관리하며, 앱 셸
  배포와 무관하게 그대로 둔다.)
- Cloudflare KV/R2에서 삭제 명령을 쓰거나 KV TTL 정책을 확인/변경할 때, 또는 자료실
  bookId 명명 규칙을 확인할 때는 [OPERATIONS.md](./OPERATIONS.md)를 먼저 볼 것.

## 구조
- `subjects.json` + `subjects/{과목}/` — 교과목 학습 7과목(국어/영어/수학/과학/한자/
  중국어/일본어). 뷰어 패턴: `viewer.html` + `viewer.js` + `{과목}-data.js`.
- `archives.json` + `archives/{카테고리}/` — 자료실 5개 카테고리(연구대회 수상작·교사
  연수 자료·구몬피아 소식지·구몬 교육 원론·현장 수업 사례). subjects와 완전히 분리된
  별도 파일/폴더이며, 같은 뷰어 패턴(`viewer.html` + `viewer.js` + `{카테고리}-data.js`)과
  `shared/annotation-engine.js`를 그대로 재사용한다. 카테고리마다 다른 필터 드롭다운
  라벨(단계/연도/발행호 등)은 `archives.json`의 `filterLabel` 필드로 지정한다.