# WannaSSong 온프레미스 백엔드 구현 스펙

프론트(Next.js UI) 팀에 전달하지 말고, **백엔드 구현자에게 전달**하는 문서입니다.  
Vercel / Upstash 없이 **단일 온프레미스 프로세스**가 REST + Socket.IO + Redis + 폴백 로드를 모두 담당합니다.

- 계약 SSOT(타입·이벤트·에러·KV 키): 모노레포 `packages/contract`
- 참조 구현(알고리즘): 형제 저장소 `WannaSong/server.js` (있으면 이식)
- 프론트는 같은 공개 origin의 `/api/*`와 Socket.IO만 호출합니다 (리버스 프록시 전제)

```
Browser ──► Reverse Proxy ──► Next.js (UI only)
                 │
                 ├── /api/* , /socket.io/* ──► Backend (이 문서)
                 └──
Backend ──► Redis
Backend ──► iTunes Search API, YouTube Data API (필요 시 oEmbed)
Browser (스피커 PC) ──► YouTube IFrame API (재생만, 서버 아님)
```

**스코프 제외:** 프론트 **링크(URL) 붙여넣기 탭은 사용하지 않습니다.** Socket `request`의 `kind: 'url'`은 구현·테스트 대상이 아닙니다.

**제약:** `speakerSocketId` 등 스피커 상태는 메모리에 두므로 **단일 인스턴스만** 실행합니다.

---

## 1. 환경 변수

| 변수 | 필수 | 설명 | 기본 예 |
|------|------|------|---------|
| `PORT` | 권장 | HTTP + Socket.IO listen | `3001` |
| `PUBLIC_URL` | 권장 | QR/공유용 외부 URL | `https://jukebox.example.com` |
| `ACCESS_CODE` | 선택 | 설정 시 입장 코드 인증 | — |
| `SPEAKER_KEY` | 선택 | 스피커 claim + `GET /api/feedback` 키 | — |
| `YT_API_KEY` | 검색·폴백용 | 없으면 `searchEnabled=false`, ytsearch/itunes→YT 불가 | — |
| `COOLDOWN_SEC` | 선택 | 신청 쿨다운(초) | `300` |
| `MAX_QUEUE` | 선택 | 대기열 최대 | `50` |
| `MAX_PENDING_PER_USER` | 선택 | clientId당 대기 중 신청 상한 | `3` |
| `FALLBACK_PLAYLIST` / fallback 파일 경로 | 권장 | `data/fallback.txt` | 모노레포 `data/fallback.txt` |
| Redis URL (또는 host/port/password) | 권장 | 상태 영속 | 로컬 Redis |
| CORS 허용 origin | 필수 | 프론트 공개 URL, 로컬 `http://localhost:3000` | — |

프론트 쪽 `NEXT_PUBLIC_REALTIME_URL`은 비우면 same-origin(프록시)을 씁니다. 백엔드 공개 주소와 맞추면 됩니다.

---

## 2. HTTP REST API

모든 검색/건의조회/헬스는 **REST**. Socket으로 `suggest` / `ytsearch`를 구현하지 **않습니다**.

공통:

- JSON
- 레이트 리밋 초과 시 `{ "ok": false, "error": "<한국어 메시지>" }` + HTTP 429 (코드 `RATE_LIMITED`)
- 에러 문구는 아래 §6 `ERR_MSG`와 동일해야 프론트 토스트가 일치합니다

### `POST /api/suggest`

- Rate: **40 / min / IP**
- Body: `{ "q": string }` (trim, max 100자). 빈 문자열 → `{ ok: true, results: [] }`
- 동작: Apple iTunes Search  
  - `media=music`, `entity=song`, `limit=8`  
  - 우선 `country=KR` → **결과가 0이면** `country=US`로 재시도 (KR 스토어프론트가 빈 배열을 주는 경우 대응)
- 응답:

