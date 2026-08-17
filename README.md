# kumon-teacher-hub

## 배포 체크리스트
- index.html, shared/annotation-engine.js, subjects/*/viewer.html·js 등 앱 셸 코드를
  수정해서 배포할 때마다 `sw.js`의 `SW_VERSION`을 올릴 것(v2 → v3 ...). 안 올리면 기존
  사용자 브라우저에 Service Worker가 캐싱해둔 옛 코드가 계속 서빙될 수 있다.
  (`CONTENT_CACHE`는 교재 PDF/오프라인 저장본용이라 별도 버전으로 관리하며, 앱 셸
  배포와 무관하게 그대로 둔다.)