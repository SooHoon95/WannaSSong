# skill-audit

하네스의 스킬을 온디맨드로 전수 점검·디벨롭·정리한다. 커밋과 무관하게 언제든 호출하는 수동 진입점이다.

## 동작

`wannasong-skill-curator` 스킬을 standalone으로 호출해 Phase 1 → 2 → 3을 전부 돈다.

- **Phase 1 Inspect**: `harness-check.mjs --json`(스택 드리프트·stale 참조·레지스트리) + description 품질 + lessons ↔ skill 연결 + 스택 산문 유출 + 검사기 커버리지 점검.
- **Phase 2 Develop**: `tasks/lessons.md` + 자동메모리의 **미반영 교훈**(내용 존재 검사 기준)을 스킬 패치 초안으로. 활성 세션이면 git diff/세션 패턴도 입력.
- **Phase 3 Curate**: Tiered Autonomy(LOW 자동 / HIGH 확인 / 불확실 → HIGH)로 적용 후 `--strict` 재검사.

## 사용 시점

- 커밋 사이클과 별개로 스킬 상태를 점검하고 싶을 때.
- lessons.md에 교훈이 쌓였는데 스킬에 반영됐는지 확인하고 싶을 때.
- 스택·워크스페이스를 바꾼 뒤 `wannasong-harness-sync`까지 끝내고 나서, 다른 문서에 옛 스택 흔적이 남았는지 훑고 싶을 때.

## 참고

- 루프 로직은 `.claude/skills/wannasong-skill-curator/SKILL.md`가 단일 진실 소스다. 이 커맨드는 호출부일 뿐이다.
- 큐레이터가 만든 변경은 `chore(skills):` 별도 커밋.
