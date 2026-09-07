# commit

변경 사항을 검토하고 커밋한다. `wannasong-conventions`의 커밋 규칙을 따른다.

## 작업 순서

### 1단계: 변경 파일 확인

`git status`와 `git diff`로 변경 내용을 확인한다. 브랜치를 확인한다(`main` 직접 커밋은 사용자가 그렇게 일하는 저장소이므로 허용하되, 협업자 커밋이 앞서 있으면 먼저 알린다).
staging된 파일이 없으면 변경 파일 목록을 보여주고 staging할 파일을 확인받는다.
**일괄 커밋("전부 커밋해줘") 요청 시에는 변경 파일을 출처 구분(이번 세션에서 내가 작성 vs 세션 전부터 있던 워킹트리 변경)해 먼저 보여주고, 커밋 요약에도 그 구분을 표기한다** — 출처가 불분명한 변경을 내 작업처럼 보고하면 오해를 만든다(afin 실사고). 협업자가 있는 저장소라 특히 중요하다.

### 2단계: 하네스 정합 게이트

```bash
node .claude/harness/harness-check.mjs --strict; echo "exit=$?"
```

- exit 0이 아니면 커밋 전에 `wannasong-harness-sync` 절차로 하네스를 맞춘다. "나중에 고치자"고 넘기지 않는다.
- 하네스 변경은 기능 커밋과 분리해 `chore(harness):` 커밋으로.

### 3단계: 스킬 루프 점검

`wannasong-skill-curator`를 호출해 Inspect → Develop → Curate를 돈다.
- No-op 가드: `.claude/`·도메인 규칙 변경도, 미반영 교훈도 없으면 "변경 없음" 한 줄로 건너뛴다.
- 큐레이터가 만든 변경은 `chore(skills):` 별도 커밋.

### 4단계: 커밋 전 검증

1. 포함되면 안 되는 파일이 staging되지 않았는가 — `.env.local`, `.omc/`, `.next/`, `.pnpm-store/`, 키/토큰, `node_modules`.
2. 각 커밋이 단일 목적을 가지는가. 기능 / 하네스 / 스킬 큐레이션은 서로 다른 커밋.
3. 주석 처리된 죽은 코드가 없는가.
4. 계약(`packages/contract`)을 바꿨다면 `wannasong-contract`의 여섯 곳(코드·contract README·백엔드 스펙·웹 호출부·테스트·스킬)이 같은 커밋에 있고, 본문에 "contract: …" 절이 있는가.
5. 라우트를 추가·삭제했다면 `README.md` API 표와 `wannasong-architecture` 파일 표가 같은 커밋에 있는가.
6. 사용자에게 보이는 변화가 있으면 `apps/web/package.json`의 version을 올렸는가(배포 커밋일 때).

### 5단계: 커밋 타입·scope

| 타입 | 사용 시점 |
|------|-----------|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `refactor` | 기능 변경 없는 구조 개선 |
| `style` | 의미 없는 포맷 수정 |
| `docs` | README·계약 문서 등 |
| `build` | 의존성·배포 설정(`vercel.json`·tsconfig) |
| `chore` | 기타. 하네스는 `chore(harness):`, 스킬 큐레이션은 `chore(skills):` |
| `ci` | CI 설정 |
| `test` | 테스트(사용자 요청 시) |
| `WIP` | 임시 커밋 |

scope(선택): web · contract · kv · api · test · data · harness · skills · deps.

### 6단계: 커밋 메시지

```
type(scope): 변경 내용 한국어로 간결하게
```

본문이 필요하면 빈 줄 뒤에 항목별로. Co-Authored-By 트레일러는 도구 기본값을 따른다.

### 7단계: 사용자 확인 후 실행

```bash
git add {파일들}        # 개별 지정
git commit -m "..."
```

## 금지

- `git add -A` / `git add .` — 파일을 개별 지정한다.
- `--no-verify`.
- 계약·하네스·기능 변경을 한 커밋에 섞는 것.
