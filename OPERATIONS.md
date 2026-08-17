# 운영 안전 수칙

## 삭제 명령 실행 전 확인
`wrangler kv key delete`, `wrangler r2 object delete` 등 삭제성 명령을 실행하기 전에는
반드시 먼저 `wrangler kv key get` 또는 `wrangler r2 object get`으로 대상을 확인한 뒤
삭제할 것.

특히 테스트 데이터 정리 작업 시, 실제 사용자 데이터와 테스트 데이터를 명확히 구분할 것:
- 실제 사용자 데이터: `layer:<bookId>__<page>`, `pageorder:<bookId>`에서 `bookId`가
  실제 교재 PDF 파일명(예: `kumon-science-G-001-010`)인 것.
- 테스트 데이터: `bookId`가 `test-book`처럼 명백히 테스트용인 것, 또는 디버그용으로
  임시로 만든 키(`__debug_...` 등).

## KV 키 TTL 정책
- `layer:`, `pageorder:` (실제 필기 데이터) — **TTL 절대 없음.** 자동 만료되면 안 되는
  데이터이므로 `put()` 호출에 `expirationTtl`/`expiration`을 걸지 말 것.
- `lock:` (편집 잠금, 동시 편집 방지용) — `expirationTtl: 300`(5분) 적용. 애플리케이션
  레벨에서도 5분 지난 잠금은 만료로 취급하지만, KV 자체 TTL도 같이 걸어야 release가
  한 번도 안 온(탭 비정상 종료 등) 죽은 잠금 키가 KV에 영원히 쌓이지 않는다.
- 새로 KV에 쓰는 코드를 추가할 때는 이 표에 맞춰 TTL 여부를 먼저 결정하고 시작할 것.
