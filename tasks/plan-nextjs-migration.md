# WannaSong Next.js 전환 계획

> 프로젝트 git 보관용. Cursor Plan 원본: `~/.cursor/plans/next.js_wannasong_이전_12e1a095.plan.md`

## Vercel vs Java 역할 분리

### Vercel(Next.js)에서 처리 — 서버리스 가능

| 기능                            | 구현 위치               | 근거                                                                                                                                                 |
| ------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 메인 UI (`/`)                   | React Client Components | 기존 [`public/index.html`](/Users/brook/Github/side/WannaSong/public/index.html) + [`app.js`](/Users/brook/Github/side/WannaSong/public/app.js) 이식 |
| 건의 페이지 (`/feedback`)       | React                   | [`feedback.html`](/Users/brook/Github/side/WannaSong/public/feedback.html)                                                                           |
| `/player` → `/?key=` 리다이렉트 | Route Handler           | [`server.js:65`](/Users/brook/Github/side/WannaSong/server.js)                                                                                       |
| `GET /api/info`                 | Route Handler           | QR·공유용 `PUBLIC_URL`, 버전 (LAN URL은 로컬 dev만)                                                                                                  |
| `GET /api/feedback`             | Route Handler + KV      | 스피커 키 검증 후 KV에서 목록                                                                                                                        |
| `POST /api/suggest`             | Route Handler           | iTunes 검색 — [`lib/itunes.js`](/Users/brook/Github/side/WannaSong/lib/itunes.js) 이식                                                               |
| `POST /api/ytsearch`            | Route Handler           | YouTube 검색 — [`lib/youtube.js`](/Users/brook/Github/side/WannaSong/lib/youtube.js) 이식                                                            |
| `GET /api/health`               | Route Handler           | `{ ok: true }` + KV의 Java heartbeat 읽기                                                                                                            |

검색(`suggest`, `ytsearch`)을 REST로 옮기면 Java 쪽 YouTube/iTunes 의존·레이트리밋 중복을 줄일 수 있습니다. UI 동작은 동일하고, 클라이언트만 `socket.emit` → `fetch`로 변경합니다.

### Java 서버에서 처리 — Vercel 불가

| 기능                                    | 현재 코드                                                                   | Java에서 구현 필요                                            |
| --------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Socket.IO 13종 이벤트                   | [`server.js:222-403`](/Users/brook/Github/side/WannaSong/server.js)         | identify, request, remove, speaker:\*, feedback, fallback:set |
| state / tick / me 브로드캐스트          | [`server.js:91-108, 228-237`](/Users/brook/Github/side/WannaSong/server.js) | 동일 페이로드                                                 |
| advance / enqueue / pickFallback        | [`server.js:135-185`](/Users/brook/Github/side/WannaSong/server.js)         | 대기열·폴백·히스토리 로직                                     |
| 스피커 단일 선출                        | `speakerSocketId`                                                           | 프로세스 메모리 (단일 인스턴스)                               |
| playback / failedVideoIds / searchCache | 메모리                                                                      | Java 메모리                                                   |
| 폴백 로드 + 6시간 갱신                  | [`server.js:405-511`](/Users/brook/Github/side/WannaSong/server.js)         | `fallback.txt` + YouTube API                                  |
| 1분 idle 재시도 interval                | [`server.js:500-505`](/Users/brook/Github/side/WannaSong/server.js)         | Scheduled task                                                |
| 레이트 리밋                             | `makeLimiter()`                                                             | 메모리 슬라이딩 윈도우                                        |

