# repo-tickets — 설계 결정

sijangajang·evcaro·wanderpin(travel-map) 에서 쓰던 "저장소 안 md 파일 일감 관리"를 재사용 가능한 skill 로 뽑는다.
목적: **누가(어떤 사람·세션이) AI 를 돌려도 같은 방식으로 일감을 다루게 한다.**

## 확정 (2026-10-18)

- **형태: skill 하나.** 이름 `repo-tickets`. aiw 흡수는 지금 하지 않는다 (나중에 aiw 옵션 모듈로 옮길 수 있게만 만든다).
- **배포: GitHub 저장소** → `npx -y skills add <owner>/<repo> --skill repo-tickets --agent claude-code --copy --yes`.
  npm 배포 없음. 설치된 본체도 각 프로젝트에 **커밋한다** (작고, 클론 즉시 동작, 규칙 변경이 PR diff 로 보임).
  락파일만 커밋하는 프로젝트(evcaro)는 `.gitignore` 에 `!.claude/skills/repo-tickets/` 예외.
- **도구: 형식은 중립, 검증은 Claude Code 만.** frontmatter 는 `name`/`description` 만, 특정 도구 기능 전제 금지,
  기계적 동작은 전부 `node scripts/*.mjs` (node 내장 모듈만). 진입 블록은 CLAUDE.md·AGENTS.md 용 둘 다 README 에 제공.
- **폴더: `docs/tickets/{todo,doing,done}/`** (기존 `docs/works/` 에서 변경).
- **작업 원칙(근본 해결 기본 등)은 이 skill 에 넣지 않는다.** 항상 로드돼야 하는 규칙이라 skill 부적합 — 당분간 각 저장소 CLAUDE.md.
- 하지 않는 것: Stop hook, 다른 도구 실검증, 도구별 경로 설치(→ 나중에 aiw).

## 규칙 정본

sijangajang `docs/works/README.md` (evcaro 판보다 최신 — "쓰는 방식" 섹션·슬러그 호칭 규칙 포함) 을 기준으로 하고 아래를 추가:

- **일감 참조는 어디서든 `[[<type>-<slug>]]` 로만** (코드 주석·커밋·문서). 경로(`todo/…`)·번호(`080`) 금지.
  번호는 ID 가 아니라 우선순위(바뀌고 중복 가능)라서 참조에 쓸 수 없다.
  근거: 경로 참조(sijangajang ~25곳, evcaro 4곳) 중 다수가 이미 깨져 있음 (예: evcaro `server/src/lib/schema-guard.js:23` 이
  `todo/070_…` 를 가리키나 실제는 `done/20260930_070_…`, sijangajang `docs/analysis/00-overview.md` 의
  `../works/todo/450_…` 링크는 이미 done). 형태도 제각각 — `works/todo/120`(번호만), `works/060`,
  `works/todo/task-…md`(번호 없음), md 상대 링크.
- **슬러그는 만든 뒤 바꾸지 않는다.** 취소·보류 등 상태는 이름이 아니라 진행 로그(또는 frontmatter)에 쓴다.
  근거: sijangajang 에픽을 `140_epic-data-migration-cancelled` 로 리네임해 `[[epic-data-migration]]` 참조가 깨짐.
- **슬러그는 전역 유일** — todo·doing·done·에픽 내부 서브태스크를 통틀어 중복 금지.
- `lint` 검사 항목 (작업 트리만, git 히스토리는 보지 않음):
  - 참조 패턴은 `\[\[(bug|task|epic)-[a-z0-9-]+\]\]` 로 한정한다.
    그냥 `[[…]]` 는 Tailwind 선택자(sijangajang `command.tsx` 의 `[[cmdk-item]]` 등)를 오탐한다.
  - 존재하지 않는 슬러그 참조, 슬러그 중복.
  - 경로·번호 참조: `(works|tickets)/` 뒤에 `todo|doing|done` 이 오는 모든 형태. 번호는 중복되므로 기계 치환하지 않고
    **후보 슬러그를 제시**만 한다 (확정은 사람/AI). 폴더 자체를 가리키는 문장(`works/todo 참조`)도 검출해 갱신 대상으로 보고.
  - `--dir <path>` 로 대상 폴더 지정 — 마이그레이션 전 `docs/works` 에 읽기 전용으로 돌리기 위함.
  - doing/ 일감에 진행 로그(`---` 아래 날짜 항목)가 없으면 경고 — 기존 "세션 끊기기 전 마지막 로그 필수" 규칙의 기계 검사.
- 진입 블록(CLAUDE.md·AGENTS.md)에 참조 규칙 한 줄을 넣는다. 참조는 skill 이 로드되지 않은 때(주석·커밋 작성 중)에도
  생기므로 skill 만으로는 부족하다. lint 를 CI 에 거는 예시는 README 에 선택 사항으로 둔다.
- rules.md 첫 줄에 버전 표기(`<!-- repo-tickets vX.Y.Z -->`), `lint` 출력에 버전 포함. 설치본 로컬 수정 금지(수정은 원본 저장소 PR).

## 구성

