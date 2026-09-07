---
name: wannasong-harness-sync
description: 스택·구조·계약 드리프트가 감지됐을 때 WannaSong 하네스를 새 사실에 맞게 갱신·검증·승인하는 절차. 트리거 — (1) 훅이 주입한 `[harness-check]` 컨텍스트에 스택 드리프트·stale 참조·레지스트리 항목이 있을 때, (2) `/harness-check` 결과가 0건이 아닐 때, (3) 사용자가 "스택 바꾼다/워크스페이스 추가/백엔드 붙인다/프레임워크 교체/배포 옮긴다/하네스 맞춰줘" 라고 말하는 경우, (4) 라우트·소켓 이벤트·KV 스키마 같은 구조·계약을 바꾼 직후. 결과 0건이면 트리거하지 않는다.
---

# wannasong-harness-sync — 드리프트 → 하네스 동기화

목표: **코드가 바뀌면 하네스가 같은 작업 안에서 따라간다.** 사용자에게 "하네스도 고쳐야 한다"고 알리고 끝내지 않는다(`CLAUDE.md` §7·§8).

검사기: `.claude/harness/harness-check.mjs`. 지문: `.claude/harness/stack-manifest.json`. 훅: `.claude/settings.json`.

## 0. 입력 읽기

```bash
node .claude/harness/harness-check.mjs           # 사람용 리포트
node .claude/harness/harness-check.mjs --json    # 항목별 kind/sev/key
```

항목은 세 종류다.
- `stack` — 지문 대비 변화. **HIGH**: 워크스페이스 추가/삭제, 워크스페이스 종류(node/java/…)·언어·모듈·프레임워크·배포 파일·dev/build/start/test/lint 스크립트, 루트 패키지 매니저·런타임·워크스페이스 선언·최상위 디렉터리. **LOW**: 일반 의존성·env 키·기타 스크립트.
- `ref` — 문서 백틱 토큰이 가리키는 경로·env 키·라우트·이벤트/KV 키·심볼·패키지명이 코드에 없음. 현재 패키지 매니저와 다른 매니저의 명령이 코드 펜스에 남은 것도 여기(pnpm 전환 때 14곳이 통과한 실사고). 외부 문서(`docs/`·README)는 저장소 내부 경로만 검사하며 "(외부 문서)"로 표기.
- `registry` — `CLAUDE.md` 표와 `.claude/skills`·`.claude/commands` 실물 불일치, frontmatter 결함, CLAUDE.md 15KB 초과, 훅 설정에서 검사기 호출 누락.

## 1. 변화가 의도된 것인지 판별

- `git diff --stat`과 대화 맥락으로 **누가 왜 바꿨는지** 본다. 사용자가 방금 의존성을 추가했거나 내가 마이그레이션 중이면 의도된 변화다.
- 의도되지 않은 변화(예: 락파일 두 종류 공존, `vercel.json` 삭제, 워크스페이스 선언 누락)면 **하네스가 아니라 코드를 고친다.** 그리고 멈춰서 사용자에게 알린다.
- 판단이 모호하면 HIGH 항목만 사용자에게 한 번 확인하고, LOW는 진행한다.

## 2. 갱신 순서 (의존 방향대로)

1. **`wannasong-stack`** — 워크스페이스 표·명령·배포·env를 새 사실로. "기준" 날짜를 갱신한다.
2. **`wannasong-architecture`** — 파일 역할·라우트·요청 경로·역할 분리가 바뀌었으면. 스택만 바뀌고 구조가 같으면 건너뛴다.
3. **`wannasong-contract`** — 이벤트·KV·에러 코드·env 동등성·Java 제약이 바뀌었으면. 코드(`packages/contract/src`)와 `packages/contract/README.md`가 먼저 맞아야 한다.
4. **`wannasong-conventions`** — 스택에 묶인 스타일 문장(빌드 유무·테스트 방식·scope 목록).
5. **커맨드** — `/verify-runtime`(기동·테스트 명령), `/commit`(제외 파일·게이트), `/new-api-route`(스캐폴드 템플릿). 명령이 바뀌면 커맨드가 곧 깨진다.
6. **`CLAUDE.md`** — 스킬·커맨드 표(추가/삭제만), §8 감시 대상 문구가 새 파일 종류를 못 담으면 보강. 대원칙 본문은 건드리지 않는다.
7. **검사기 자체** — 새 프레임워크가 `NODE_FRAMEWORKS`/`POLYGLOT_FRAMEWORKS`에 없거나, 새 마커가 `POLYGLOT_MARKERS`에 없거나, 새 배포 파일이 `DEPLOY_FILES`에 없거나, 감시 목록(`WATCH`)이 새 설정 파일을 모르면 `harness-check.mjs`를 고치고 **`--selftest`로 증명**한다. 런타임이 Node를 떠나면 훅 명령(`.claude/settings.json`)의 `node` 호출 유지 여부도 확인한다(검사기는 node 스크립트라 Node가 어딘가엔 있어야 한다).
8. **훅 설정** — `.claude/settings.json` permissions allow에 새 실행/테스트 명령을 추가한다.
9. **README** — 사용자 문서(`README.md`·`packages/contract/README.md`)의 실행·배포·env·API 표가 어긋나면 같이 맞춘다.