```json
{
  "ok": true,
  "results": [
    {
      "artist": "IU",
      "title": "Lilac",
      "album": "...",
      "artwork": "https://...",
      "durationMs": 214253
    }
  ]
}
```

- artist|title 기준 중복 제거(대소문자 무시)

### `POST /api/ytsearch`

- Rate: **5 / min / IP**
- Body: `{ "q": string }`
- `YT_API_KEY` 없으면 `{ ok: false, error: ERR_MSG.NO_API_KEY }` (적절한 4xx)
- YouTube Data API v3 `search`:
  - `part=snippet`, `type=video`, `videoCategoryId=10`, `videoEmbeddable=true`, `maxResults=5`
- 403 + body에 `quotaExceeded` → `QUOTA_EXCEEDED`
- 응답: `{ ok: true, results: Track[] }`  
  `Track = { videoId, title, author, thumb? }`  
  title HTML 엔티티 디코드(`&amp;` 등)

### `GET /api/feedback?key=`

- `SPEAKER_KEY`가 설정돼 있으면 query `key`가 일치해야 함. 아니면 **401** `{ "error": "key required" }`
- Redis `wannasong:feedback` 배열 반환. 각 항목은 `{ id, text, at }`만 (clientId 노출 금지)
- 키 미설정 시 인증 없이 목록 반환 가능(현재 Next 동작과 동일)

### `GET /api/health`

- `{ "ok": true, "speakerOnline": boolean }`
- `speakerOnline`은 메모리상 스피커 소켓 존재 여부(및/또는 heartbeat와 동기)

### `GET /api/info`

- QR/공유 UI용:

```json
{
  "lanUrls": ["http://192.168.x.x:3000"],
  "port": 3000,
  "version": "0.1.0",
  "publicUrl": "https://..."
}
```

- `lanUrls`: 서버 NIC의 non-internal IPv4 + 공개 포트(프록시 앞단 포트일 수 있음)
- `publicUrl`: `PUBLIC_URL`
- `version`: 백엔드/앱 버전 문자열

---

## 3. Socket.IO (v4 / Engine.IO 4)

- 경로: 기본 `/socket.io/`
- 트랜스포트: `websocket` + `polling`
- CORS + WebSocket upgrade 허용
- **ack** 공통 shape:

```ts
{
  ok: boolean;
  error?: string;           // 한국어 메시지 (ERR_MSG)
  reason?: string;          // claim 실패 등 (자유 문자열 가능)
  needKey?: boolean;        // speaker:claim
  cooldownRemainingMs?: number;
  item?: QueueItem;         // request 성공
  results?: unknown;        // (REST로 이전됨 — 소켓 suggest/ytsearch 미사용)
}
```

### 3.1 Client → Server

| 이벤트 | 권한 | Rate | 페이로드 | 동작 |
|--------|------|------|----------|------|
| `identify` | 모두 | 20/min | `{ clientId, code? }` | 인증 후 해당 소켓에 `me` emit |
| `request` | 인증 | 10/min | 아래 kind 참고 | resolve → `enqueue` → ack |
| `remove` | 인증 | — | `{ id }` | **본인** 신청만 큐에서 제거, 쿨다운 복원 |
| `speaker:claim` | 키(설정 시) | 10/min | `{ key? }` | 단일 스피커 선출 |
| `speaker:tick` | 스피커 | — | `{ position, duration, status }` | 타 클라에 `tick` **volatile** |
| `speaker:ended` | 스피커 | — | `{ videoId }` | nowPlaying과 일치 시 `advance('ended')` |
| `speaker:error` | 스피커 | — | `{ videoId, code }` | failedVideoIds 추가, **1.5s 후** `advance('error')` |
| `speaker:skip` | 스피커 | — | (없음) | `advance('skipped')` |
| `fallback:set` | 스피커 | — | `{ name }` | 폴백 카테고리 변경 |
| `speaker:release` | 스피커 | — | (없음) | 역할 반납, `speakerOnline=false` |
| `feedback` | 인증 | 3 / 10min | `{ text }` 2~500자 | Redis feedback unshift (max 1000) |

