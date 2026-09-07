# new-api-route

웹 워크스페이스에 Route Handler(REST API)를 하나 추가한다. `wannasong-architecture` §Route Handler 작성 패턴을 스캐폴드하고, 함께 바뀌어야 하는 문서·테스트를 같은 커밋으로 묶는다.

## 0. 전환 게이트 (먼저)

REST는 온프레미스 백엔드로 이전 중이다(`wannasong-stack` §전환 중, `docs/backend-onprem-handoff.md` §2). 웹에 새 Route Handler를 만들기 전에 한 번 묻는다: **이 표면은 백엔드 스펙 §2에 추가해야 하는 것 아닌가?** 대답이 "백엔드"면 스펙 문서에 절을 추가하고 멈춘다. 웹에 만들어야 하는 이유(전환 전 임시 제공, UI 전용 정보 등)가 있을 때만 아래로 간다 — 그리고 그 이유를 커밋 본문에 적는다.

## 입력

- 경로(예: /api/nowplaying — 가상 예시라 백틱 없음), 메서드(GET/POST), 입력·출력 형태, 외부 호출/KV 읽기 유무, 레이트리밋 필요 여부.
- 상태를 **쓰는** API(대기열·재생·건의 저장)는 여기서 만들지 않는다 — 쓰기는 실시간 서버의 책임(`wannasong-architecture` §역할 분리). 요청이 그런 것이면 멈추고 알린다.

## 절차

1. 파일 생성: `apps/web/app/api/<name>/route.ts`. 템플릿 골격:
   - `NextRequest`/`NextResponse` import, 필요 시 `rateLimit()`·`clientIp()`·`apiError()`(`apps/web/lib/rate-limit.ts`), 계약 타입·상수(`@wannasong/contract`).
   - 입력 검증(길이·타입) → 레이트리밋 → 처리 → `NextResponse.json({ ok: true, ... })`. 실패는 `apiError('CODE', status)`.
   - 시크릿은 여기서만 읽는다. KV는 `apps/web/lib/kv.ts`에 읽기 함수를 추가해 쓰고, 미설정 시 빈 값으로 흡수.
2. 새 에러 코드가 필요하면 `packages/contract/src/err-messages.ts`에 코드+문구 한 쌍 추가 — 이것은 **계약 변경**이므로 `wannasong-contract` 다섯 곳 규칙과 확인 절차를 따른다.
3. `test/api.test.mjs`에 그 라우트의 check 한 줄 추가(사용자 요청 없이도 — 기존 smoke 스크립트의 커버리지 유지 목적이며 새 테스트 파일을 만드는 것이 아니다).
4. `README.md` API 표와 `wannasong-architecture` 파일 표에 행 추가. 백엔드가 같은 표면을 가져가야 하면 `docs/backend-onprem-handoff.md` §2에도. 새 env 키가 있으면 `apps/web/.env.example`·`wannasong-stack` env 표.
5. `/verify-runtime` 1~3단계로 실제 요청을 보내 응답을 확인한다.

## 커밋

`feat(api): <라우트> 추가` — 라우트·테스트 한 줄·문서 표를 한 커밋에. 계약 변경이 있으면 그 부분은 `wannasong-contract` 규칙대로 본문에 "contract: …" 절.
