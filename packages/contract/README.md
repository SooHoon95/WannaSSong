# Java Realtime 서버 연동 계약

Next.js(Vercel) 클라이언트가 기대하는 **Socket.IO v4** 프로토콜과 **Vercel KV** 스키마입니다.  
참조 구현: 원본 [`WannaSong/server.js`](../../WannaSong/server.js) (형제 저장소).

## 권장 라이브러리

- [netty-socketio](https://github.com/mrniko/netty-socketio) — Socket.IO v4 호환 (Engine.IO 4)
- Upstash Redis REST 또는 Redis 프로토콜 — Vercel KV와 동일 인스턴스

**단일 프로세스**만 실행하세요. `speakerSocketId`는 메모리에 두며 멀티 인스턴스는 지원하지 않습니다.

## CORS

브라우저 origin(Vercel 배포 URL, 로컬 `http://localhost:3000`)을 허용하고 WebSocket upgrade를 통과시킵니다.

## Vercel KV 키

| 키 | 설명 |
|----|------|
| `wannasong:state` | `{ queue, history, lastRequestAt, fallbackCategory }` — `nowPlaying`은 저장하지 않음 |
| `wannasong:feedback` | 건의 배열, 최대 1000건 |
| `wannasong:fallback-pool` | `{ [category]: Track[] }` 동적 소스 누적 |
| `wannasong:heartbeat` | `{ speakerOnline: boolean, at: ISO8601 }` — 30초마다 갱신 |

`save()`: 상태 변경 후 **300ms 디바운스**로 `wannasong:state`에 JSON 저장.

## 클라이언트 → 서버 이벤트

ack 형식: `{ ok, error?, reason?, needKey?, cooldownRemainingMs?, item?, results? }`

| 이벤트 | 권한 | 레이트 | 동작 |
|--------|------|--------|------|
| `identify` | 모두 | 20/min | `{ clientId, code }` → `me` emit |
| `request` | 인증 | 10/min | `kind: url \| itunes \| video` 신청 → `enqueue` |
| `remove` | 인증 | — | `{ id }` 본인 신청 취소, 쿨다운 복원 |
| `speaker:claim` | 키(설정 시) | 10/min | 스피커 선출 |
| `speaker:tick` | 스피커 | — | `{ position, duration, status }` → 다른 클라에 `tick` volatile |
| `speaker:ended` | 스피커 | — | `{ videoId }` 일치 시 `advance('ended')` |
| `speaker:error` | 스피커 | — | `{ videoId, code }` → failedVideoIds 추가, 1.5s 후 `advance('error')` |
| `speaker:skip` | 스피커 | — | `advance('skipped')` |
| `fallback:set` | 스피커 | — | `{ name }` 카테고리 변경 |
| `speaker:release` | 스피커 | — | 역할 반납 |
| `feedback` | 인증 | 3/10min | `{ text }` 2~500자 → KV `wannasong:feedback` |

> `suggest`, `ytsearch`는 **Next.js REST** (`POST /api/suggest`, `/api/ytsearch`)로 이전됨. Java에서 구현 불필요.

## 서버 → 클라이언트

### `state` (브로드캐스트)

```typescript
{
  nowPlaying, queue, history: history.slice(0, 30),
  speakerOnline, cooldownSec, searchEnabled: hasApiKey(),
  authRequired: !!ACCESS_CODE, speakerKeyRequired: !!SPEAKER_KEY,
  version, fallbackCount, fallbackCategory, fallbackCategories,
  playback: { position, duration, status, updatedAt }
}
```

### `tick` (비스피커에게만 volatile)

### `me`

`{ ok, authRequired, cooldownRemainingMs }`

## 재생 로직 (필수)

1. **`advance(reason)`** — 현재 곡을 history 앞에, `queue.shift()` 또는 `pickFallback()`으로 다음 곡
2. **`pickFallback()`** — 카테고리 풀 → 최근 재생 회피(15~100곡) → 과거 정상 재생곡 랜덤
3. **`enqueue`** — 중복 검사, `MAX_QUEUE`, `MAX_PENDING_PER_USER`, 쿨다운
4. **기동 시** `nowPlaying = null`, KV에서 queue/history 복원
5. **1분 interval** — 스피커 있고 곡 없으면 `advance('start')`
6. **6시간 interval** — `loadFallback()` (`data/fallback.txt` 파서)

## fallback.txt 문법

```
[카테고리]
https://youtu.be/...     # 또는 11자 ID
playlist:PLxxx
search:검색어
chart:KR
```

## 환경 변수 (Java)

```
PORT=
ACCESS_CODE=
SPEAKER_KEY=
YT_API_KEY=
FALLBACK_PLAYLIST=
COOLDOWN_SEC=300
MAX_QUEUE=50
MAX_PENDING_PER_USER=3
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

## HTTP (선택)

`GET /api/health` → `{ ok: true, speakerOnline: boolean }` — 리버스 프록시 헬스체크용

## ERR_MSG 코드

`packages/contract/src/err-messages.ts` 참조. `throw new Error('CODE')` → ack.error 한국어 변환.

## 검증

루트에서 Java 서버 기동 후:

```bash
URL=https://realtime.example.com npm test
```

원본 [`test/security.test.mjs`](../../test/security.test.mjs)와 동일 시나리오 (suggest/ytsearch 소켓 테스트 제외).
