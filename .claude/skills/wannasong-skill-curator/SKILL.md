---
name: wannasong-skill-curator
description: WannaSong 하네스의 스킬을 스스로 점검·디벨롭·정리하는 자기개선 루프. 트리거 — (1) `/commit` 실행 중 "스킬 루프 점검" 단계, (2) `/skill-audit` 명시 호출, (3) 사용자가 "스킬 점검/정리/디벨롭/큐레이션/스킬화" 라고 말하는 경우. 이번 세션의 교정(`tasks/lessons.md` + 자동메모리)과 코드 변경(git diff)을 입력으로, 기존 스킬을 점검하고 미반영 교훈을 스킬 패치로 변환하며 레지스트리를 정리한다. 사소한 작업(질문, 1~2줄 수정, 타이포)에는 트리거하지 않는다.
---

# wannasong-skill-curator — 자기개선 스킬 루프

`.claude/skills/` 스킬 체계를 정적 수동 관리에서 **자기개선 루프**로 운용한다.
원칙(Hermes Agent 차용): 스킬은 로컬 Markdown, 자동 생성물은 **검토 필요한 초안**이지 신뢰된 자동화가 아니다.

이 스킬은 **루프 로직의 단일 진실 소스**다. `/commit`·`/skill-audit`는 호출부일 뿐, 절차는 여기에만 둔다.
이 저장소는 협업자가 있는 공개 저장소지만 하네스 전체를 git으로 추적한다(afin에서는 큐레이터를 로컬 전용으로 뺐다). 협업자가 원치 않으면 `.git/info/exclude`로 이 스킬과 `/skill-audit`만 로컬로 돌릴 수 있다 — 그 결정은 `wannasong-conventions`에 적는다.

---

## 핵심 원칙 (반드시 준수)

1. **학습 소스는 read-only**: `tasks/lessons.md`와 자동메모리(`~/.claude/projects/.../memory/`)는 **입력**이다. 큐레이터는 절대 쓰지 않는다. 출력은 오직 `.claude/skills/**`, `.claude/commands/**`, `CLAUDE.md`, 그리고 리포트.
2. **초안 원칙**: 신규 스킬 생성과 삭제(prune)는 항상 초안/제안이며 사용자 확인을 거친다.
3. **No-op 우선**: 스킬 관련 변경(git diff에 `.claude/`·도메인 규칙 변화 없음)도, 미반영 교훈도 없으면 "변경 없음" 한 줄 후 즉시 종료. 커밋 흐름을 느리게 하지 않는다.
4. **불확실하면 멈춘다**: 위험도가 모호하면 LOW로 보지 말고 HIGH로 강등해 확인받는다.
5. **기계 검사는 검사기에 맡긴다**: 스택 드리프트·stale 참조·레지스트리는 `harness-check.mjs`가 판정한다. 큐레이터는 그 출력을 읽고, 검사기가 볼 수 없는 것(description 품질, 교훈↔스킬 연결, 세션 패턴, 산문 속 스택 유출)에 집중한다.

---

## Phase 1 — Inspect (점검) · 항상 자동 · 읽기 전용

```bash
node .claude/harness/harness-check.mjs --json
```

1. **스택 드리프트 / stale 참조 / 레지스트리** — 검사기 결과를 그대로 인용한다. 드리프트가 있으면 이 루프를 잠시 멈추고 `wannasong-harness-sync`를 먼저 끝낸다(스택이 어긋난 상태에서 스킬을 다듬는 건 순서가 틀리다).
2. **description 품질** — 스킬 간 트리거 중첩(특히 architecture ↔ contract 경계), 트리거 조건 누락, 형식 불균일(번호형 트리거를 표준으로).
3. **lessons ↔ skill 연결** — `tasks/lessons.md` 각 항목의 "자기 규칙"이 가리키는 스킬 본문에 그 규칙이 실제로 들어 있는가(Phase 2 감지 기준 재사용).
4. **스택 의존 문장** — `wannasong-stack` 밖의 문서에 스택 이름·명령이 산문으로 박혀 있지 않은가(`grep -rn`으로 next/vercel/npm/socket.io/upstash 등 현재 스택 키워드를 `.claude/skills`에서 찍어 본다). 있으면 `wannasong-stack` 참조로 바꾸는 LOW 패치 후보. 단, `wannasong-contract`의 "Socket.IO v4 호환"처럼 계약 자체인 문장은 예외.
5. **검사기 커버리지** — 이번 세션에 검사기가 놓친 드리프트(사람이 발견한 stale 참조·잡히지 않은 스택 변화)가 있었으면 `--selftest` 케이스 추가 후보로 리포트.

**산출**: 발견 항목을 위험도(LOW/HIGH) 태그와 함께 리포트. **이 단계는 파일을 수정하지 않는다.**

---

