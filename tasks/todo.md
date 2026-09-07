# Todo

> 현재 진행 중인 계획. 완료된 계획은 `tasks/archive/`로 `git mv`. 마이그레이션 방향성은 `tasks/plan-nextjs-migration.md`.

## 2026-09-03 — afin-ios 하네스 구조 이식 (모노레포·스택 추적형)

- [x] 대원칙 `CLAUDE.md` (afin 7원칙 + Task Management + Core Principles 유지, §8 "스택·아키텍처 변경 → 하네스 자동 동기화"를 워크스페이스 단위로 확장)
- [x] `.claude/harness/harness-check.mjs` — 워크스페이스별·다언어 스택 지문, App Router 라우트 인식 stale 참조 검사, 레지스트리·훅 설정 검사, 도구 무관 `--hook`(감시 파일 서명), `--selftest`
- [x] `.claude/harness/stack-manifest.json` — `--update`로 생성
- [x] `.claude/settings.json` — SessionStart(`--session`) / PostToolUse Edit|Write|MultiEdit|Bash(`--hook`) 훅 + permissions
- [x] 스킬 7종: `wannasong-stack` · `wannasong-architecture` · `wannasong-contract` · `wannasong-conventions` · `wannasong-harness-ops` · `wannasong-harness-sync` · `wannasong-skill-curator`
- [x] 커맨드 5종: `/commit` `/skill-audit` `/harness-check` `/verify-runtime` `/new-api-route`
- [x] `apps/web/.env.example` 생성(README가 참조하던 누락 파일, env 키 지문의 출처) · `.gitignore`에 `.omc/`
- [x] `tasks/lessons.md` · `tasks/todo.md` · `tasks/archive/`
- [ ] 첫 실사용에서 훅 주입 문구·감시 목록 튜닝(노이즈가 있으면 `refIgnore`·`WATCH` 조정)
- [ ] API 백엔드 워크스페이스 결정(별도 저장소 유지 vs 이 저장소에 편입) → 결정 시 `wannasong-stack` 백엔드 절 갱신 + `wannasong-harness-sync` §새 워크스페이스
- [ ] 하네스 커밋 (`chore(harness):`) — 사용자 확인 후

## 2026-09-07 — pull(369a13b) 반영 자가 점검: pnpm 전환 · 링크 신청 제거 · 온프레미스 백엔드 스펙

검사기 리포트: 스택 드리프트 HIGH 7건(packageManager npm→pnpm, rootScripts 4종, workspacesDeclared 소실, dirs +docs), stale 참조 3건. 검사기가 못 본 것: 코드 펜스 속 `npm run …` 산문 14곳, `docs/backend-onprem-handoff.md`가 선언한 역할 분리 변경(REST를 백엔드로 이전), stash pop 에서 유실된 `.gitignore`의 `.omc/`.

### A. 검사기 보강 (`wannasong-harness-sync` 7단계)
- [x] `pnpm-workspace.yaml`의 packages 를 `workspacesDeclared`로 인식 (현재는 package.json workspaces만 봐서 "소실"로 오판)
- [x] `package.json`의 `packageManager` 핀(corepack) 지문 추가
- [x] 패키지 매니저 명령 불일치 검사 — 하네스 문서·외부 문서의 코드 펜스에서 현재 매니저와 다른 `npm run`/`npx`/`yarn`/`bun` 명령을 LOW로 플래그
- [x] 외부 문서 참조 검사(opt-in `refDocs`) — `docs/**`·`README.md`·`packages/contract/README.md`의 백틱 경로·심볼도 실재 검사 (스펙 문서가 "이전 후 삭제 예정"인 웹 파일을 가리키므로)
- [x] `.omc/` 경로 토큰은 로컬 상태로 항상 통과
- [x] `--selftest`에 위 3종 케이스 추가 → ALL PASS
### B. 하네스 문서 동기화 (갱신 순서대로)
- [x] `wannasong-stack` — pnpm·corepack 핀·명령 블록·`pnpm-workspace.yaml`·`docs/` 행·"전환 중: Vercel+KV 분리형 → 온프레미스 단일 백엔드" 절·백엔드 언어 미정 표기·`apps/web/package-lock.json` 제거 반영
- [x] `wannasong-architecture` — 역할 분리 표를 "현재 코드 / 전환 목표" 두 열로, 링크 탭 제거(request kind url 삭제), `parseVideoId()`·`oembed()`가 웹에서 미사용(백엔드 이식 대기) 표기, `NEXT_PUBLIC_REALTIME_URL` 비움=same-origin 은 스펙만 있고 코드 미구현임을 명시
- [x] `wannasong-contract` — request kind는 itunes·video 두 종(url 제외), 백엔드 스펙 문서를 두 번째 가이드로 등록, "KV"=Redis 키 표기, 문구 변경은 코드가 SSOT 이므로 규칙만 확인
- [x] `wannasong-conventions` — stale UI 문구 예시("링크 붙여넣기는 계속 됩니다") 교체, `docs/` 배치 규칙(핸드오프 스펙) 추가, pnpm 표기
- [x] 커맨드 `/verify-runtime`·`/new-api-route`·`/commit` — pnpm 명령, new-api-route 에 "REST는 백엔드로 이전 중 — 웹에 새 라우트를 만들 이유를 먼저 확인" 게이트
- [x] `CLAUDE.md` — 프로젝트 설명 한 줄(실시간 서버 → 백엔드)·§8 감시 목록에 `pnpm-workspace.yaml`
- [x] `.claude/settings.json` permissions 에 pnpm·corepack
- [x] `.gitignore`에 `.omc/` 복구
### C. 검증
- [x] `--strict` 0건 · `--selftest` ALL PASS
- [x] 런타임: corepack 으로 pnpm 확보 → `pnpm install` → `/verify-runtime` 1~3단계 실제 실행 (REST 5종)
- [x] `--update` 승인 후 훅 무출력 확인
### D. 사용자 결정 필요 (내가 정하지 않음)
- [ ] README·`tasks/plan-nextjs-migration.md`(Vercel+KV+Java) vs `docs/backend-onprem-handoff.md`(온프레미스·언어 미정) 방향 충돌 — 어느 쪽이 확정인지
- [ ] stash@{0}(하네스 초안)이 남아 있음 — 적용분과 동일하면 drop

