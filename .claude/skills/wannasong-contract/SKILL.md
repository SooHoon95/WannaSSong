---
name: wannasong-contract
description: WannaSong 웹 ↔ 백엔드 연동 계약의 단일 진실 소스(packages/contract) — Socket.IO 이벤트·페이로드·ack 형식·권한·레이트리밋, request kind(itunes·video), KV/Redis 키 4종과 스키마·쓰기 타이밍, 에러 코드→한국어 문구, 웹/백엔드 env 동등성, 백엔드 구현 제약(Socket.IO v4 호환·단일 프로세스·CORS). 트리거 — (1) 소켓 이벤트·KV 키·에러 코드·타입을 추가/변경하는 작업, (2) 백엔드 구현 가이드(`packages/contract/README.md`·`docs/backend-onprem-handoff.md`)를 쓰거나 고칠 때, (3) 상대 저장소와 계약 불일치를 디버깅할 때, (4) `test/security.test.mjs` 를 바꿀 때. 계약이 바뀌면 이 스킬의 동시 갱신 규칙을 따른다.
---

# WannaSong Contract (웹 ↔ 백엔드)

**단일 진실 소스는 코드다**: `packages/contract/src/events.ts`(이벤트명·레이트리밋·상한), `packages/contract/src/kv-keys.ts`, `packages/contract/src/err-messages.ts`, `packages/contract/src/types.ts`. 풀어 쓴 가이드는 두 개 — `packages/contract/README.md`(소켓·KV 계약 표)와 `docs/backend-onprem-handoff.md`(온프레미스 단일 백엔드 전체 스펙: REST·소켓·Redis·타이머·인증·프록시). 두 문서가 어긋나면 코드가 이기고, 둘을 코드에 맞춘다. 이 스킬은 **규칙과 변경 절차**를 담고 값을 재기술하지 않는다 — 수치가 필요하면 코드를 연다.

## 계약의 모양

- 클라→서버 이벤트는 `CLIENT_EVENTS`(13종: identify·suggest·ytsearch·request·remove·speaker:claim/tick/ended/error/skip/release·fallback:set·feedback). 이 중 `suggest`·`ytsearch`는 REST로 이전돼 **소켓으로는 구현하지 않는다** — 상수는 호환을 위해 남아 있다.
- `request`의 kind는 **itunes**(artist·title → 서버가 YouTube 1회 검색)와 **video**(videoId·title·author → 재검색 없이 enqueue) 두 종. **url(링크 붙여넣기)은 369a13b에서 제거** — 웹 탭·테스트·스펙 모두 빠졌고, 서버는 수신 시 무시 또는 BAD_URL. 계약 타입에 kind 유니언이 없으니 추가할 때 여기와 스펙 §3.2를 같이 본다.
- 서버→클라 이벤트는 `SERVER_EVENTS`(`state`·`tick`·`me`). `state` 페이로드는 `PublicState`, KV 저장분은 `PersistedState`(nowPlaying 제외 — 재시작 시 null).
- ack는 `AckResponse`: 성공 `{ ok: true, ... }`, 실패 `{ ok: false, error: <한국어> }`, 권한 거부는 `reason`(+`needKey`). 문구는 `errMsg()`가 `ERR_MSG`로 변환하며 `TOO_MANY_PENDING`만 상한 수치를 끼워 넣는다.
- 레이트리밋·상한은 `RATE_LIMITS`·`HISTORY_MAX`·`FEEDBACK_MAX`·`POOL_MAX_PER_CATEGORY`. Java도 같은 수치를 쓴다(README가 표로 옮겨 적음).
- KV 키는 `KV_KEYS`(`wannasong:state`·`wannasong:feedback`·`wannasong:fallback-pool`·`wannasong:heartbeat`). "KV"는 Redis 키를 뜻하며 Vercel KV(Upstash)든 온프레미스 Redis든 같다. 쓰기는 전부 백엔드(state 300ms 디바운스, heartbeat 30초). 읽기는 전환 전까지 웹이 feedback·heartbeat만, 전환 후에는 백엔드만.

## 하드 규칙

