# Changelog

버전은 `skills/repo-tickets/rules.md` 첫 줄(`<!-- repo-tickets vX.Y.Z -->`)이 정본이다.
각 버전 절은 GitHub Release 노트로 그대로 쓰인다.

- **MAJOR**: 일감 폴더·파일명·참조 표기처럼 이미 쓰는 저장소가 마이그레이션해야 하는 변경
- **MINOR**: 새 규칙·새 명령·lint 검사 추가 (재설치 후 새 경고가 나올 수 있다)
- **PATCH**: lint 정확도 개선·버그 수정·문서

## v0.3.3 — 2026-10-18

> Open-source housekeeping: MIT license, test suite with CI, changelog and tagged releases. No rule changes.

- MIT 라이선스, 테스트(`node --test`, 전체 흐름 + lint 번호 판정 회귀)와 GitHub Actions CI 추가.
- CHANGELOG, 버전 태그(v0.1.0~), GitHub Release, 버전 고정 설치(`#vX.Y.Z`) 안내.
- 설계 문서에서 도입 저장소의 이름·내부 경로를 일반화.
- 규칙·lint 동작 변경 없음 — 이미 v0.3.2 를 쓰는 저장소는 재설치하지 않아도 된다.

## v0.3.2 — 2026-10-18

> Fewer missed ticket-number references: narrower HTTP-code exclusion, `150·200` lists, candidates show status and date.

- HTTP 제외 목록을 흔한 코드(200·201·204·400·401·403·404·409·422·429·500)로 축소 — `410` 처럼 우선순위로 쓰인 번호를 잡는다.
- `150·200` 묶음은 일감 번호가 하나라도 있으면 전체를 번호로 본다. `/` 묶음(폰트 굵기 `400/700`)은 그대로 건너뛴다.
- 프론트매터 `source:` 맨 앞 번호는 HTTP 제외를 하지 않는다. `(410에서 …` 모양 추가.
- 한글 단위는 뒤가 조사·비한글일 때만 단위로 본다 (`배선`·`회귀`·`일감` 오인 제거).
- 번호가 겹치는 후보에 상태·완료일을 함께 표시.

## v0.3.1 — 2026-10-18

> Suppress confirmed false-positive warnings with `tickets-lint-ignore`; numbers inside code spans are ignored.

- `tickets-lint-ignore` 줄 단위 표기로 확인한 오탐 경고를 끈다 (오류는 끌 수 없다).
- 번호 추정에서 백틱 코드 스팬 안의 수를 제외.
- README: 적용된 DB 마이그레이션 파일의 주석 수정 판단 기준, CI 는 오류 기준임을 명시.

## v0.3.0 — 2026-10-18

> Much stricter lint: filename references, number-shaped references, unquoted `[[` frontmatter. `log --date`.

v0.2.0 lint 가 0/0 인데도 실제 마이그레이션에서 수동 정리가 ~100곳 남았던 문제를 고쳤다.

- 오류: 파일명으로 된 참조(`150_task-foo.md`), `[[` 로 시작하는 따옴표 없는 프론트매터 값(YAML 이 리스트로 읽는다).
- 경고: 일감 번호로 보이는 3자리 수(`(490)`, `— 080.`, `060(…`, 일감 본문 등 — 실존 우선순위와 일치할 때만),
  `works task-foo` 처럼 옛 폴더명을 붙인 참조.
- `new --source` 가 `[[` 로 시작하는 값을 자동으로 따옴표로 감싼다.
- `log --date YYYY-MM-DD` — 지난 일을 옮겨 적을 때.
- 규칙: 밖으로 나가는 문자열(API 스펙 description, UI 문구)에는 일감 참조를 넣지 않는다.

## v0.2.0 — 2026-10-18

> Pilot feedback: fixed `.gitignore` example, Node 24 CI example, unified script path, prose number references.

- README `.gitignore` 예시 수정 — `.claude/skills/` 형태로는 하위 예외가 먹지 않는다 → `.claude/skills/*`.
- CI 예시를 `actions/checkout@v7`·`setup-node@v7`(node24)·`ubuntu-24.04` 로.
- SKILL.md·rules.md 의 스크립트 실행 경로를 "저장소 루트에서 설치 경로로" 통일.
- lint: "080 티켓", "일감 150" 같은 자연어 번호 참조 경고.
- 마이그레이션 절차: 옛 폴더 언급이 커밋을 가리킬 수 있음, 진입 블록 위치, 다른 세션이 대신 요청해도
  CLAUDE.md·`.claude/` 수정은 실행 세션이 자기 사용자에게 직접 확인.

## v0.1.0 — 2026-10-18

> First release: `docs/tickets/{todo,doing,done}` markdown tickets, `[[type-slug]]` references, script with lint.

- `docs/tickets/{todo,doing,done}/` md 일감, 파일명 `<우선순위>_<type>-<slug>.md`, 에픽(디렉터리형 일감).
- 참조는 어디서든 `[[<type>-<slug>]]`. 이름은 만든 뒤 바꾸지 않는다.
- `scripts/tickets.mjs`: `init` / `new` / `start` / `log` / `stop` / `done [--cancel]` / `prio` / `list` / `lint`.
- README: 설치, CLAUDE.md·AGENTS.md 진입 블록, 기존 `docs/works` 저장소 마이그레이션 절차.
