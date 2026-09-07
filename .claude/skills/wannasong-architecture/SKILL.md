---
name: wannasong-architecture
description: WannaSong 웹 워크스페이스(apps/web)의 구조와 데이터 흐름 — App Router 라우트(페이지·Route Handler)와 파일 역할, 컴포넌트·훅·lib 분리 기준, Vercel(Next.js) vs Java 서버 역할 분리, 요청 경로(검색은 REST, 대기열·재생은 소켓, 건의/헬스는 KV 읽기), 클라이언트 상태와 localStorage 키, 스피커 워치독, Route Handler 작성 패턴(레이트리밋·apiError·계약 타입). 트리거 — 페이지·API 라우트·컴포넌트·훅·KV 읽기·소켓 클라이언트를 읽거나 바꾸는 모든 작업. 소켓 이벤트·KV 스키마 자체는 wannasong-contract, 스택·명령은 wannasong-stack.
---

# WannaSong Architecture (웹)

스택(프레임워크·명령)은 `wannasong-stack`, 계약(이벤트·KV·에러 코드)은 `wannasong-contract`에만 있다. 여기는 **웹의 구조와 흐름**만 다룬다.

## 역할 분리 (설계의 뼈대) — 전환 중

| 책임 | 현재 코드 | 전환 목표(`docs/backend-onprem-handoff.md`) |
|------|--------|------|
| UI 렌더, QR, localStorage, 스피커 브라우저의 YouTube IFrame 재생 | 웹(`apps/web`) | 웹 (변화 없음) |
| 검색(iTunes·YouTube), 정보·헬스·건의 열람 REST | 웹 Route Handler(`apps/web/app/api/*/route.ts`) | **백엔드** `/api/*` — 웹 라우트는 이식 후 삭제 |
| 대기열·재생 진행·스피커 선출·폴백 풀·레이트리밋·상태 쓰기 | 백엔드(별도 저장소, 미작성) | 백엔드 (같은 프로세스가 REST도) |
| 공유 상태 | Vercel KV — 웹이 feedback·heartbeat 읽기(`apps/web/lib/kv.ts`) | 온프레미스 Redis — 백엔드만. 웹 KV 클라이언트는 삭제 대상 |

**하드 규칙 — 권한과 상태의 진실은 백엔드.** 웹은 `state`를 받아 렌더하고, 제어는 소켓으로 요청만 한다. 웹에서 재생·대기열을 "판단"하는 코드를 넣지 않는다(원본 단일 서버 시절부터의 원칙: 클라이언트 UI 숨김은 편의, 권한은 서버가 결정).

전환 중 판단 기준: 웹의 REST·KV 코드에 **새 기능을 더하지 않는다**(버그 수정만). 그 기능은 백엔드 스펙에 적는다. 전환이 확정·완료되면 이 표를 한 열로 접는다.

## 파일 역할 (`apps/web`)

| 경로 | 역할 |
|------|------|
| `apps/web/app/layout.tsx` · `apps/web/app/globals.css` | 루트 레이아웃(lang ko), 다크 테마 전역 CSS(원본 style.css 이식, Tailwind 없음) |
| `apps/web/app/page.tsx` → `apps/web/components/JukeboxApp.tsx` | 메인 주크박스. 재생(스피커만)·진행바·검색(곡·YouTube 두 탭, 링크 탭은 369a13b에서 제거)·신청·대기열·QR 전부 한 Client Component |
| `apps/web/app/feedback/page.tsx` → `apps/web/components/FeedbackApp.tsx` | 건의 작성(소켓 `feedback`)·열람(`/api/feedback`) |
| `apps/web/app/player/route.ts` | `/player?key=` → `/?key=` 리다이렉트 (스피커 키 URL 진입) |
| `apps/web/app/api/*/route.ts` | Route Handler 5종: `/api/health` `/api/info` `/api/feedback` `/api/suggest` `/api/ytsearch` — **백엔드 이전 대기**(스펙 §2가 같은 표면을 정의) |
| `apps/web/components/YouTubeScript.tsx` | YouTube IFrame API 동적 로드(스피커 역할일 때만 Player 생성) |
| `apps/web/hooks/useSocket.ts` | `NEXT_PUBLIC_REALTIME_URL`로 socket.io 연결, `identify`, `state`/`tick`/`me` 수신. **URL 비면 미연결**(스펙 §1은 "비면 same-origin 프록시"라 하지만 코드는 미구현 — 전환 시 고칠 지점) |
| `apps/web/hooks/useToast.ts` | 토스트 |
| `apps/web/lib/kv.ts` | KV 읽기 전용(`getFeedback()`·`getHeartbeat()`). 미설정이면 빈 값 — 던지지 않는다. 전환 후 삭제 대상 |
| `apps/web/lib/youtube.ts` · `apps/web/lib/itunes.ts` | 외부 API 래퍼(원본 lib 이식). `hasApiKey()`·`searchYouTube()`·`itunesSearch()`(KR → 비면 US 폴백, artist·title 중복 제거). `parseVideoId()`·`oembed()`는 **웹에서 호출처 없음** — 백엔드 이식용 참조 코드(스펙 §9) |
| `apps/web/lib/rate-limit.ts` | IP 기준 슬라이딩 윈도우 `rateLimit()`, `clientIp()`, 계약 문구로 응답하는 `apiError()` |
| `apps/web/lib/env.ts` | 버전·LAN URL·스피커 키 읽기(서버 전용) |
| `apps/web/lib/utils.ts` | 포맷·localStorage 접근자(`jb.` 접두 키)·모바일 판별 |
| `apps/web/types/youtube.d.ts` | YT IFrame API 타입 |