### 리뷰 (2026-09-07 검증 증거)
- `--strict` exit 0 · `--selftest` ALL PASS 14케이스(기존 11 + pnpm-workspace 삭제 / 패키지 매니저 명령 불일치 / 외부 문서 내부 경로).
- 런타임(Next.js, 포트 3100, `.env.local`=example 그대로): `test/api.test.mjs` 5/5 PASS(health·info·suggest 8건·feedback 200·ytsearch NO_API_KEY). ytsearch 오류 문구가 `packages/contract/src/err-messages.ts` 24행과 바이트 일치. `/player?key=x` → 307 `/?key=x`. `/`·`/feedback` 200. 서버 로그에 `(next.js: …)` 표기로 응답 주체 확인.
- **무효 처리한 1차 검증**: 3000 포트 응답은 이 기계에 떠 있는 구 WannaSong Express 서버(PID 32274, version 0.3.0)였다. `X-Powered-By: Express`로 발견. `/verify-runtime`을 전용 포트 3100 + 주체 확인으로 고쳤다.
- corepack: `corepack pnpm dev`는 루트 스크립트의 중첩 pnpm 호출로 실패 → `corepack pnpm --filter web dev`로 우회. `corepack enable`은 사용자 환경 변경이라 실행하지 않고 스킬에 권장으로 적었다.
- 확인 불가 — 육안 필요: 브라우저 렌더·링크 탭 제거 후 UI 문구, YouTube 재생. 소켓 경로는 백엔드 부재.
- 코드/스펙 불일치 발견(수정 안 함, 기능 코드): `apps/web/hooks/useSocket.ts`는 `NEXT_PUBLIC_REALTIME_URL`이 비면 미연결이지만 `docs/backend-onprem-handoff.md` §1은 "비면 same-origin". 전환 작업 때 고칠 지점으로 `wannasong-architecture`에 표기.

### 리뷰 (2026-09-03 검증 증거)
- `--strict` exit 0 (스택 지문 일치 · stale 참조 0 · 레지스트리 정합).
- `--selftest` ALL PASS 11케이스: 기준선 0건 / 워크스페이스 추가(gradle+spring → java-gradle HIGH) / 프레임워크 추가(hono HIGH) / 언어 변경(HIGH) / env 키 추가(LOW) / 배포 파일 추가(HIGH) / stale 참조 5종(경로·env·심볼·라우트·이벤트) / 실존 App Router 라우트 통과 / 레지스트리 누락·name 불일치 / 훅 설정 제거(HIGH) / 훅 무출력·주입·반복 억제.
- 훅 실주입 확인: 이 세션에서 Bash 편집 후 PostToolUse 훅이 `[harness-check] N건`을 additionalContext 로 주입했고(감시 파일 서명 방식), 정합 후에는 무출력·상태 파일 `hash:null`.
- 검사기 자체 수정 이력(작성 중 오탐 보정): 확장자만 쓴 토큰(`.mjs`), 점 표기 심볼(`NextResponse.json`), 자리표시자(`<name>`), `.git/` 경로, 모듈 지정자(import 문자열), gitignore 부정 패턴(`!`), 유령 항목 중복 제거, 자기검증 픽스처를 코퍼스에서 분리(`selftest-fixtures.json`).
- 확인 불가 — 육안 필요: 새 세션 시작 시 SessionStart 훅 출력이 컨텍스트에 실리는지(로컬 `--session` 실행으로만 확인). `npm install` 미실행 상태라 `/verify-runtime` 은 이번에 돌리지 않음(하네스는 node_modules 없이 동작).
