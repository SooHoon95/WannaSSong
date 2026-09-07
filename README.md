# WannaSong Next

Next.js(Vercel) + Java 실시간 서버 + Vercel KV로 재구현한 WannaSong입니다.

## 구조

- `apps/web` — Next.js UI + REST API (Vercel)
- `packages/contract` — Socket/KV 계약 타입 + Java 구현 가이드
- `data/fallback.txt` — 자동 재생 목록 (Java 서버가 로드)
- `tasks/plan-nextjs-migration.md` — 전환 계획서

## 로컬 개발

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
# .env.local 값 채우기 (KV·REALTIME_URL 등)

pnpm dev          # http://localhost:3000
```

Java realtime 서버(`NEXT_PUBLIC_REALTIME_URL`) 없이도 UI·REST API는 동작합니다. 대기열·재생은 Java 연결 후 사용 가능합니다.

## API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/health` | 헬스 + KV heartbeat |
| GET | `/api/info` | 버전, publicUrl, LAN URL |
| GET | `/api/feedback?key=` | 건의 목록 |
| POST | `/api/suggest` | iTunes 검색 `{ q }` |
| POST | `/api/ytsearch` | YouTube 검색 `{ q }` |

## Vercel 배포

1. 저장소 연결, **Root Directory**: `apps/web`
2. Vercel KV 생성 → env 자동 주입
3. `NEXT_PUBLIC_REALTIME_URL`, `PUBLIC_URL`, `YT_API_KEY`, `SPEAKER_KEY` 설정

## Java 서버

[`packages/contract/README.md`](packages/contract/README.md)를 따라 자체 Linux에서 Socket.IO 서버를 구현하세요.

## 테스트

```bash
# 터미널 1
pnpm dev

# 터미널 2 — REST API
pnpm test:api

# Java realtime 준비 후
URL=https://realtime.example.com pnpm test
```

## 라이선스

MIT

## 개발 하네스 (Claude Code)

`CLAUDE.md`가 작업 원칙, `.claude/skills/`가 스택·구조·계약·컨벤션의 단일 진실 소스입니다. `.claude/harness/harness-check.mjs`가 저장소의 스택 지문(워크스페이스별)과 문서 참조를 검사하며, 스택·구조가 바뀌면 훅이 드리프트를 알려 하네스를 같은 작업에서 갱신하게 합니다.

```bash
node .claude/harness/harness-check.mjs            # 하네스 정합성 리포트
node .claude/harness/harness-check.mjs --selftest # 검사기 자기 검증
```