분리 기준: **외부 서비스 호출**은 lib, **화면**은 components, **소켓/브라우저 상태**는 hooks, **HTTP 표면**은 app/api. 컴포넌트가 커져 읽기 어려워지면 그때 Player/Queue/RequestTabs/ShareQR 단위로 나눈다 — 미리 쪼개지 않는다.

## 요청 경로

| 사용자 행동 | 경로 | 비고 |
|------|------|------|
| 자동완성 입력 | `POST /api/suggest` (iTunes) | 원본은 소켓 `suggest`였음. 백엔드도 REST로 구현 |
| YouTube 검색 | `POST /api/ytsearch` | 5회/분/IP, 키 없으면 NO_API_KEY |
| 신청 | 소켓 `request` — kind `itunes`(artist·title → 백엔드가 YouTube 1회 검색) 또는 `video`(ytsearch 결과의 videoId 재사용). **kind url(링크 붙여넣기)은 제거됨** — 키 없으면 신청 자체가 불가하고 UI가 그렇게 안내 | 이벤트 표는 `wannasong-contract` |
| 취소·스피커 제어·건의 작성 | 소켓(`useSocket`) | |
| 건의 열람 | `GET /api/feedback` + `SPEAKER_KEY` | KV 읽기 |
| 헬스·공유 URL | `GET /api/health`(KV heartbeat) · `GET /api/info` | |

## 클라이언트 상태

- 서버 상태(`PublicState`)는 소켓 `state`로만 갱신. `tick`은 진행 위치를 받아 1초 보간(표시용).
- localStorage 키(원본과 동일, 마이그레이션 호환): `jb.clientId`(1인 식별, 서버가 신뢰), `jb.code`(입장 코드), `jb.speakerKey`, `jb.wasSpeaker`(새로고침 후 자동 복귀).
- 스피커 워치독은 **클라이언트**에 있다: 재생도 일시정지도 아닌 상태가 45초(`STALL_MS`)면 재로드 → 그래도 안 되면 `speaker:error` code stalled. 사람이 일시정지한 건 건드리지 않는다.
- Wake Lock·YT Player는 스피커 역할일 때만 만든다.

## Route Handler 작성 패턴 (하드 규칙)

1. 입력 검증 → `rateLimit()`(필요 시) → 처리 → `NextResponse.json`. 실패는 `apiError('CODE', status)`로 **계약 코드**를 쓰고 문구는 `errMsg()`에 맡긴다. 새 실패 사유는 `packages/contract/src/err-messages.ts`에 코드+문구를 한 쌍으로 추가(계약 변경 절차 적용).
2. 시크릿(`YT_API_KEY`·KV 토큰)은 Route Handler/lib에서만 읽는다. Client Component에서는 `NEXT_PUBLIC_` 키만.
3. KV·외부 API 실패는 사용자 흐름을 막지 않는 기본값(빈 목록·false)으로 흡수하고, 진짜 오류만 500.
4. 새 라우트는 `/new-api-route`로 만든다 — 단, 전환 중이라 그 커맨드가 먼저 "백엔드 스펙에 적을 일이 아닌가"를 묻는다.
5. 라우트를 추가·삭제하면 README API 표와 이 문서의 파일 표를 같은 커밋에서 맞춘다. 검사기가 문서의 라우트 토큰을 App Router 디렉터리로 검증한다.
