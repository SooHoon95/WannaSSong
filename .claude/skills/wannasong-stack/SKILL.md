---
name: wannasong-stack
description: WannaSong 기술 스택의 단일 진실 소스 — 모노레포(pnpm workspaces) 구성, 워크스페이스별 런타임·언어·프레임워크·실행/빌드/테스트 명령·배포 타깃·환경변수, 백엔드(온프레미스 단일 프로세스, 별도 저장소) 전환 상태. 트리거 — (1) 실행·빌드·테스트·배포 명령이 필요할 때, (2) 의존성 추가/제거·런타임 변경·패키지 매니저/프레임워크 교체·새 워크스페이스(백엔드) 추가 등 스택을 바꾸는 작업, (3) 환경변수를 추가·변경할 때, (4) harness-check 가 스택 드리프트를 보고했을 때. 스택이 바뀌면 코드보다 이 문서를 먼저 갱신한다.
---

# WannaSong Stack (단일 진실 소스)

이 문서의 사실은 `.claude/harness/stack-manifest.json`의 지문과 일치해야 한다. 지문은 `.claude/harness/harness-check.mjs`가 저장소에서 **워크스페이스 단위로** 자동 추출하고, 이 문서는 사람이 읽는 설명이다. 둘이 어긋나면 훅이 드리프트를 보고하고 `wannasong-harness-sync` 절차가 시작된다.

## 전환 중: Vercel + KV 분리형 → 온프레미스 단일 백엔드 (2026-09-07 기준)

| | 현재 코드 | 목표 (`docs/backend-onprem-handoff.md`, 커밋 369a13b) |
|--|--|--|
| 웹 | Next.js UI **+ REST 5종**(Route Handler) + KV 읽기 | Next.js **UI만**. 같은 공개 origin의 `/api/*`·socket.io는 리버스 프록시가 백엔드로 |
| 백엔드 | 없음(별도 저장소 예정) | 단일 온프레미스 프로세스가 REST + Socket.IO + Redis + 폴백 로드 전부 담당. 언어 미정(README는 Java로 표기) |
| 상태 저장 | Vercel KV(Upstash REST) — 웹이 읽기만 | 온프레미스 Redis — 백엔드만 접근 |
| 배포 | Vercel | 리버스 프록시(nginx/Caddy) 뒤 Next(`pnpm start`) + 백엔드 |

`README.md`·`tasks/plan-nextjs-migration.md`는 아직 Vercel+KV 기준이고 `docs/backend-onprem-handoff.md`는 온프레미스 기준이다 — **어느 쪽이 확정인지는 사용자 결정**(`tasks/todo.md` D항). 전환이 확정·완료되면 이 절을 지우고 아래 표를 확정한다. 웹의 Route Handler·KV 클라이언트는 백엔드 이식 후 삭제 예정이라 `wannasong-architecture`가 "이전 대기"로 표기한다.

## 모노레포 구성

| 워크스페이스 | 종류 | 역할 | 배포 |
|------|------|------|------|
| 루트 | pnpm workspaces(`pnpm-workspace.yaml`: `apps/*`, `packages/*`) · corepack 핀 `packageManager` 필드 | 공통 스크립트(`pnpm --filter web …`)·테스트 스크립트·루트 devDependency(테스트용 socket.io-client) | — |
| `apps/web` | Node · TypeScript · Next.js 16 (App Router) · React 19 | 주크박스 UI (+ 전환 전까지 REST API·KV 읽기) | Vercel(`apps/web/vercel.json`) 또는 프록시 뒤 `pnpm start` |
| `packages/contract` | TypeScript 소스 패키지(빌드 없음, `workspace:*` 의존, `transpilePackages`로 웹이 직접 소비) | 소켓 이벤트·KV/Redis 키·에러 코드·타입 — 백엔드 연동 계약 | 배포 없음 |
| `test/` | 루트 스크립트(프레임워크 없음) | `test/api.test.mjs`(REST smoke) · `test/security.test.mjs`(소켓 보안·권한, 백엔드 대상) | — |
| `data/fallback.txt` | 데이터 | 자동 재생 목록 정의. 백엔드가 로드 | 백엔드에 배포 |
| `docs/` | 문서 | 상대 저장소(백엔드 구현자)에 건네는 **핸드오프 스펙**. 계획·교훈은 `tasks/` | — |

패키지 매니저 **pnpm 10**(`pnpm-lock.yaml` 하나, corepack 핀 `pnpm@10.17.1`). 로컬에 pnpm이 없으면 `corepack enable`(nvm의 node bin 디렉터리에 shim 생성, 1회)을 권장한다 — 루트 스크립트가 내부에서 bare pnpm을 다시 부르므로 `corepack pnpm dev`만으로는 실패한다(2026-09-07 확인). 활성화 없이 쓰려면 `corepack pnpm --filter web dev`처럼 워크스페이스 스크립트를 직접 부른다. 런타임 Node — 버전 미고정(Next 16 요구는 20.9 이상, 로컬 24). 루트 `package.json`은 CommonJS 기본이지만 `.mjs` 스크립트와 Next/TS 소스는 ESM 문법.

## 실행·빌드·테스트 명령

```bash
pnpm install                                  # 루트에서 한 번 (workspaces 전체)
cp apps/web/.env.example apps/web/.env.local  # 값 채우기
pnpm dev                                      # apps/web → http://localhost:3000
pnpm build                                    # next build
pnpm lint                                     # eslint (apps/web)
pnpm --filter web exec tsc --noEmit           # 타입체크 (build 가 포함하지만 빠르게 볼 때)
```

