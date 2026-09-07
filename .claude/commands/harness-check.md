# harness-check

하네스 정합성을 검사하고, 결과가 있으면 그 자리에서 동기화까지 진행한다. 검사기 자체를 고쳤으면 자기 검증도 돈다.

## 실행

```bash
node .claude/harness/harness-check.mjs            # 리포트
node .claude/harness/harness-check.mjs --json     # 항목별
node .claude/harness/harness-check.mjs --selftest # 검사기 자기 검증 (결함 주입 → 감지 확인)
```

## 결과 해석

- **0건** → "하네스 정합 OK" 한 줄로 끝.
- **스택 드리프트** → `wannasong-harness-sync` 절차(판별 → 갱신 순서 → `--strict` 검증 → `--update` 승인). "워크스페이스 추가"면 §새 워크스페이스 절차. 검사 결과를 보고만 하고 끝내지 않는다.
- **stale 참조** → 문서가 가리키는 경로·심볼·라우트·이벤트·env 키가 코드에 없다. 코드가 바뀐 것이면 문서를, 문서 오타면 문서를, 검사기 오탐(가상 예시·외부 도구 이름)이면 `stack-manifest.json`의 `refIgnore`에 토큰을 추가한다. 오탐이 아닌 것을 `refIgnore`로 묻지 않는다.
- **레지스트리** → `CLAUDE.md` 표에 스킬/커맨드 행 추가, frontmatter 보정, 훅 설정 복구. 행 삭제·역할 변경은 사용자 확인.

## 언제 쓰나

- 훅 주입 `[harness-check]`를 봤을 때 전체 맥락을 다시 보고 싶을 때(훅은 같은 결과를 반복 주입하지 않는다).
- 스택·워크스페이스 변경 작업을 시작하기 전(기준선 확인)과 끝낸 뒤.
- `harness-check.mjs`의 목록·판정을 고친 뒤 → `--selftest` ALL PASS를 증거로.
- `/commit` 2단계는 이 커맨드의 `--strict` 버전이다.

## 모드 요약

| 플래그 | 용도 |
|--------|------|
| (없음) | 사람용 리포트, exit 0 |
| `--strict` | 결과 있으면 exit 1 (게이트) |
| `--json` | 기계 판독 |
| `--session` | SessionStart 훅. 압축 출력 + 최근 lessons 제목 + 열린 todo 수 |
| `--hook` | PostToolUse 훅(도구 무관). 감시 파일 서명이 바뀌었을 때만 검사 → additionalContext 주입, 동일 결과 반복 억제 |
| `--update` | 현재 지문을 manifest에 기록(하네스 갱신 완료 후 승인) |
| `--selftest` | 임시 복사본에 결함(워크스페이스 추가·프레임워크·언어·env·배포·stale 참조 5종·레지스트리·훅 제거·훅 억제)을 주입해 감지 확인 |