## Phase 2 — Develop (디벨롭) · 입력 기반 초안 생성

### 학습 입력 (둘 다)
- **명시적 교정**: `tasks/lessons.md` + 자동메모리 `feedback_*`/`project_*` 중 **아직 스킬에 미반영된** 항목.
- **암묵적 세션 패턴**: 이번 세션의 `git diff`와 대화에서 반복된 멀티스텝 절차, 같은 질문을 두 번 이상 조사한 사실.

### 미반영 교훈 감지 (내용 기반)
- **1차 신호 = 내용 존재 검사**: 교훈의 자기 규칙이 가리키는 스킬 본문에 그 규칙이 실제로 들어 있는가? 없으면 **미반영 후보**.
- **2차(보조) = 날짜 pre-filter**: `.omc/state/skill-curator.json`의 `last_processed_lesson`보다 새 항목만 우선 스캔. 날짜는 수기라 **단독 판정 금지**, 범위 축소용.
- **스킬감 판정**: 프로젝트 고유·재발 가능·절차/계약이면 스킬. 지시 해석·태도 같은 일반 교훈은 자동메모리가 제자리 → `evaluated_not_applied`에 이유와 함께 기록.

### 출력
- 미반영 교훈 → 매칭되는 스킬의 **패치 초안**(어느 스킬, 어느 절, 무슨 규칙 추가, 왜).
- 반복 세션 패턴 → **신규 스킬 후보 리포트** 또는 초안. 반복 실행 절차면 `.claude/commands/` 초안이 더 맞다.

### 세션 패턴 입력의 한계 (명시)
세션 패턴은 **활성 세션(in-session) 실행에서만** 감지 가능하다. 훅이 새 Claude를 기동하는 detached 경로에서는 명시적 교정(lessons/메모리)만 입력으로 쓰고, 그 한계를 리포트에 적는다.

---

## Phase 3 — Curate (정리) · Tiered Autonomy

| 위험 | 예시 | 동작 |
|------|------|------|
| **LOW** | stale 경로·심볼 수정, `CLAUDE.md` 표에 누락 스킬 **추가**, 트리거 오타/포맷 정규화, 스택 산문 → `wannasong-stack` 참조 치환, 기존 절에 규칙 **추가**, `--selftest` 케이스 추가 | **자동 적용** |
| **HIGH** | 신규 스킬/커맨드 파일 생성, 스킬 prune/삭제, description **트리거 의미** 변경, 본문 규칙 삭제·완화, 표의 **의미적 재구성**(행 삭제·역할 변경), 검사기 판정 로직 변경 | **diff 제시 → 확인 후 적용** |
| **불확실** | 위험도 판단 모호 | **HIGH로 강등** |

- LOW 변경: `.claude/**`·`CLAUDE.md`는 direct-write 허용 영역이므로 게이트 없이 적용.
- HIGH 변경: 변경 diff를 보여주고 `AskUserQuestion`으로 1회 확인. 거부하면 `evaluated_not_applied`에 남긴다.
- 적용 후 `node .claude/harness/harness-check.mjs --strict`로 새 stale 참조를 만들지 않았는지 확인한다(패치가 존재하지 않는 경로를 백틱으로 인용했을 때 걸린다). 검사기를 건드렸으면 `--selftest`.

---

## 상태 추적

`.omc/state/skill-curator.json` (gitignore 대상, 로컬 상태):
```json
{ "last_processed_lesson": "<date>", "last_audit_at": "<ISO8601>", "applied": [], "evaluated_not_applied": [], "pending_candidates": [] }
```
- `applied` 항목은 "교훈키-날짜 (어느 스킬 어느 절에 무엇을 넣었나)" 한 줄로 남겨 재처리를 막는다.
- `pending_candidates`는 신규 스킬 후보(HIGH)로, 다음 `/skill-audit`에서 사용자 확인을 받는다.

---

## 기존 워크플로우와의 관계

- **`tasks/lessons.md` / 자동메모리**: 입력(read-only). 대체하지 않고 소비한다.
- **`wannasong-harness-sync`**: 스택·구조·계약 드리프트 전담. 큐레이터 Phase 1에서 드리프트가 보이면 그쪽을 먼저 끝낸다.
- **커밋 단위 분리**: 큐레이터가 만든 스킬/문서 변경은 feature 커밋과 분리해 `chore(skills):` 별도 커밋.

## 발전 로드맵 (점진 도입)

1. Stop/SessionEnd 훅에서 "스킬화 후보"만 `.omc/state/skill-curator-queue.json`에 **적용 없이 큐잉** → 다음 `/commit`·`/skill-audit`가 in-session에서 검토.
2. 사용빈도 기반 prune — 스킬 적중률을 추적해 저활용 스킬을 prune 후보화.
3. lessons ↔ 자동메모리 ↔ 스킬 3자 정합성 정기 린트.
