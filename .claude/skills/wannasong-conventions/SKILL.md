---
name: wannasong-conventions
description: WannaSong 코드·문서·커밋 컨벤션 — TypeScript/React(Client Component·훅) 스타일, 워크스페이스별 파일 배치, 주석·UI 문구·에러 메시지 언어 규칙, 설정은 환경변수만, 계약 코드 사용 규칙, 커밋 메시지 형식(type(scope): 한국어 요약)과 scope 목록, 커밋 단위 분리, 버전 표기, 테스트 정책(요청 시에만·프레임워크 없는 스크립트). 코드 작성·리뷰·커밋 시 참조. 스택 사실은 wannasong-stack, 구조는 wannasong-architecture, 계약은 wannasong-contract 를 본다.
---

# WannaSong Conventions

## 서비스 컨셉 (판단 기준)

사무실·워크샵에서 **한 대의 스피커 PC**가 YouTube를 순서대로 틀고, 누구나 폰으로 신청한다. 로그인·유료 계정 없음. 설계 우선순위: **끊기지 않는 재생 > 공정한 신청 > 운영 단순함 > 기능 추가**. 새 기능이 이 순서를 거스르면(예: 재생 안정성을 해치는 UI, 서버리스에 상태를 두는 설계) 제안 단계에서 멈춘다.

## 파일 배치

- 웹 코드는 `apps/web` 안에서 `wannasong-architecture` §분리 기준(lib/components/hooks/app·api)을 따른다. 저장소 루트에 앱 코드를 두지 않는다.
- 웹과 Java가 **둘 다** 알아야 하는 것(이벤트명·KV 키·에러 코드·타입·상한)은 `packages/contract`에만 둔다. 웹 코드에 문자열 리터럴로 이벤트명·KV 키를 다시 쓰지 않는다 — 소켓 emit도 가능하면 `CLIENT_EVENTS` 상수를 쓴다(기존 `useSocket`의 리터럴은 마주칠 때 상수로 바꾼다).
- 테스트 스크립트는 루트 `test/`. 데이터는 `data/`. 계획·교훈·todo는 `tasks/`. **상대 저장소(백엔드 구현자)에 건네는 핸드오프 스펙은 `docs/`**(예: `docs/backend-onprem-handoff.md`). 스펙이 코드 사실을 인용하면 백틱 경로로 — 검사기가 외부 문서의 저장소 내부 경로를 실재 검사한다.
- 런타임 산출물(`.next/`, `.env.local`, `.omc/`)은 커밋하지 않는다. 프레임워크가 재생성하는 `apps/web/AGENTS.md`는 그대로 둔다(지우면 dev 서버가 다시 만든다).

## 코드 스타일

- TypeScript strict. `any` 대신 계약 타입(`PublicState`·`QueueItem`·`AckResponse` 등)을 import. 타입만 필요하면 `import type`.
- 화면 로직은 Client Component(`'use client'`)와 훅으로. Server Component는 레이아웃·정적 껍데기에만. 데이터 fetch는 브라우저에서 REST/소켓으로 한다(SSR로 KV를 읽어 캐시에 얹지 않는다 — 상태는 실시간이다).
- 설정은 **환경변수만**. 숫자 상한·키를 코드에 박지 않는다. 웹 쪽 상한은 계약 상수, 서버 쪽은 Java env. 새 설정 = `.env.example` + README + `wannasong-stack` 표 한 쌍.
- 실패는 계약 코드로: Route Handler는 `apiError('CODE')`, 소켓 ack는 `errMsg()` 문구를 그대로 토스트. 예외 메시지를 사용자에게 흘리지 않는다.
- 작은 화살표 함수와 `?.`/`??`, 한 줄 가드를 선호. 주석은 **왜/설계 의도**를 한국어로. 죽은 코드를 주석으로 남기지 않는다.
- 클라이언트 저장 키는 `jb.` 접두어(원본 호환). 서버 로그(Route Handler)는 `[태그] 메시지`.
- 프레임워크 API는 설치된 버전의 문서를 우선한다(`apps/web/CLAUDE.md` 안내). 학습 데이터의 옛 시그니처를 그대로 쓰지 않는다.

## 언어

- 응답·주석·커밋·UI 문구·에러 메시지·README: **한국어**. 식별자·로그 태그·env 키: 영어.
- 사용자에게 보이는 문구는 "무엇을 하면 되는지"까지 쓴다(예: 검색 한도 소진 → "잠시 후 다시 시도해 주세요"). 기능이 빠지면 그 기능을 안내하던 문구도 같은 커밋에서 지운다(링크 탭 제거 때 NO_API_KEY·QUOTA_EXCEEDED 문구를 함께 바꾼 사례).

## 커밋

형식: `type(scope): 한국어 요약` — 이 저장소의 기존 관례(`fix(kv): …`). scope는 선택이며 워크스페이스·영역 이름을 쓴다: web · contract · kv · api · test · data · harness · skills · deps.
타입: feat · fix · refactor · style · docs · build · chore · ci · test · WIP.

- 하네스 변경은 `chore(harness):`, 스킬 큐레이션은 `chore(skills):`로 기능 커밋과 분리한다.
- 계약 변경 커밋은 본문에 "contract: 무엇이 바뀌었고 Java 측 할 일" 한 절을 넣는다(`wannasong-contract` 하드 규칙).
- 단일 목적 커밋. `git add -A`/`git add .` 금지 — 파일을 개별 지정한다.
- `.env.local`·`.omc/`·`.pnpm-store/`·키·토큰은 절대 포함하지 않는다.
- Co-Authored-By 트레일러는 도구 기본값(포함)을 따른다. 저장소 정책이 바뀌면 여기만 고친다.
- 절차는 `/commit` 커맨드.

## 버전

`apps/web/package.json`의 `version`이 `/api/info`로 노출된다. 사용자에게 보이는 변화가 있는 배포 전에는 올린다. 루트 `package.json` 버전은 모노레포 표식일 뿐 노출되지 않는다.

## 테스트 정책

- 테스트는 **사용자가 명시 요청할 때만** 작성한다. 기능 구현 시 선제 작성 금지.
- 기존 테스트는 프레임워크 없는 스크립트 두 개(`test/api.test.mjs`·`test/security.test.mjs`)로, 살아 있는 서버에 붙어 PASS/FAIL을 나열한다. 계약이 바뀌면(링크 제거처럼) 테스트 시나리오를 같은 커밋에서 맞추는 것은 "테스트 작성"이 아니라 계약 동시 갱신이다. 새 테스트를 요청받으면 같은 방식을 따르되 파일 상단 주석에 기동 조건을 적는다. 테스트 프레임워크 도입은 스택 변경(`wannasong-stack` 프로토콜).
- 검증은 테스트가 아니라 **런타임 동작 확인**이 기본 → `/verify-runtime`.