Java는 **Socket.IO v4 프로토콜 호환** 라이브러리(netty-socketio 등)를 써야 기존 [`socket.io-client`](https://socket.io/)와 그대로 연결됩니다.

---

## Vercel KV 스키마 (Next.js ↔ Java 공유)

| 키                        | 타입                        | 쓰기                     | 읽기                          |
| ------------------------- | --------------------------- | ------------------------ | ----------------------------- |
| `wannasong:state`         | JSON                        | Java (디바운스 300ms)    | Java                          |
| `wannasong:feedback`      | JSON array (max 1000)       | Java (`feedback` 이벤트) | Next.js (`GET /api/feedback`) |
| `wannasong:fallback-pool` | JSON `{category: tracks[]}` | Java (동적 소스 갱신)    | Java                          |
| `wannasong:heartbeat`     | JSON `{speakerOnline, at}`  | Java (30초마다)          | Next.js (`GET /api/health`)   |

`state` 구조 (기존 [`state.json`](/Users/brook/Github/side/WannaSong/server.js)과 동일):

```typescript
{
  queue: QueueItem[];
  history: HistoryItem[];      // max 200
  lastRequestAt: Record<string, number>;
  fallbackCategory: string;
  // nowPlaying은 재시작 시 null — Java 기동 시 KV에서 queue만 복원
}
```

Java·Next.js 모두 `@vercel/kv`(Upstash REST) 또는 Redis URL로 접속. Vercel 대시보드에서 KV 생성 후 **동일 credentials**를 Linux 서버 env에도 설정.

---

## 새 프로젝트 디렉터리 구조

```
WannaSong-next/
├── apps/web/                    # Next.js (Vercel 배포)
│   ├── app/
│   │   ├── page.tsx             # 메인 주크박스
│   │   ├── feedback/page.tsx
│   │   ├── player/route.ts      # redirect
│   │   ├── globals.css          # style.css 이식
│   │   └── api/
│   │       ├── health/route.ts
│   │       ├── info/route.ts
│   │       ├── feedback/route.ts
│   │       ├── suggest/route.ts
│   │       └── ytsearch/route.ts
│   ├── components/              # Player, Queue, RequestTabs, ShareQR ...
│   ├── hooks/                   # useSocket, useSpeaker, useJukeboxState
│   ├── lib/
│   │   ├── kv.ts                # KV 헬퍼
│   │   ├── youtube.ts           # shared 이식
│   │   └── itunes.ts
│   └── .env.example
├── packages/contract/           # Java 연동용 단일 진실
│   ├── events.ts                # Socket 이벤트·페이로드 타입
│   ├── kv-keys.ts
│   ├── err-messages.ts          # ERR_MSG 한국어表
│   └── README.md                # Java 구현 가이드 (상세)
├── data/fallback.txt            # 기존 파일 복사
├── package.json                 # npm workspaces
└── README.md                    # 로컬 dev·배포·Java 연동
```

TypeScript 사용 (Next.js 기본). UI는 기존 [`style.css`](/Users/brook/Github/side/WannaSong/public/style.css) 다크 테마 그대로 이식 — Tailwind 도입 없이 CSS Modules 또는 global CSS.

---

## 프론트엔드 이식要点

기존 [`app.js`](/Users/brook/Github/side/WannaSong/public/app.js) (~350줄)를 React hooks + Client Components로 분리:

| 모듈              | 이식 내용                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `useSocket`       | `io(NEXT_PUBLIC_REALTIME_URL)` — Vercel 도메인과 다른 origin                                   |
| `useSpeaker`      | YT.Player, claim/release, 워치독(45s), Wake Lock, `jb.wasSpeaker` 자동 복귀                    |
| `useJukeboxState` | `state` / `tick` / `me` 수신, 진행바 1초 보간                                                  |
| `RequestTabs`     | iTunes suggest → `POST /api/suggest`, ytsearch → `POST /api/ytsearch`, request/remove → socket |
| `ShareQR`         | `qrcode.react`, `/api/info`에서 publicUrl                                                      |
| localStorage      | `jb.clientId`, `jb.code`, `jb.speakerKey`, `jb.wasSpeaker` 키 유지                             |

YouTube IFrame API: `next/script`로 동적 로드. 스피커 전용 Client Component에서만 Player 생성.

---

## 환경 변수

### Next.js (Vercel + `.env.example`)

| 키                                                  | 용도                                                       | 비고                               |
| --------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------- |
| `WANNASONG_REDIS_REST_KV_REST_API_URL`              | Vercel KV                                                  | Vercel 연동 시 자동                |
| `WANNASONG_REDIS_REST_KV_REST_API_TOKEN`            | Vercel KV                                                  | Vercel 연동 시 자동                |
| `NEXT_PUBLIC_REALTIME_URL`                          | Java Socket.IO URL                                         | 예: `https://realtime.example.com` |
| `PUBLIC_URL`                                        | QR·공유                                                    | Vercel 배포 URL                    |
| `YT_API_KEY`                                        | ytsearch API                                               | 없으면 검색 탭 숨김                |
| `SPEAKER_KEY`                                       | feedback GET 검증                                          | Next.js에서 검증                   |
| `ACCESS_CODE`                                       | (선택) Next.js에서 사전 검증 가능하나 **권한 진실은 Java** | Java env에도 동일 값               |
| `COOLDOWN_SEC`, `MAX_QUEUE`, `MAX_PENDING_PER_USER` | Java env                                                   | Next.js에는 불필요                 |

### Java Linux 서버

Next.js와 **동일한 보안·한도 env** + KV credentials + `YT_API_KEY`, `FALLBACK_PLAYLIST`, `PORT`, CORS 허용 origin(Vercel 도메인).

env에 없는 값은 `.env.example`에 빈 문자열/placeholder로 두고 README에 "추후 설정" 표기.

---

## Java 연동 계약서 (`packages/contract/README.md`)

다음을 문서·타입으로 고정 (Java 팀이 [`server.js`](/Users/brook/Github/side/WannaSong/server.js) 없이 구현 가능하도록):

1. **클라→서버 13 이벤트** — 페이로드, ack 형식, 권한, 레이트리밋 수치 ([architecture 스킬 표](/Users/brook/Github/side/WannaSong/.claude/skills/wannasong-architecture/SKILL.md) 그대로)
2. **서버→클라 3 이벤트** — `state`, `tick`, `me` + `publicState()` 필드 목록
3. **ERR_MSG 코드→한국어** 12종
4. **KV read/write 타이밍** — save 디바운스, feedback unshift, pool merge 규칙
5. **fallback.txt 파서** — [`server.js:412-430`](/Users/brook/Github/side/WannaSong/server.js)
6. **CORS** — `NEXT_PUBLIC_REALTIME_URL` origin, credentials
7. **HTTP** — Java 측 `GET /api/health` (선택, Fly 헬스체크용)

---

## 로컬 개발

```bash
# 터미널 1: Next.js
cd apps/web && npm run dev          # :3000

# 터미널 2: Java realtime (사용자 구현 후)
# 또는 개발용으로 packages/contract 기준 mock/stub

# KV: Vercel CLI `vercel env pull` 또는 Upstash dev 인스턴스
```

Java 서버가 준비되기 전까지 UI·REST API·KV 연동은 Next.js만으로 검증 가능. Socket 기능(대기열·재생)은 Java 연결 후 `/verify-runtime` 수준으로 확인.

---

## 배포

### Vercel (Next.js)

1. GitHub repo 연결 → Root: `apps/web`
2. Vercel KV 스토어 생성 → env 자동 주입
3. `NEXT_PUBLIC_REALTIME_URL`, `PUBLIC_URL`, `YT_API_KEY`, `SPEAKER_KEY` 설정
4. `vercel.json` — 필요 시 Cron 없음 (폴백 갱신은 Java 담당)

### Java Linux

- 단일 프로세스 always-on (스피커 선출은 멀티 인스턴스 불가)
- reverse proxy(Nginx/Caddy) + TLS + WebSocket upgrade
- KV·YouTube env 설정, `data/fallback.txt` 배포

---

## 검증 계획

| 항목                 | 방법                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| REST API             | `curl` suggest/ytsearch/feedback/info/health                                                                                    |
| UI 렌더              | Next.js dev 서버                                                                                                                |
| Socket·스피커·대기열 | Java 서버 + 기존 [`test/security.test.mjs`](/Users/brook/Github/side/WannaSong/test/security.test.mjs)를 Java URL 대상으로 포팅 |
| YouTube 실제 재생    | 육안 확인 (에이전트 불가)                                                                                                       |

---

## 구현 순서

1. **monorepo 스캐폴드** — `create-next-app`, workspaces, contract 패키지
2. **계획서 보관** — `tasks/plan-nextjs-migration.md`에 이 문서 내용 저장 (프로젝트 git 관리용, Cursor frontmatter 제거)
3. **shared lib** — youtube, itunes, 타입, ERR_MSG, KV keys
4. **Next.js API routes** — info, feedback, suggest, ytsearch, health
5. **UI 이식** — page, feedback, components, CSS
6. **Socket 클라이언트** — hooks, `NEXT_PUBLIC_REALTIME_URL` 연결
7. **contract 문서** — Java 구현 가이드 (server.js 로직 체크리스트)
8. **env·README·배포 설정** — `.env.example`, Vercel 설정
9. **런타임 검증** — REST 즉시, Socket은 Java 준비 후

---

## 범위外 (이번 작업에서 하지 않음)

- **Java 서버 코드 작성** — 사용자가 자체 Linux에서 구현 (contract 문서 제공)
- **기존 [`WannaSong`](/Users/brook/Github/side/WannaSong) 폴더 수정** — 새 폴더만 생성
- **하네스(CLAUDE.md·스킬) 이전** — 필요 시 별도 요청

## 리스크

- Java Socket.IO 호환성: netty-socketio 버전을 socket.io-client v4와 맞춰야 함 → contract README에 명시
- KV 무료 한도(일 3,000 command): save 디바운스 300ms 유지, heartbeat 30s 간격으로 완화
- `NEXT_PUBLIC_REALTIME_URL` 미설정 시 UI는 "연결 중" 상태 — env placeholder로 README 경고
