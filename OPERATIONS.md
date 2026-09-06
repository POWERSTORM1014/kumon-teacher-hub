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

## bookId 명명 규칙 (과목 + 자료실 공통)
`bookId`는 어디서 왔든(교과목 과목별 교재든, 자료실 카테고리든) **항상 PDF 파일명을
확장자만 뗀 값 그대로** 쓴다 — `layer:<bookId>__<page>`, `pageorder:<bookId>`,
`lock:<bookId>` 등 모든 KV 키가 이 값 하나로 묶이기 때문에, 과목 간·카테고리 간
충돌을 피하려면 파일명 자체를 애초에 겹치지 않게 짓는 것이 유일한 방어선이다(파일명 앞에
과목/카테고리를 나타내는 접두어를 넣는 것도 이 때문). 자료실(`archives/`) 5개 카테고리는
아래 규칙을 따른다:

| 카테고리 | bookId(파일명) 패턴 | 예시 |
|---|---|---|
| 연구대회 수상작 (`research-awards`) | `연구대회_{연도}_{부문}_{제목}` | `연구대회_2024_지도법부문_자기주도학습사례.pdf` |
| 교사 연수 자료 (`training-materials`) | `연수자료_{과목}_{연도}_{주제}` | `연수자료_수학_2024_신임교사기초연수.pdf` |
| 구몬피아 소식지 (`newsletter`) | `구몬피아_{연도}_{호수}` | `구몬피아_2024_102호.pdf` |
| 구몬 교육 원론 (`philosophy`) | `교육원론_{편명}` | `교육원론_자기주도학습편.pdf` |
| 현장 수업 사례 (`case-studies`) | `수업사례_{연도}_{단계}_{주제}` | `수업사례_2024_G단계_학습동기부여.pdf` |

`pdf/` 폴더는 과목·카테고리 구분 없이 파일명 하나의 평평한(flat) 네임스페이스이므로,
위 패턴처럼 앞에 구분자를 붙여 과목 쪽 bookId(`kumon-{과목}-{단계}-{범위}` 형식)와도,
자료실 카테고리끼리도 절대 겹치지 않게 할 것. "나의 폴더"(아래 참고)의 `personal_` 접두어도
같은 이유로 겹치지 않는다.

## "나의 폴더"(워크스페이스) 데이터 구조

subjects.json/archives.json과 달리 정적 파일이 아니라 KV(로컬은 `data/workspace/*.json`)
기반 동적 데이터다. 두 키에 배열 전체를 저장한다(부분 갱신 없음 — 매번 통째로 읽고
통째로 다시 쓴다):

- `workspace:folders` → `[{ id: "folder_<hex>", name, createdAt }, ...]`
- `workspace:books` → `[{ id: "personal_<hex>", folderId, title, createdAt }, ...]`

`id`는 항상 서버가 자동 생성하고(`folder_`/`personal_` + 랜덤 hex), 이름/제목 변경(rename)은
`id`를 바꾸지 않는다. **책의 실제 페이지 내용(필기·페이지 순서)은 이 배열에 전혀 들어있지
않다** — `book.id`가 곧 기존 bookId이고, `layer:<bookId>__<page>`/`pageorder:<bookId>`를
그대로 따른다. 즉 "나의 폴더" 책 하나 = 과목/자료실 책 하나와 완전히 같은 방식으로
KV/파일에 흩어져 저장되며, 다른 점은 `workspace:books`에 그 책이 어느 폴더 소속인지와
표시 제목만 별도로 관리한다는 것뿐이다.

### 폴더/책 삭제 시 연쇄 삭제 범위(cascade)

폴더 삭제 = 그 폴더의 모든 책에 대해 아래를 전부 수행 + `workspace:books`/
`workspace:folders`에서 항목 제거. 책 삭제 = 아래만 수행 + `workspace:books`에서
항목 제거. **하나라도 빠지면 "삭제했는데 KV/R2에 흔적이 남는" 문제가 생기므로,
저장 위치를 새로 추가할 때는 반드시 양쪽(worker/src/index.js의
`cascadeDeleteBookData`, server.js의 동명 함수)을 같이 고칠 것:**

1. `pageorder:<bookId>` 키 삭제
2. `layer:<bookId>__*` 전부 삭제 (KV `list({prefix})`로 열거 후 각각 삭제)
3. `lock:<bookId>:*` 전부 삭제 (위와 동일)
4. R2 `kumon-lesson-notes`의 `user-pages/<bookId>/` 전체 삭제 (`list({prefix})` 후 각각 삭제)
5. (로컬 server.js만 해당) `data/page-order/backup/<bookId>_*.json`,
   `data/layers/backup/<bookId>__*` 백업 파일도 함께 정리 — Worker/KV에는 backup 개념이
   없으므로 이 단계는 로컬 전용이다.

### 알려진 한계 — 동시 생성 경합

`workspace:folders`/`workspace:books`는 배열 전체를 읽고 통째로 다시 쓰는 방식이라
CAS(compare-and-swap)나 잠금이 없다. **두 기기에서 거의 동시에 폴더/책을 만들거나
이름을 바꾸면, 나중에 쓴 요청이 먼저 쓴 요청의 변경을 덮어써서 한쪽 변경이 사라질 수
있다.** 이 앱의 실제 사용 규모(교사 한 명이 자기 폴더를 만드는 정도)에서는 발생
빈도가 매우 낮다고 보고 지금은 그대로 허용한다 — 문제가 실제로 재현되면 그때
`If-Match`/버전 필드 같은 낙관적 잠금 도입을 검토할 것.

### 알려진 한계 — KV 쓰기 직후 읽기가 최신이 아닐 수 있음(eventual consistency)

2026-09-06 실제 프로덕션 배포 직후 스모크 테스트에서 실측 확인: 폴더/책을 만들고
곧바로(간격 없이) 목록을 다시 읽으면 방금 만든 항목이 아직 안 보이는 경우가 있었다
(몇 초 뒤 재조회하면 정상 반영됨). Cloudflare Workers KV는 전역적으로 최대 60초까지
전파 지연이 있을 수 있는 저장소라 이는 버그가 아니라 설계상 특성이다. 그래서
`index.html`/`workspace/folder.html`의 생성·이름변경·삭제 UI는 **동작 직후
목록을 서버에서 다시 읽지 않는다** — 서버 응답(생성 시 돌려주는 객체, 또는 이미
로컬에 들고 있는 값)으로 로컬 배열을 직접 고쳐서 다시 그린다. 페이지를 새로
열 때의 최초 조회(`loadFolders`/`loadBooks`)는 여전히 매번 서버에서 새로 읽는다 —
이 문제는 "내가 방금 한 변경을 내가 곧바로 다시 읽는" 경우에만 해당하고, 페이지를
새로고침하거나 다른 기기에서 여는 것까지 막지는 않는다(그 경우는 이미 전파가
끝나 있을 가능성이 높다).

레이어 데이터(필기)는 dataURL을 일단 로컬에 넣고 저장 시점에 서버 경로로 몰래
바꿔치기하는 방식(`migrateDataUrlAssets`)으로 오프라인에서도 그릴 수 있지만, 사진
페이지는 페이지 순서 데이터(`page-order`)에 통째로 들어가는 구조라 같은 방식을 아직
적용하지 않았다. 그 대신 "온라인일 때만 사진 페이지를 추가할 수 있다"는 더 단순한
제약을 택했다(`workspace/viewer.js`의 `confirmPhotoPageInsert`) — 이미 추가된 사진
페이지를 보거나 그 위에 필기하는 것은 오프라인에서도 그대로 된다.
