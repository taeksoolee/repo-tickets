# repo-tickets

저장소 안 `docs/tickets/{todo,doing,done}/` md 파일로 일감을 관리하는 agent skill.
누가(어떤 사람·세션이) AI 를 돌려도 같은 방식으로 일감을 다루게 하는 것이 목적이다.

- 규칙 정본: [`skills/repo-tickets/rules.md`](skills/repo-tickets/rules.md)
- 스크립트: `skills/repo-tickets/scripts/tickets.mjs` — node 18+ 내장 모듈만 사용
- 검증된 도구: Claude Code. 형식은 도구 중립(SKILL.md frontmatter 는 `name`/`description` 만)이라
  다른 도구에서도 읽히지만 실검증은 하지 않았다.

## 설치

```sh
npx -y skills add <owner>/repo-tickets --skill repo-tickets --agent claude-code --copy --yes
```

`.claude/skills/repo-tickets/` 에 복사된다. **설치본은 저장소에 커밋한다** — 작고, 클론 즉시 동작하고,
규칙 변경이 PR diff 로 보인다. `.claude/skills/` 를 gitignore 하는 저장소는 예외를 추가한다:

```gitignore
.claude/skills/
!.claude/skills/repo-tickets/
```

**설치본은 고치지 않는다.** 규칙을 바꾸려면 이 저장소에 PR 을 보내고 다시 설치(업데이트)한다 —
재설치하면 로컬 수정은 덮어써진다. 설치된 버전은 `rules.md` 첫 줄과 `lint` 출력에 나온다.

처음 쓰는 저장소라면:

```sh
node .claude/skills/repo-tickets/scripts/tickets.mjs init
```

## 진입 블록

일감 참조는 skill 이 로드되지 않은 때(코드 주석·커밋 메시지 작성 중)에도 생기므로, 아래 블록을
항상 로드되는 문서에 넣는다. Claude Code 는 `CLAUDE.md`, 그 밖의 도구는 `AGENTS.md`.

```markdown
## 일감 관리 (repo-tickets)

- 일감은 `docs/tickets/{todo,doing,done}/` 의 md 파일이다. 만들기·착수·로그·완료·검사는
  repo-tickets skill(`.claude/skills/repo-tickets/rules.md`)을 따르고 스크립트로 한다.
- **일감은 어디서든 `[[<type>-<slug>]]` 로만 부른다** — 문서·코드 주석·커밋 메시지·대화 전부.
  경로(`docs/tickets/todo/…`)나 앞 번호(우선순위라서 바뀌고 중복된다)로 부르지 않는다.
- 작업 중 발견한 잠재 버그·후속 작업은 대화로만 보고하지 말고 일감으로 남긴다.
- 일감이나 참조를 건드렸으면 끝내기 전에 `node .claude/skills/repo-tickets/scripts/tickets.mjs lint`.
```

## CI (선택)

```yaml
# .github/workflows/tickets.yml
name: tickets
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: node .claude/skills/repo-tickets/scripts/tickets.mjs lint
```

## 기존 저장소 마이그레이션 (`docs/works` → `docs/tickets`)

`docs/works/` 로 같은 규칙을 쓰던 저장소에 적용하는 절차. "적용해줘" 만 받은 세션도 이 순서를 그대로 따른다.
아래 `T` 는 `.claude/skills/repo-tickets/scripts/tickets.mjs`.

**0. 사전 점검** (아무것도 바꾸지 않는다)

- `git status` 가 깨끗할 것. 미커밋 일감 파일이 있으면 먼저 사용자에게 커밋 여부를 묻는다.
- 열린 브랜치·워크트리가 있으면 사용자에게 알린다 — 경로가 바뀌므로 그쪽에서 충돌이 난다.
- skill 원본 저장소에서 읽기 전용 lint 로 고칠 목록을 뽑아 둔다:
  `node <repo-tickets>/skills/repo-tickets/scripts/tickets.mjs lint --root <대상 저장소> --dir docs/works`

**1. 커밋 ① — skill 설치**

- 위 설치 명령. `.claude/skills/` 가 gitignore 돼 있으면 예외 추가.
- 커밋 메시지 예: `chore: repo-tickets skill 설치`

**2. 커밋 ② — 이동만** (내용 수정을 섞지 않는다 — rename 검출이 유지돼야 히스토리가 이어진다)

- `git mv docs/works docs/tickets`
- 이름에 상태를 붙여 리네임한 일감이 있으면 원래 이름으로 되돌린다
  (예: `epic-foo-cancelled` → `epic-foo`). 사유는 커밋 ③ 에서 로그로 옮긴다.
- 커밋 메시지 예: `chore: docs/works → docs/tickets 이동`

**3. 커밋 ③ — 참조 교체**

- `node $T lint` 를 돌려 나온 항목을 고친다.
  - 경로 참조 → `[[이름]]`. 이름이 경로에 있으면 그대로, 번호만 있으면 lint 가 제시한 후보 중
    **문맥을 읽고** 확정한다 (번호는 중복될 수 있다).
  - 번호 덧붙인 참조 `[[이름]](150)` → `[[이름]]`. 맨 이름 → `[[이름]]`.
  - 되돌린 이름의 취소·보류 사유는 해당 일감 진행 로그에 한 줄로.
- `CLAUDE.md`·`AGENTS.md` 의 기존 일감 규칙 섹션을 위 **진입 블록**으로 교체한다.
  README 등 다른 문서의 `docs/works` 언급도 `docs/tickets` 로.
- `docs/tickets/README.md` (예전 규칙 문서) 를 skill 을 가리키는 한 줄로 교체한다 — 남기면 정본이 둘이 된다.
  `rm docs/tickets/README.md && node $T init` 이 포인터를 만들어 준다.
- `node $T lint` 가 오류 0 으로 통과할 것. 경고도 원칙적으로 0 — 남기는 경고는 이유를 보고한다.
- 커밋 메시지 예: `docs: 일감 참조를 [[슬러그]] 로 통일`
