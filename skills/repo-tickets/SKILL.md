---
name: repo-tickets
description: 저장소 안 docs/tickets/{todo,doing,done}/ 의 md 파일로 일감(버그·태스크·에픽)을 관리한다 — Jira·Linear·Notion·GitHub Issues 같은 외부 트래커가 아니다. 일감을 만들거나, 착수·진행 기록·완료·취소·우선순위 변경하거나, 할 일 목록을 보거나, 작업 중 발견한 버그·후속 작업을 남기거나, 일감 참조([[task-…]])·docs/tickets 규칙을 검사할 때 사용한다.
---

# repo-tickets

이 저장소의 일감은 `docs/tickets/` 아래 md 파일이다. **작업 전에 같은 폴더의 `rules.md` 를 읽고 그대로 따른다.**

- 생성·이동·로그·검사는 손으로 하지 말고 이 skill 의 `scripts/tickets.mjs` 를 **저장소 루트에서** 실행한다
  (설치 위치 기준 `node .claude/skills/repo-tickets/scripts/tickets.mjs <명령>`, 사용법은 rules.md).
- 일감은 어디서든 `[[<type>-<slug>]]` 로만 부른다. 경로·번호로 부르지 않는다.
- 일감 파일을 고치거나 참조를 바꿨으면 끝내기 전에 `lint` 를 통과시킨다.