비스피커의 `speaker:*` / skip / release / ended / error는 **무시**.

연결 직후(또는 identify 후) 해당 소켓에 현재 `state` 1회 전송. 테스트는 `once('state')`로 확인합니다.

### 3.2 `request` kind별 처리

지원 kind는 **`itunes`**, **`video`만**입니다. (`url` / 링크 붙여넣기는 미사용 — 수신 시 무시하거나 `BAD_URL` 등으로 거절)

**`{ kind: 'itunes', artist, title }`**

1. `YT_API_KEY` 없으면 `NO_API_KEY`
2. 쿼리 `"${artist} ${title}"` 로 YouTube 검색 **1회** (embeddable 등 ytsearch와 동일 필터 권장)
3. 결과 없으면 `NOT_FOUND`
4. 첫 유효 결과로 `enqueue`

**`{ kind: 'video', videoId, title, author, thumb? }`**

1. videoId 검증 (11자). 실패 시 `BAD_URL` 또는 거절
2. 메타가 비어 있으면 선택적으로 oEmbed로 보강
3. **YouTube Search API는 다시 호출하지 않음** (프론트 ytsearch 결과의 videoId 재사용)
4. `enqueue`

### 3.3 Server → Client

| 이벤트 | 대상 | 페이로드 |
|--------|------|----------|
| `state` | 브로드캐스트 | `PublicState` (아래) |
| `tick` | 비스피커만, volatile | `{ position, duration, status, updatedAt }` |
| `me` | 해당 소켓 | `{ ok, authRequired?, cooldownRemainingMs? }` |

**`PublicState`**

```ts
{
  nowPlaying: QueueItem | null;
  queue: QueueItem[];
  history: HistoryItem[];          // 브로드캐스트는 최근 30
  speakerOnline: boolean;
  cooldownSec: number;             // COOLDOWN_SEC
  searchEnabled: boolean;          // !!YT_API_KEY
  authRequired: boolean;           // !!ACCESS_CODE
  speakerKeyRequired: boolean;     // !!SPEAKER_KEY
  version: string;
  fallbackCount: number;
  fallbackCategory: string;
  fallbackCategories: { name: string; count: number }[];
  playback: {
    position: number;
    duration: number;
    status: string;                // playing | paused | idle | ...
    updatedAt: number;
  };
}
```

**`QueueItem`**

```ts
{
  id: string;                      // 고유 ID
  videoId: string;
  title: string;
  author: string;
  thumb?: string;
  category?: string;
  requestedBy: { clientId: string } | null;
  requestedAt: number;
  source: 'request' | 'fallback';
}
```

---

## 4. 대기열 · 재생 로직

원본 `WannaSong/server.js`와 동일하게 맞춥니다. 요약:

### `enqueue(track, clientId)`

1. 동일 `videoId`가 nowPlaying 또는 queue에 있으면 → `DUPLICATE`
2. `queue.length >= MAX_QUEUE` → `QUEUE_FULL`
3. 해당 clientId의 queue 내 `source==='request'` 개수 ≥ `MAX_PENDING_PER_USER` → `TOO_MANY_PENDING`
4. `now - lastRequestAt[clientId] < COOLDOWN_SEC*1000` → `COOLDOWN` (+ `cooldownRemainingMs`)
5. 항목 추가, `lastRequestAt` 갱신, `save()`, `state` 브로드캐스트
6. ack `{ ok: true, item, cooldownRemainingMs }`

### `advance(reason)`

- reason: `ended` | `skipped` | `error` | `start`
- 현재 nowPlaying을 history 앞에 넣고 `endReason`/`endedAt` 설정
- `queue.shift()` 없으면 `pickFallback()`
- history 영속 상한 **200**, 브로드캐스트 **30**

### `pickFallback()`