- **권한은 서버가 결정.** 비스피커의 제어 이벤트는 서버가 조용히 무시한다. 웹 UI 숨김은 편의.
- **이벤트·KV·에러 코드·request kind를 바꾸면 여섯 곳을 같은 커밋에서 맞춘다**: ① `packages/contract/src/*` 코드 ② `packages/contract/README.md` 표 ③ `docs/backend-onprem-handoff.md` 해당 절 ④ 웹 호출부(`apps/web/hooks/useSocket.ts`·`apps/web/components/*`) ⑤ `test/security.test.mjs`(해당 시나리오) ⑥ 이 문서의 "계약의 모양"(구조가 바뀐 경우). 그리고 상대 저장소(백엔드)에 변경을 **통보**한다 — 커밋 메시지나 PR 본문에 "contract: …" 한 줄과 백엔드 측 할 일을 적는다. (369a13b의 링크 제거는 ①②④⑤를 맞췄고 ③은 스펙 자체가 그 커밋에서 생겼다.)
- 새 실패 사유 = `ERR_CODES` 항목 + `ERR_MSG` 문구 한 쌍. 웹 Route Handler도 같은 코드를 `apiError()`로 쓴다.
- 계약 변경은 `CLAUDE.md` §7의 "risk 적시 후 1회 확인" 대상이다 — 상대 저장소 배포와 순서가 얽힌다(하위 호환이면 웹 먼저, 아니면 Java 먼저).
- `packages/contract`는 빌드 없이 소스로 소비된다(`transpilePackages`). 런타임 의존성을 넣지 않는다 — 타입·상수·순수 함수만.

## 백엔드 구현 제약 (스펙 문서에 그대로 있어야 하는 것)

- Socket.IO **v4 프로토콜(Engine.IO 4)** 호환이어야 웹의 socket.io-client 4가 그대로 붙는다(Java면 netty-socketio 등). 언어는 미정 — 스펙은 언어 중립. 버전 매칭이 첫 번째 리스크.
- **단일 프로세스.** 스피커 소켓 ID·재생 상태·실패 영상·검색 캐시는 프로세스 메모리. 멀티 인스턴스 미지원.
- CORS: 웹 origin(공개 도메인·로컬 3000)만 허용, WebSocket upgrade 통과. 목표 배치는 같은 공개 origin 뒤 리버스 프록시(스펙 §10).
- REST 5종(`/api/suggest` `/api/ytsearch` `/api/feedback` `/api/health` `/api/info`)의 응답 형태·레이트리밋·에러 문구는 현재 웹 Route Handler와 **바이트 단위로 같아야** 프론트 토스트가 일치한다(스펙 §2). 웹 라우트를 고치면 스펙 §2도 고친다.
- 재생 로직(advance / pickFallback / enqueue / 1분 idle 재시도 / 6시간 폴백 갱신 / fallback.txt 파서)은 스펙 §4가 체크리스트. 설계 의도는 "**침묵보다 반복이 낫다**" — 폴백이 비면 과거 재생곡이라도 튼다.

## env 동등성

전환 전(웹이 REST를 갖는 동안) 웹과 백엔드가 **같은 값**을 가져야 하는 키: `SPEAKER_KEY`(웹은 건의 열람, 백엔드는 재생 권한), `YT_API_KEY`(웹은 검색, 백엔드는 폴백 로드), KV URL/TOKEN 두 키(Upstash를 쓰는 경우). 백엔드 전용: ACCESS_CODE·COOLDOWN_SEC·MAX_QUEUE·MAX_PENDING_PER_USER·FALLBACK_PLAYLIST·PORT·Redis 접속·CORS origin. 웹 전용: `NEXT_PUBLIC_REALTIME_URL`. `PUBLIC_URL`은 양쪽(`/api/info`를 누가 서빙하느냐에 따라). 키를 추가하면 `wannasong-stack` env 표와 스펙 §1·`packages/contract/README.md` §환경 변수를 같이 고친다.

## 검증

- 웹만으로: `/verify-runtime`의 REST 단계. 소켓 경로는 백엔드 없이는 "확인 불가"로 보고한다.
- 백엔드가 있으면: 테스트용 env(ACCESS_CODE=secret SPEAKER_KEY=spk COOLDOWN_SEC=0 MAX_PENDING_PER_USER=1)로 띄운 서버에 `URL=… pnpm test`, REST는 `BASE=… pnpm test:api`. 시나리오는 `test/security.test.mjs` 상단 주석이 계약. 스펙 §11 체크리스트가 인수 기준.
- 백엔드 코드가 이 저장소로 들어오면(워크스페이스 추가) 이 문서의 "별도 저장소" 전제를 지우고 `wannasong-harness-sync` §새 워크스페이스 절차를 밟는다.
