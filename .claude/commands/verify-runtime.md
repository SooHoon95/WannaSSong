# verify-runtime

웹을 실제로 띄워 런타임 동작을 확인한다. `CLAUDE.md` §4의 "검증"은 이 절차(또는 동등한 실제 요청·관찰)를 뜻한다. 빌드 통과·dev 서버 기동 로그만 보고 "검증 완료"라 하지 않는다.
실행 명령·env는 `wannasong-stack`이 단일 진실 소스다. 스택·워크스페이스가 바뀌면 이 문서의 명령을 그 스킬에 맞춘다.

검증은 **전용 포트 3100**에서 한다. 이 개발 기계에는 구 WannaSong(Express) 서버가 3000에 떠 있을 수 있고, 그 서버도 `/api/health`·`/api/info`·`/player`에 그럴듯하게 응답해 Next 검증을 통과한 것처럼 보인다(2026-09-07 실사고: `X-Powered-By: Express`·version 0.3.0 응답을 Next 결과로 읽을 뻔함). 기동 전 포트 점유를 확인하고, 응답 주체를 로그로 확인한다.

pnpm이 PATH에 없으면: 루트 스크립트(`pnpm dev` 등)는 내부에서 bare pnpm을 다시 부르므로 `corepack pnpm dev`로는 실패한다. `corepack enable`로 shim을 만들거나, 아래처럼 워크스페이스 스크립트를 직접 부른다(`corepack pnpm --filter web dev`는 중첩이 없어 동작).

## 1. dev 서버 기동

```bash
lsof -nP -iTCP:3100 -sTCP:LISTEN && echo "3100 점유 — 다른 포트로" || true
[ -d node_modules ] || pnpm install
[ -f apps/web/.env.local ] || cp apps/web/.env.example apps/web/.env.local
PORT=3100 pnpm --filter web dev > /tmp/wannasong-verify.log 2>&1 &
echo $! > /tmp/wannasong-verify.pid
for i in $(seq 1 60); do curl -sf http://localhost:3100/api/health >/dev/null && break; sleep 1; done
grep -q "next.js" /tmp/wannasong-verify.log && echo "응답 주체: Next.js" || echo "주체 불명 — 로그 확인"
```

- 60초 안에 헬스가 안 뜨면 `/tmp/wannasong-verify.log`를 읽고 원인을 고친다. 첫 기동은 컴파일 때문에 느리다.
- `.env.local`이 비어 있어도 REST 5종은 뜬다(KV 미설정 → 빈 값, 키 없음 → NO_API_KEY). 그 상태에서의 결과는 "미설정 기준"이라고 보고에 적는다.

## 2. REST smoke

```bash
BASE=http://localhost:3100 node test/api.test.mjs; echo "exit=$?"    # pnpm 중첩을 피해 node 로 직접
```

판정 규칙
- 출력에 FAIL 줄이 하나라도 있으면 실패. 전부 통과면 ALL PASS, exit 0.
- **파이프(`| tail`, `| grep`)를 붙이면 셸 종료 코드는 마지막 명령의 것**이라 실패도 0으로 보인다. 종료 코드는 파이프 없이 받는다.
- suggest(iTunes)·ytsearch(YouTube)는 실네트워크. 오프라인이면 해당 FAIL은 환경 문제로 분류하고 그렇게 보고한다.

## 3. 바꾼 동작을 직접 친다

바꾼 라우트·컴포넌트에 맞춰 최소 한 번은 실제 요청을 보낸다. 예:

```bash
curl -s http://localhost:3100/api/info
curl -s -X POST http://localhost:3100/api/suggest -H 'Content-Type: application/json' -d '{"q":"아이유"}'
curl -s -i "http://localhost:3100/player?key=x" | grep -iE "^HTTP|^location"   # 307 → /?key=x (Express 원본은 302였다)
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/api/feedback   # SPEAKER_KEY 설정 시 401, 미설정 200
```

- 계약 문구가 바뀐 변경이면 응답 `error` 문자열이 `packages/contract/src/err-messages.ts`와 일치하는지 본다.
- 타입 오류는 `pnpm --filter web exec tsc --noEmit`로 별도 확인한다 — 이것은 "컴파일 통과"이며 검증이 아니다.

## 4. 소켓 경로 (백엔드가 있을 때만)

```bash
URL=http://localhost:3001 pnpm test; echo "exit=$?"        # 테스트용 env 로 띄운 백엔드 대상 (wannasong-contract §검증)
BASE=http://localhost:3001 pnpm test:api; echo "exit=$?"   # 백엔드가 REST를 넘겨받은 뒤에는 이 주소로
```

서버가 없으면 소켓 기능(신청·대기열·스피커·건의 작성)은 **"확인 불가 — 백엔드 부재"**로 적는다. `NEXT_PUBLIC_REALTIME_URL`이 비어 UI가 "연결 중"인 것은 현재 코드에서 정상 동작이다.

## 5. 정리

```bash
kill $(cat /tmp/wannasong-verify.pid) 2>/dev/null; sleep 1
lsof -nP -iTCP:3100 -sTCP:LISTEN -t | xargs -r kill 2>/dev/null   # pnpm 이 자식으로 띄운 next 까지
rm -f /tmp/wannasong-verify.pid
```

## 6. 보고

- 실행한 명령과 핵심 출력(PASS 수 / FAIL 항목 / 응답 본문)을 증거로 붙인다.
- 자동으로 확인할 수 없는 것 — 브라우저 렌더링·CSS, YouTube IFrame 실제 재생, 스피커 소리, QR 스캔, Wake Lock — 은 **"확인 불가 — 육안 필요"**로 적는다. 됐다고 단정하지 않는다.
