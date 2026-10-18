// repo-tickets 테스트 — node 내장 node:test 만 사용한다 (`node --test`).
// 번호 판정 예제는 실제 마이그레이션에서 사람이 고친 참조의 모양을 본뜬 가상 예제다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../skills/repo-tickets/scripts/tickets.mjs');

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-tickets-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: dir });
  return dir;
}

function run(dir, ...args) {
  const r = spawnSync('node', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

function ok(dir, ...args) {
  const r = run(dir, ...args);
  assert.equal(r.code, 0, r.out);
  return r.out;
}

function write(dir, file, text) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
}

const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');
const exists = (dir, file) => fs.existsSync(path.join(dir, file));
const T = 'docs/tickets';

// lint 출력에서 file 의 몇 번째 줄이 보고됐는지
function flaggedLines(out, file) {
  return new Set([...out.matchAll(new RegExp(`^[✗!] ${file.replace(/[.]/g, '\\.')}:(\\d+) `, 'gm'))].map((m) => Number(m[1])));
}

test('일감 생명주기: new → start → log → done', () => {
  const d = repo();
  assert.match(ok(d, 'init'), /포인터 생성/);
  ok(d, 'new', 'task', 'alpha', '--priority', '150', '--title', '알파', '--source', '테스트');
  assert.ok(exists(d, `${T}/todo/150_task-alpha.md`));

  ok(d, 'start', 'task-alpha');
  assert.ok(exists(d, `${T}/doing/150_task-alpha.md`));
  ok(d, 'log', '[[task-alpha]]', '절반 완료');
  const body = read(d, `${T}/doing/150_task-alpha.md`);
  assert.match(body, /## 진행 로그\n\n- \d{4}-\d{2}-\d{2}: 착수\.\n- \d{4}-\d{2}-\d{2}: 절반 완료\n$/);

  const refused = run(d, 'done', 'task-alpha');
  assert.equal(refused.code, 1);
  assert.match(refused.out, /완료 조건이 남아 있다/);

  write(d, `${T}/doing/150_task-alpha.md`, body.replace('- [ ]', '- [x] 끝'));
  ok(d, 'done', 'task-alpha');
  const done = fs.readdirSync(path.join(d, T, 'done')).filter((f) => f.endsWith('.md'));
  assert.equal(done.length, 1);
  assert.match(done[0], /^\d{8}_150_task-alpha\.md$/);
});

test('stop · prio · cancel · list', () => {
  const d = repo();
  ok(d, 'init');
  ok(d, 'new', 'bug', 'crash', '--source', 's');
  ok(d, 'start', 'bug-crash');
  ok(d, 'stop', 'bug-crash', '보류');
  assert.ok(exists(d, `${T}/todo/500_bug-crash.md`));
  assert.match(read(d, `${T}/todo/500_bug-crash.md`), /중단 — 보류/);

  ok(d, 'prio', 'bug-crash', '50');
  assert.ok(exists(d, `${T}/todo/050_bug-crash.md`));

  ok(d, 'done', 'bug-crash', '--cancel', '재현 안 됨'); // 체크리스트가 비어 있어도 취소는 된다
  const [f] = fs.readdirSync(path.join(d, T, 'done')).filter((x) => x.endsWith('.md'));
  assert.match(read(d, `${T}/done/${f}`), /취소 — 재현 안 됨/);
  assert.match(ok(d, 'list', 'done'), /050 {2}bug-crash/);
});

test('에픽: 서브태스크 착수 시 에픽이 doing 으로, 서브태스크 완료는 제자리 리네임', () => {
  const d = repo();
  ok(d, 'init');
  ok(d, 'new', 'epic', 'deploy', '--priority', '110', '--source', 's');
  ok(d, 'new', 'task', 'dns', '--epic', 'epic-deploy', '--priority', '100', '--source', 's');
  ok(d, 'new', 'task', 'smoke', '--epic', 'epic-deploy', '--priority', '200', '--source', 's');

  ok(d, 'start', 'task-dns');
  assert.ok(exists(d, `${T}/doing/110_epic-deploy/100_task-dns.md`));
  ok(d, 'done', 'task-dns', '--cancel', '불필요');
  assert.ok(fs.readdirSync(path.join(d, T, 'doing/110_epic-deploy')).some((f) => /^\d{8}_100_task-dns\.md$/.test(f)));

  const epicDone = run(d, 'done', 'epic-deploy', '--cancel', 'x');
  assert.equal(epicDone.code, 0, epicDone.out); // 취소는 남은 서브태스크와 무관
});

test('new: 형식·중복 검사, [[ 로 시작하는 source 는 따옴표로', () => {
  const d = repo();
  ok(d, 'init');
  assert.equal(run(d, 'new', 'task', 'Bad_Slug', '--source', 's').code, 1);
  assert.equal(run(d, 'new', 'task', 'x').code, 1); // --source 필수
  ok(d, 'new', 'task', 'alpha', '--source', 's');
  assert.equal(run(d, 'new', 'task', 'alpha', '--source', 's').code, 1);
  ok(d, 'new', 'task', 'beta', '--source', '[[task-alpha]] 후속');
  assert.match(read(d, `${T}/todo/500_task-beta.md`), /^source: "\[\[task-alpha\]\] 후속"$/m);
  assert.equal(run(d, 'log', 'task-beta', 'x', '--date', '9/30').code, 1);
});

test('lint: 오류 검출', () => {
  const d = repo();
  ok(d, 'init');
  ok(d, 'new', 'task', 'alpha', '--priority', '150', '--source', 's');
  write(d, `${T}/todo/abc.md`, '# 이름 형식 위반\n');
  write(d, `${T}/todo/160_task-alpha.md`, '---\ntype: task\ncreated: 2026-01-01\nsource: s\n---\n'); // 이름 중복
  write(d, `${T}/todo/170_task-gamma.md`, '---\ntype: task\ncreated: 2026-01-01\nsource: [[task-alpha]] 후속\n---\n');
  write(d, 'src/a.ts', [
    '// [[task-nope]]',
    '// docs/works/todo/150_task-alpha.md',
    '// see 150_task-alpha.md',
  ].join('\n'));
  const r = run(d, 'lint');
  assert.equal(r.code, 1);
  for (const re of [/abc\.md {2}이름 형식 위반/, /task-alpha  이름 중복: /, /YAML 리스트로 파싱된다/, /없는 일감 참조 \[\[task-nope\]\]/,
    /경로로 된 일감 참조 .* → \[\[task-alpha\]\]/, /파일명으로 된 일감 참조 '150_task-alpha\.md'/]) {
    assert.match(r.out, re);
  }
});

// 번호 판정에 쓸 일감들. 음성 예제의 수도 일부러 실존 우선순위로 맞춘다 (아니면 검사가 무의미하다).
const PRIORITIES = ['060', '080', '100', '120', '150', '160', '170', '200', '220', '300', '400', '410', '450', '460', '480', '490', '560', '700'];

function numberFixture() {
  const d = repo();
  ok(d, 'init');
  for (const p of PRIORITIES) ok(d, 'new', 'task', `t${p}`, '--priority', p, '--source', 's');
  return d;
}

// 잡아야 하는 모양 — 각 줄이 하나 이상 보고돼야 한다
const POSITIVE_CODE = [
  ' * 목록 필터 파라미터 (490)',
  ' * 기존 행 백필 (works 170): 사용자별 오름차순',
  ' * "이번 달" 경계는 KST 기준 (220 버그 해결)',
  ' * 회원가입도 같은 정책(150 일감). 단 카운터는 분리',
  ' * - index: q(상품명 LIKE, 490), category',
  ' *   filter=no_price — 가격 기록이 없는 상품 — 080.',
  '  // 060 회귀: 키보드가 하단 바를 가린다',
  ' * 490 — 동명 상품이 있어도 id 로 걸러야 한다',
  ' * - index: market_id, product_id(490), 정렬',
  ' * - show 2종은 480 (어드민 폼의 목록 순회 제거)',
  ' * 사용자 순서 저장 (works [[task-t170]])',
];
const POSITIVE_PROSE = [
  '확장 묶음은 460/480/490 이다.',
  '남은 것은 레거시 철거뿐이고 그건 150·200이 맡는다.',
  '(410에서 8종까지 확장, 나머지는 보류)',
  '부수 효과로 450 도 함께 종료 처리.',
  '`q` 는 490 에서 추가했다.',
  '060(하단 바가 키보드만큼 올라옴)이 먼저다.',
  '자세한 건 [[task-t450]](450) 참고.',
  '랜딩은 일감 560 으로 분리했다.',
  '이 일감은 task-t150 의 후속이다.',
];
const POSITIVE_TICKET_BODY = [
  '- 080 전수 확인에서 발견했다.',
  '선행: 120 완료 후에만 의미가 있다.',
];

// 잡으면 안 되는 모양 — 어느 줄도 보고되면 안 된다
const NEGATIVE = [
  'expect(parsePagination({ per_page: "100" }).perPage).toBe(100);',
  'expect(barHeight, lessThan(160));',
  '반복수(100,000)를 그대로 쓴다.',
  '사용 웨이트 2종(400/700)만 번들한다.',
  'bcrypt(cost 12)는 200~300ms CPU 라 무료 플랜을 넘는다.',
  '시드로 댓글 100건에 글마다 0~4건씩 깐다.',
  '`requireRows` 하한도 2 → 100 으로 올렸다.',
  'z.coerce.number().int().min(1).max(100).default(30) 로 검증',
  '/health   165  170  171 ms   (중앙 ~167)',
  '폭 ≤ 480 에서는 바로 통과한다.',
  '잘못된 요청은 404 를 돌려준다.',
  '**:[[cmdk-item]]:px-2 와 /api/tickets/123 은 일감이 아니다. frameworks/todo/123 도.',
  '설정은 `width 150` 처럼 쓴다.',
  '키보드 300 케이스로 단언했다. <!-- tickets-lint-ignore -->',
];

test('lint: 번호 참조로 보이는 모양을 잡는다', () => {
  const d = numberFixture();
  write(d, 'src/pos.ts', POSITIVE_CODE.join('\n'));
  write(d, 'docs/pos.md', POSITIVE_PROSE.join('\n'));
  const body = read(d, `${T}/todo/700_task-t700.md`);
  write(d, `${T}/todo/700_task-t700.md`, `${body}\n${POSITIVE_TICKET_BODY.join('\n')}\n`);
  const bodyStart = body.split('\n').length + 1;

  const out = run(d, 'lint').out;
  const missing = (file, lines, offset = 1) => lines.filter((_, i) => !flaggedLines(out, file).has(offset + i));
  assert.deepEqual(missing('src/pos.ts', POSITIVE_CODE), []);
  assert.deepEqual(missing('docs/pos.md', POSITIVE_PROSE), []);
  assert.deepEqual(missing(`${T}/todo/700_task-t700.md`, POSITIVE_TICKET_BODY, bodyStart), []);
});

test('lint: 측정값·코드 인자·HTTP 코드·무시 표기는 잡지 않는다', () => {
  const d = numberFixture();
  write(d, 'src/neg.md', NEGATIVE.join('\n'));
  const out = run(d, 'lint').out;
  const flagged = [...flaggedLines(out, 'src/neg.md')].map((n) => NEGATIVE[n - 1]);
  assert.deepEqual(flagged, []);
});

test('lint: 깨끗한 저장소는 0/0, skill 설치본(다른 skill 포함)은 검사하지 않는다', () => {
  const d = repo();
  ok(d, 'init');
  ok(d, 'new', 'task', 'alpha', '--source', 's');
  write(d, '.claude/skills/repo-tickets/rules.md', '[[task-nope]] docs/works/todo/150_task-x.md\n');
  write(d, '.claude/skills/other-skill/rules.md', '예시: [[task-example]] (150)\n'); // 다른 skill 설치본도 제외
  write(d, '.agents/skills/other-skill/SKILL.md', '[[bug-example]]\n');
  write(d, 'src/a.ts', '// [[task-alpha]] 참고\n');
  assert.match(ok(d, 'lint'), /오류 0, 경고 0/);
});