테스트는 **떠 있는 서버**에 붙는 스크립트다(프레임워크 없음, PASS/FAIL 나열, 실패 시 exit 1):

```bash
pnpm test:api           # BASE=http://localhost:3000 기본 — dev 서버(또는 백엔드) 필요
URL=http://localhost:3001 pnpm test   # 백엔드 Socket.IO 대상 (준비 전에는 실행 불가)
```

- `test:api`의 suggest 항목은 iTunes(KR → 비면 US 폴백), ytsearch 항목은 YouTube 실네트워크를 탄다. 키가 없으면 ytsearch는 NO_API_KEY 응답을 정상으로 본다.
- 판정은 출력의 FAIL 줄 유무. 파이프(`| tail`)를 붙이면 종료 코드는 마지막 명령의 것이다.
- 이 개발 기계에는 구 WannaSong(Express) 서버가 3000에 떠 있을 수 있다. 검증은 3100 포트에서 하고 응답 주체를 확인한다(`/verify-runtime`).

절차 전체는 `/verify-runtime`이 단일 진실 소스.

## 배포 타깃

| 대상 | 설정 | 메모 |
|------|------|------|
| Vercel (웹, 현재) | `apps/web/vercel.json` — installCommand가 루트에서 `pnpm install`, framework nextjs | Root Directory `apps/web`. 전환 후에는 사용 여부 미정 |
| 온프레미스 (목표) | 리버스 프록시: `/` → Next, `/api/*`·`/socket.io/*` → 백엔드(WebSocket upgrade) | 백엔드 단일 프로세스 always-on, `data/fallback.txt` 배포. 상세는 `docs/backend-onprem-handoff.md` §10 |

## 환경변수

### 웹 (`apps/web/.env.example`에 전부 선언, 코드는 `process.env`로만 읽음)

| 키 | 역할 | 읽는 곳 |
|----|------|--------|
| `WANNASONG_REDIS_REST_KV_REST_API_URL` / `WANNASONG_REDIS_REST_KV_REST_API_TOKEN` | Vercel KV(Upstash REST). 둘 다 없으면 KV 함수는 빈 값 반환. 전환 후 삭제 대상 | `apps/web/lib/kv.ts` |
| `NEXT_PUBLIC_REALTIME_URL` | 백엔드 Socket.IO origin. **현재 코드는 비면 미연결**. 스펙은 "비면 same-origin(프록시)" — 코드 미구현 | `apps/web/hooks/useSocket.ts` |
| `PUBLIC_URL` | QR·공유용 외부 주소 | `/api/info` |
| `YT_API_KEY` | YouTube Data API v3. 없으면 `/api/ytsearch`가 NO_API_KEY. 전환 후 백엔드로 | `apps/web/lib/youtube.ts` |
| `SPEAKER_KEY` | `/api/feedback` 열람 검증. 재생 권한의 진실은 백엔드 | `apps/web/lib/env.ts` |
| `PORT` | 로컬 dev LAN URL 계산 | `/api/info` |

`NEXT_PUBLIC_` 접두 키만 브라우저로 나간다. YouTube 키는 서버 측에만.

### 백엔드 (동등성 — 값이 같아야 하는 키)

```
ACCESS_CODE  SPEAKER_KEY  YT_API_KEY  COOLDOWN_SEC  MAX_QUEUE  MAX_PENDING_PER_USER
FALLBACK_PLAYLIST  PORT  PUBLIC_URL  Redis 접속 정보  CORS 허용 origin
```
표 전체와 의미는 `docs/backend-onprem-handoff.md` §1과 `wannasong-contract` §env 동등성. 새 환경변수를 추가하면: `.env.example` 선언 → 읽는 코드 → README 표 → 이 표. 훅이 `envKeys` 드리프트로 누락을 잡는다.

## 스택 변경 프로토콜

스택을 바꾸는 작업(예: 패키지 매니저 전환, Tailwind 도입, DB/ORM 도입, 테스트 프레임워크 도입, 새 워크스페이스 추가, 배포 타깃 변경, 백엔드 코드를 이 저장소로 들여오기)은 다음 순서를 지킨다.

1. **이 문서를 먼저 고친다** — 표를 새 사실로(계획 단계라면 위 "전환 중" 절처럼 현재 → 목표를 나란히 둔다).
2. 코드·설정 변경.
3. 훅이 보고한 드리프트를 보고 `wannasong-harness-sync` 절차로 나머지 하네스(`wannasong-architecture`·`wannasong-contract`·`wannasong-conventions`·커맨드·`CLAUDE.md` 표·검사기 목록)를 맞춘다.
4. `node .claude/harness/harness-check.mjs --strict` 0건 → `--update`로 manifest 승인.

지문이 추적하는 것: 패키지 매니저(락파일 + corepack 핀)·런타임·워크스페이스 선언(`package.json` workspaces 또는 `pnpm-workspace.yaml`)·루트 의존성/scripts·배포 파일·최상위 디렉터리·`.env.example` 키 + **워크스페이스마다** 종류(node/java/go/…)·언어·프레임워크·의존성·scripts·배포 파일·env 키. 문서 쪽은 백틱 참조 실재, **현재 매니저와 다른 패키지 매니저 명령**(pnpm 전환 때 코드 펜스 속 npm 명령 14곳이 통과한 실사고에서 추가), 외부 문서(`docs/`·README)의 저장소 내부 경로. 새 프레임워크/마커/배포 파일 종류가 검사기 목록(`NODE_FRAMEWORKS` / `POLYGLOT_MARKERS` / `DEPLOY_FILES` / `WATCH`)에 없으면 검사기도 함께 고치고 `--selftest`를 돌린다.