```
skills/repo-tickets/    # skills CLI 가 찾는 표준 위치
  SKILL.md              # 언제 쓰는지 + "rules.md 를 읽고 따른다" (얇게 — aiw skillBody 패턴)
  rules.md              # 규칙 정본 (나중에 .ai-workflow/docs/ 로 그대로 이동 가능)
  template.md
  scripts/tickets.mjs   # init / new / start / log / stop / done / prio / list / lint
README.md               # 설치, CLAUDE.md·AGENTS.md 진입 블록, 기존 저장소 마이그레이션 체크리스트
```

명령은 처음 계획(6개)에 셋을 더했다: `stop`(기존 "중단 시 사유 남기고 todo 로" 규칙), `prio`(우선순위 리네임),
`list`. 취소는 이름을 바꾸지 않고 `done --cancel "<사유>"` 로 — 슬러그 불변 규칙의 근본 해결.
lint 는 `[[ ]]` 없이 맨 이름으로 쓴 참조도 경고한다 (sijangajang 코드 주석에 다수 — 예전 규칙이 문서 밖에선 맨 이름을 허용했음).
설치하면 `skills-lock.json` 도 생긴다 — 함께 커밋한다.

마이그레이션 체크리스트는 "적용해줘" 한마디만 받은 새 세션도 같은 절차를 밟도록 README 에 둔다 (아래 3단계 내용).
적용 후 저장소의 `docs/tickets/README.md` 는 skill 을 가리키는 한 줄로 바꾼다 — 남겨두면 rules.md 와 정본이 둘이 되어 어긋난다.

description 에 "Jira·Notion 등 외부 트래커가 아니라 저장소 안 docs/tickets/ md 파일" 을 명시해 오발동을 막는다.

## 진행 순서

1. **skill 작성** ✅ (2026-10-18) — 이 저장소 `git init` → skill 작성 → 임시 디렉터리에서 init~done 전체 흐름 테스트.
   **합격 기준**: 두 저장소에 `lint --dir docs/works` 읽기 전용 실행 시 위 경로 참조(sijangajang ~25곳, evcaro 4곳)와
   `[[epic-data-migration]]` 이 빠짐없이 나오고, `[[cmdk-*]]` 오탐이 없을 것.
2. **GitHub 공개** ✅ (2026-10-18, public `taeksoolee/repo-tickets`, 실제 `npx skills add` 설치 검증 완료) (push 전 확인) → 빈 임시 디렉터리에서 실제 `npx -y skills add …` 로 설치 검증.
3. **저장소별 적용 — evcaro 먼저(파일럿), 그다음 sijangajang.**
   evcaro ✅ (2026-10-18, evcaro 세션이 수행, 로컬 커밋 05c3ed0·fe4cdf9·7bffbe0·1bd7ea1, push 안 함, lint 0/0).
   파일럿 피드백 → v0.2.0: gitignore 예시 버그(`.claude/skills/` 는 예외 불가 → `.claude/skills/*`),
   CI 예시를 node24 액션(@v7)·고정 러너로, SKILL.md/rules.md 실행 경로 통일, 자연어 번호 참조("080 티켓") lint 경고,
   옛 폴더 언급이 커밋을 가리킬 수 있음·진입 블록 위치·피어 세션 요청 시 사용자 직접 확인을 절차에 추가.
   evcaro 는 v0.2.0 재설치(설치본 갱신 커밋) 필요 — sijangajang 반영 후 한 번에. evcaro 는 참조 4곳으로 작고 `.gitignore` 예외라는
   설치 특수 케이스가 있어 파일럿에 적합.
   - 사전 조건: 작업 트리 깨끗할 것 (evcaro 에 미커밋 `docs/works/todo/` 있음 — 먼저 커밋 여부 결정),
     열린 브랜치 없음 확인. 작업 브랜치: sijangajang `develop`, evcaro `master`.
   - 커밋 ① skill 설치 (evcaro 는 `.gitignore` 에 `!.claude/skills/repo-tickets/` 추가 — 현재 `.claude/skills/` 무시 중)
   - 커밋 ② 이동만: `git mv docs/works docs/tickets` + sijangajang
     `done/20260930_140_epic-data-migration-cancelled` → `done/20260930_140_epic-data-migration` 복원.
     내용 수정을 섞지 않는다 (rename 검출 유지 → 히스토리 보존).
   - 커밋 ③ 참조 교체(경로·번호 → `[[슬러그]]`, lint 후보 보고 확정), 에픽 취소 사유를 에픽 README 로그로,
     CLAUDE.md·README 의 `docs/works` 언급 → 진입 블록 교체, `docs/tickets/README.md` → skill 가리키는 한 줄, lint 통과.
4. **wanderpin (`travel-map/wanderpin`) 적용 — sijangajang 다음.** 같은 `docs/works` 체계(규칙 README 는 sijangajang 판의
   축약본이라 rules.md 가 상위 집합). 읽기 전용 lint: 오류 1(CLAUDE.md 의 예시 `[[task-slug]]` — 진입 블록 교체로 사라짐),
   경고 7(CLAUDE.md 폴더 언급 3, done 일감의 맨 이름 4). 경로 참조 0 이라 가장 쉽다.
   - 사전 조건: `feat/kakao-maps` 브랜치(main 대비 17커밋, doing 에픽 `epic-kakao-maps` 진행 중)가 **main 에 머지된 뒤** 적용.
     브랜치 진행 중에 폴더를 옮기면 그 브랜치의 일감 편집과 충돌한다.