- 현재 `fallbackCategory` 풀에서 후보 선택
- **최근 재생 회피(약 15~100곡)** — 원본 수치 준수
- `failedVideoIds` 제외
- 부족 시 과거 정상 재생 히스토리에서 랜덤

### 타이머

| 주기 | 동작 |
|------|------|
| **1분** | 스피커 온라인 && nowPlaying 없음 → `advance('start')` |
| **6시간** | `loadFallback()` — `fallback.txt` 재파싱 + chart/search/playlist YT 갱신 |
| **30초** | Redis `wannasong:heartbeat` = `{ speakerOnline, at: ISO8601 }` |
| 상태 변경 | Redis `wannasong:state` 저장 **300ms debounce** |

### 기동

1. Redis에서 `PersistedState` 복원: `queue`, `history`, `lastRequestAt`, `fallbackCategory`
2. `nowPlaying = null` (재시작 시 재생 중 곡은 복원하지 않음)
3. fallback 로드
4. listen

### 스피커 disconnect

- claim한 소켓이 끊기면 release와 동일 처리 → `speakerOnline=false`, `state` 브로드캐스트

### 클라이언트 보조 (서버가 받을 이벤트)

- 스피커 UI는 stall(~45s) 후 `speaker:error` `{ code: 'stalled' }` 를 보낼 수 있음 → 일반 error와 동일 처리

---

## 5. Redis 키

| Key | 값 | 쓰기 |
|-----|-----|------|
| `wannasong:state` | `{ queue, history, lastRequestAt, fallbackCategory }` — **nowPlaying 제외** | debounce 300ms |
| `wannasong:feedback` | `FeedbackItem[]` max **1000** | `feedback` 이벤트 |
| `wannasong:fallback-pool` | `{ [categoryName]: Track[] }` 카테고리당 max **500** | `loadFallback` |
| `wannasong:heartbeat` | `{ speakerOnline: boolean, at: ISO8601 }` | 30초 |

메모리만 (비영속): `speakerSocketId`, `playback`, `failedVideoIds`, (선택) 검색 캐시.

---

## 6. 에러 코드 → 한국어 메시지

ack/`error` 필드와 REST `error`에 **아래 문구를 그대로** 사용하세요.

| Code | Message |
|------|---------|
| `COOLDOWN` | 아직 쿨다운 중입니다. |
| `DUPLICATE` | 이미 대기열에 있는 곡입니다. |
| `NOT_FOUND` | YouTube에서 해당 곡을 찾지 못했습니다. |
| `BAD_URL` | YouTube 링크를 인식할 수 없습니다. *(fallback.txt URL/ID 파싱·videoId 검증용)* |
| `UNAVAILABLE` | 재생할 수 없는 영상입니다(비공개/삭제). |
| `NO_API_KEY` | YouTube API 키가 설정되지 않아 검색·신청을 할 수 없습니다. |
| `QUOTA_EXCEEDED` | 오늘 YouTube 검색 한도를 모두 썼습니다. 잠시 후 다시 시도해 주세요. |
| `AUTH_REQUIRED` | 입장 코드가 틀렸거나 입력되지 않았습니다. |
| `RATE_LIMITED` | 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요. |
| `FEEDBACK_EMPTY` | 내용을 입력해 주세요. |
| `QUEUE_FULL` | 대기열이 가득 찼습니다. 잠시 후 다시 신청해 주세요. |
| `TOO_MANY_PENDING` | 대기 중인 내 신청곡이 이미 {N}곡입니다. 재생된 뒤 다시 신청해 주세요. (`MAX_PENDING_PER_USER`) |

구현 관례: 내부에서 `throw new Error('CODE')` → ack/HTTP에서 `errMsg(code)`로 변환.

`speaker:claim` 실패 시 `needKey: true` 및 `reason`(예: 이미 다른 기기가 스피커)은 ERR_MSG 밖 문자열 가능.

---

## 7. 인증