각 문서에서 고칠 문장을 찾는 법: 옛 스택 이름·명령·경로를 `grep -rn`으로 `.claude/ CLAUDE.md README.md docs/ tasks/todo.md`에서 찍는다. 검사기는 백틱 토큰과 패키지 매니저 명령만 보므로 그 외 산문 속 이름(프레임워크명·배포 서비스명)은 grep이 잡아야 한다.

## 3. 새 워크스페이스(백엔드 등)가 추가됐을 때

검사기가 "워크스페이스 추가: <경로> (kind=…)"를 HIGH로 낸다. 위 2단계에 더해:

- `wannasong-stack` 모노레포 표에 행 추가(종류·역할·배포), 실행·테스트 명령 절에 그 워크스페이스의 명령 추가, 백엔드 계획 절을 "동작 중"으로 갱신.
- `wannasong-architecture` 역할 분리 표에서 해당 책임의 "어디서"를 갱신. 실시간 서버 코드가 들어왔다면 도메인 로직(대기열·폴백·스피커 선출) 규칙은 **새 스킬 후보**다 — `wannasong-harness-ops` §스택 가변성의 "기존 스킬에 절 추가 먼저" 기준으로 판단하고, 새 스킬이면 `wannasong-skill-curator` HIGH 절차(사용자 확인).
- `wannasong-contract` "별도 저장소" 전제 수정. 상대 저장소 통보 규칙은 같은 저장소면 "같은 커밋" 규칙으로 바뀐다.
- `/verify-runtime`에 그 워크스페이스 기동·헬스·테스트 단계 추가. 필요하면 워크스페이스 전용 verify 커맨드로 분리.
- 비노드 워크스페이스면 검사기가 그 언어의 마커·프레임워크·env 파일 위치를 아는지 확인(`POLYGLOT_MARKERS`·`envKeysIn()`). 모르면 7단계.
- 워크스페이스 선언(`pnpm-workspace.yaml`, 매니저가 바뀌면 그 매니저의 선언 파일)에 넣을지(노드일 때), 루트 스크립트(dev/test)에 묶을지 결정하고 `wannasong-stack`에 적는다.

## 4. 검증 (증거를 남긴다)

```bash
node .claude/harness/harness-check.mjs --strict; echo "exit=$?"     # 0 이어야 함
node .claude/harness/harness-check.mjs --selftest                    # 검사기를 고쳤을 때만
```

- 스택이 바뀌었으면 `/verify-runtime` 절차를 새 명령으로 실제 실행해 서버가 뜨고 요청이 응답하는지 확인한다. 이것이 "하네스 갱신 검증"의 런타임 부분이다.
- 통과 못 하면 하네스를 다시 고친다. `refIgnore`는 **검사기 오탐**(가상 예시·외부 도구 이름)에만 쓰고, 실제 stale 참조를 묻는 데 쓰지 않는다.

## 5. 승인

```bash
node .claude/harness/harness-check.mjs --update   # 현재 지문을 manifest 에 기록
```

`--update`는 **하네스가 새 사실을 다 반영한 뒤에만** 실행한다. 먼저 실행하면 드리프트 신호가 사라져 하네스가 뒤처진 채 굳는다.

## 6. 보고·커밋

- 보고에 "하네스: 어떤 문서의 어떤 문장을 왜 바꿨는지 + `--strict` 0건 증거(+ 검사기 수정 시 `--selftest` ALL PASS)"를 한 절로 넣는다.
- 하네스 변경은 `chore(harness): …` 별도 커밋. 기능 커밋과 섞지 않는다(`/commit`이 분리를 안내).

## 위험도별 자율성

| 위험 | 예 | 동작 |
|------|----|------|
| LOW | 스택 표 값 갱신, env 표 행 추가, stale 경로 수정, 레지스트리 행 추가, 검사기 목록에 이름 추가 | 자동 적용 |
| HIGH | 스킬·규칙 삭제, 커맨드 절차의 의미 변경, 하드 규칙 완화, 검사기 판정 로직 변경, 훅 제거, 새 스킬 생성 | diff 제시 → 1회 확인 |
| 불확실 | 판단 모호 | HIGH로 강등 |

## 사용자가 스택 변경을 먼저 선언한 경우

코드를 만지기 전에 `wannasong-stack`에 "전환 중: 현재 → 목표" 절을 먼저 쓰고, 계획을 `tasks/todo.md`에 적는다. 전환이 끝나면 절을 지우고 표를 확정한 뒤 4·5단계를 밟는다.