| 메커니즘 | env | 동작 |
|----------|-----|------|
| 입장 코드 | `ACCESS_CODE` | `authRequired=true`. `identify`의 `code` 일치 시에만 `me.ok`. 미인증 `request`/`feedback` → `AUTH_REQUIRED` |
| 스피커 키 | `SPEAKER_KEY` | `speakerKeyRequired=true`. claim 시 `key` 필요. **동일 값**으로 `GET /api/feedback?key=` |
| clientId | 클라 localStorage | 쿨다운·pending·`remove` 소유권. 서버는 신뢰하되 rate limit으로 남용 완화 |

---

## 8. fallback.txt 문법

모노레포 `data/fallback.txt` 참고.

```
# 주석
[카테고리이름]
https://www.youtube.com/watch?v=...
# 또는 11자 ID
chart:KR
search:lofi hip hop
playlist:PLxxxxxxxxxxxx
```

- `chart` / `search` / `playlist` → `YT_API_KEY` 필요, 결과는 `wannasong:fallback-pool`에 카테고리별 누적(최대 500)
- 단일 URL/ID → API 키 없이 풀에 포함
- 임베드 불가·재생 실패 영상은 `failedVideoIds`로 건너뜀

---

## 9. YouTube / iTunes 구현 메모

프론트에 있던 참고 로직(이전 후 삭제 예정):

- YT search: `apps/web/lib/youtube.ts`의 `searchYouTube`
- videoId 파싱 / oEmbed: 동 파일 `parseVideoId`, `oembed` — **fallback.txt**의 URL·ID 줄, `kind:video` 메타 보강용 (유저 링크 신청용이 아님)
- iTunes + KR→US 폴백: `apps/web/lib/itunes.ts`
- IP rate limit 패턴: `apps/web/lib/rate-limit.ts` + `packages/contract`의 `RATE_LIMITS`

oEmbed URL 예 (선택):

`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={id}&format=json`

---

## 10. 리버스 프록시 (권장)

같은 공개 도메인:

| Path | Upstream |
|------|----------|
| `/` (UI) | Next.js (`pnpm start` 등) |
| `/api/*` | Backend |
| `/socket.io/*` | Backend (WebSocket upgrade) |

로컬 개발 시 프론트가 `BACKEND_URL`로 rewrite 할 수 있음. 프로덕션은 nginx/Caddy 권장.

---

## 11. 검증

모노레포 루트:

```bash
# Socket 보안·신청·스피커 시나리오 (백엔드 URL)
URL=http://localhost:3001 pnpm test

# REST 스모크 (프록시 공개 origin 또는 백엔드 직접)
BASE=http://localhost:3001 pnpm test:api
```

`test/security.test.mjs` 가정 예: `ACCESS_CODE`, `SPEAKER_KEY`, `COOLDOWN_SEC=0`, `MAX_PENDING_PER_USER=1` 등 — 테스트 파일 상단/주석 확인.

체크리스트:

- [ ] REST 5종 동작 + rate limit
- [ ] Socket 이벤트·ack·state/tick/me
- [ ] request 2 kind (`itunes`, `video`) + enqueue 가드 (`url` 미지원)
- [ ] advance / fallback / 타이머
- [ ] Redis 4키 영속·복원
- [ ] ACCESS_CODE / SPEAKER_KEY
- [ ] 단일 인스턴스·CORS·WS
- [ ] `pnpm test` / `pnpm test:api` PASS

---

## 12. 프론트가 담당하지 않는 것 (백엔드 범위 확인용)

백엔드가 **하지 않아도** 되는 것:

- React UI, QR 렌더, localStorage
- YouTube IFrame 재생(스피커 브라우저)
- Next Route Handler / Vercel KV 클라이언트

백엔드가 **반드시** 가져가야 하는 것:

- 위 REST 전부 (기존 Next `/api/*`)
- Socket.IO realtime 전부
- Redis 상태·feedback·fallback-pool·heartbeat
- iTunes/YouTube 서버측 호출 및 `request` 해석
