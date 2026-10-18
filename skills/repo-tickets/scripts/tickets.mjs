#!/usr/bin/env node
// repo-tickets — 저장소 안 docs/tickets/ md 일감 관리. 규칙 정본은 ../rules.md.
// node 내장 모듈만 사용한다 (설치 없이 클론 즉시 동작해야 하므로).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = (readText(path.join(SKILL_DIR, 'rules.md')) ?? '').match(/repo-tickets v([\d.]+)/)?.[1] ?? '?';

const STATUSES = ['todo', 'doing', 'done'];
const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const NAME_RE = new RegExp(`^(bug|task|epic)-${SLUG}$`);
const ENTRY_RE = new RegExp(`^(?:(\\d{8})_)?(\\d{3})_((bug|task|epic)-${SLUG})(\\.md)?$`);
const REF_RE = /\[\[((?:bug|task|epic)-[a-z0-9-]+)\]\]/g;
const NUM_SUFFIX_RE = /\[\[((?:bug|task|epic)-[a-z0-9-]+)\]\]\s*\(\d{3}\)/g;
// 일감 폴더 경로 언급. works 는 옛 이름 — 상태 폴더 없이 번호만 붙은 `works/060` 형태도 있다.
const PATH_RE = /(?<![A-Za-z0-9_-])(works|tickets)\/(?:(todo|doing|done)\b)?/g;
const LEGACY_DIR_RE = /(?<![A-Za-z0-9_-])docs\/works\b/;
// [[ ]] 밖에 맨 이름으로 쓴 일감 이름. 파일명(`150_task-…`)·경로 안의 이름은 경로 검사가 맡는다.
const BARE_RE = /(?<![\w/[-])((?:bug|task|epic)-[a-z0-9]+(?:-[a-z0-9]+)*)(?![\w-]|\]\])/g;
// 자연어 번호 참조: "080 티켓", "티켓 150", "150번 일감". 번호는 우선순위라 참조로 쓸 수 없다.
const PROSE_NUM_RE = /(?:티켓|일감|ticket)\s*#?(\d{3})(?!\d)|(?<![\d.,:])(\d{3})\s*(?:번\s*)?(?:티켓|일감)/gi;
// 파일명 꼴 참조: `150_task-foo.md`, `20260930_070_bug-x`. 경로가 없어도 확실한 일감 참조다.
const FILENAME_RE = /(?<![\w-])(?:\d{8}_)?(\d{3})_((?:bug|task|epic)-[a-z0-9]+(?:-[a-z0-9]+)*)(?:\.md)?/g;
// 옛 폴더명을 단어로 앞에 붙인 참조: `works task-foo`, `works [[task-foo]]`
const WORKS_WORD_RE = /(?<![\w/-])works\s+(?:\[\[)?(?:bug|task|epic)-/g;
// 일감 번호로 보이는 3자리 수의 모양. 숫자만으로는 판정할 수 없으므로 실존 우선순위와 일치할 때만 경고한다.
// 모양은 sijangajang 마이그레이션에서 실제로 고친 참조 ~300줄을 기준으로 맞췄다.
// 단위 뒤에 조사가 붙어도("100건에") 단위다. 단, 회귀·일감처럼 단위 글자로 시작하는 낱말은 뺀다.
const UNITS = '(?:px|ms|dp|pt|kb|mb|x|×|%|개|건|명|원|자|줄|행|초|분|시간|일(?!감)|회(?!귀)|배|폭|년|월|번째|계열)';
const NUM_SHAPES = [
  /(?<!\w)\(\s*(?:works\s+)?(\d{3})\s*(?=[):]|,\s)/g, // (490)  (works 170, …)  (490: …)
  new RegExp(`\\(\\s*(\\d{3})\\s+(?!${UNITS})[가-힣]`, 'g'), // (220 버그 해결)  (090 회귀)  (495 로그 참조)
  /\([^()]*[가-힣][^()]*(?<!\d),\s*(\d{3})\)/g, // (상품명 LIKE, 490)
  /(?:—|–|\/\/|^\s*\*|^#+)\s+(\d{3})(?=[\s.,)]|$)/g, // — 080.  // 060 회귀  * 490 —  ## 090
  /(?<![\w.,:=~])(\d{3})\s*(?:과의|와의|과|와|도|은|는|을|를|의)(?=\s)/g, // 450 도 함께, 090 과의 관계
  new RegExp(`(?:은|는)\\s+(\\d{3})(?![\\d.,%])(?!\\s*${UNITS})`, 'g'), // \`q\` 는 490, 2종은 480
  /(?<![\w.])(\d{3})[(=](?=[가-힣\w])/g, // 060(하단 바…)  200(스모크)  495=apps/mobile
  /^source:\s*["']?(\d{3})(?!\d)/g, // 프론트매터 source: 080 수정 중 …
];
// 일감 본문 안에서는 모양을 따지지 않는다 — 단위가 붙지 않은 우선순위 값이면 경고 ("080 전수 확인에서").
// 측정값(표·부등호·연속된 수·단위)은 뺀다.
const TICKET_NUM_RE = new RegExp(`(?<![\\w.,:/#+=~×(<>≤≥→-]|[=~<>≤≥/→]\\s|x\\s?|\\d\\s{1,4})(\\d{3})(?![\\w.,%:/×~-])(?!\\s*${UNITS})(?!\\s*[|)/])(?!\\s+\\d)`, 'g');
// 한글 주석이 있는 줄의 \`product_id(490)\` — 한글이 없는 줄의 \`toBe(100)\` 같은 코드 인자와 구분한다.
const WORD_PAREN_RE = /\w\((\d{3})\)(?!\.)/g;
const NUM_LIST_RE = /(?<![\w/.])\d{3}(?:\/\d{3})+(?![\d/])/g; // 460/480/490
const HTTP_CODES = new Set(['200', '201', '204', '301', '302', '304', '400', '401', '403', '404', '405', '409', '410', '422', '429', '500', '502', '503', '504']);
// 확인한 오탐 경고를 끄는 줄 단위 표기. 오류는 끌 수 없다.
const IGNORE_MARK = 'tickets-lint-ignore';
const LOG_HEADING_RE = /^## 진행 로그/m;
const LOG_LINE_RE = /^- \d{4}-\d{2}-\d{2}/m;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.svelte-kit', '.dart_tool', '.wrangler', 'coverage', 'tmp']);

// ---------- 공통 ----------

function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function fail(msg) {
  console.error(`오류: ${msg}`);
  process.exit(1);
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function parseArgs(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) opt[key] = true;
      else { opt[key] = next; i++; }
    } else pos.push(a);
  }
  return { pos, opt };
}

function isGitRepo(root) {
  try {
    execFileSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

// git 이 추적 중이면 git mv (히스토리 보존), 아니면 그냥 rename.
function move(ctx, from, to) {
  if (fs.existsSync(to)) fail(`이미 존재: ${rel(ctx, to)}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (ctx.git) {
    try {
      execFileSync('git', ['-C', ctx.root, 'mv', from, to], { stdio: 'pipe' });
      return;
    } catch { /* 미추적 파일 — 아래 rename */ }
  }
  fs.renameSync(from, to);
}

function rel(ctx, p) {
  return path.relative(ctx.root, p) || '.';
}

// ---------- 일감 로딩 ----------

// 반환: { tickets: [...], problems: [{level, where, msg}] }
// 일감: { name, type, priority, date, status, abs, isDir, md, epic }
function loadTickets(ctx) {
  const tickets = [];
  const problems = [];
  const bad = (where, msg) => problems.push({ level: 'error', where, msg });

  for (const status of STATUSES) {
    const dir = path.join(ctx.dir, status);
    if (!fs.existsSync(dir)) continue;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith('.')) continue;
      const abs = path.join(dir, ent.name);
      const m = ent.name.match(ENTRY_RE);
      if (!m || (ent.isDirectory() ? m[5] : !m[5])) {
        bad(rel(ctx, abs), '이름 형식 위반 — `<우선순위 3자리>_<bug|task|epic>-<slug>[.md]`');
        continue;
      }
      const [, date, priority, name, type] = m;
      if (ent.isDirectory() !== (type === 'epic')) {
        bad(rel(ctx, abs), type === 'epic' ? '에픽은 디렉터리여야 한다' : '디렉터리는 epic 만 가능');
        continue;
      }
      if (status === 'done' && !date) bad(rel(ctx, abs), 'done 의 일감은 `<YYYYMMDD>_` 완료일 접두가 필요하다');
      if (status !== 'done' && date) bad(rel(ctx, abs), `${status} 의 일감에 완료일 접두가 붙어 있다`);
      const t = { name, type, priority, date, status, abs, isDir: ent.isDirectory(), epic: null };
      t.md = t.isDir ? path.join(abs, 'README.md') : abs;
      tickets.push(t);
      if (t.isDir) loadSubtasks(ctx, t, tickets, bad);
    }
  }
  return { tickets, problems };
}

function loadSubtasks(ctx, epic, tickets, bad) {
  if (!fs.existsSync(epic.md)) bad(rel(ctx, epic.abs), '에픽에 README.md 가 없다');
  for (const ent of fs.readdirSync(epic.abs, { withFileTypes: true })) {
    if (ent.name.startsWith('.') || ent.name === 'README.md') continue;
    if (!ent.name.endsWith('.md')) continue; // 첨부 자료 등은 일감이 아니다
    const abs = path.join(epic.abs, ent.name);
    const m = ent.name.match(ENTRY_RE);
    if (!m || ent.isDirectory() || m[4] === 'epic') {
      bad(rel(ctx, abs), '서브태스크 이름 형식 위반 — `[<YYYYMMDD>_]<우선순위>_<bug|task>-<slug>.md`');
      continue;
    }
    const [, date, priority, name, type] = m;
    tickets.push({ name, type, priority, date, status: date ? 'done' : epic.status, abs, isDir: false, md: abs, epic });
  }
}

function load(ctx) {
  if (!fs.existsSync(ctx.dir)) fail(`${rel(ctx, ctx.dir)} 가 없다 — 먼저 \`init\``);
  return loadTickets(ctx).tickets;
}

function find(tickets, raw) {
  if (!raw) fail('일감 이름을 지정하라 (예: task-api-rate-limiting)');
  const name = String(raw).replace(/^\[\[|\]\]$/g, '');
  const hits = tickets.filter((t) => t.name === name);
  if (hits.length === 0) {
    const near = tickets.filter((t) => t.name.includes(name)).map((t) => t.name);
    fail(`일감 없음: ${name}${near.length ? ` — 혹시: ${near.join(', ')}` : ''}`);
  }
  if (hits.length > 1) fail(`이름 중복: ${name} — \`lint\` 로 먼저 정리하라`);
  return hits[0];
}

function fileName(t, { date = t.date, priority = t.priority } = {}) {
  return `${date ? `${date}_` : ''}${priority}_${t.name}${t.isDir ? '' : '.md'}`;
}

// ---------- 본문 편집 ----------

function appendLog(t, text, date = today()) {
  let body = readText(t.md);
  if (body === null) fail(`읽을 수 없음: ${t.md}`);
  body = body.replace(/\s+$/, '');
  if (!LOG_HEADING_RE.test(body)) body += '\n\n---\n\n## 진행 로그\n';
  body += `\n- ${date}: ${text}\n`;
  fs.writeFileSync(t.md, body);
}

function uncheckedItems(t) {
  return (readText(t.md) ?? '').split('\n').filter((l) => /^\s*[-*] \[ \]/.test(l)).map((l) => l.trim());
}

// 프론트매터 값. `[[이름]]` 으로 시작하면 YAML 이 리스트로 읽으므로 따옴표로 감싼다.
function yamlScalar(v) {
  return /^[[\]{}"'*&!|>%@`#]|: | #/.test(v) ? JSON.stringify(v) : v;
}

function render(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

// ---------- 명령 ----------

function cmdInit(ctx) {
  for (const s of STATUSES) {
    const d = path.join(ctx.dir, s);
    fs.mkdirSync(d, { recursive: true });
    const keep = path.join(d, '.gitkeep');
    if (fs.readdirSync(d).length === 0) fs.writeFileSync(keep, '');
  }
  const readme = path.join(ctx.dir, 'README.md');
  if (fs.existsSync(readme)) {
    console.log(`${rel(ctx, readme)} 가 이미 있다 — 규칙을 적어 둔 문서라면 rules.md 와 정본이 둘이 되니 포인터로 교체하라.`);
  } else {
    fs.writeFileSync(readme, pointerReadme(ctx));
    console.log(`포인터 생성: ${rel(ctx, readme)}`);
  }
  console.log(`준비됨: ${rel(ctx, ctx.dir)}/{todo,doing,done}`);
}

function pointerReadme(ctx) {
  const rules = path.join(SKILL_DIR, 'rules.md');
  const inside = !path.relative(ctx.root, rules).startsWith('..');
  const where = inside ? `[\`${path.relative(ctx.root, rules)}\`](${path.relative(ctx.dir, rules)})` : '`rules.md`';
  return `# tickets\n\n일감 규칙은 repo-tickets skill 의 ${where} 를 따른다. 이 폴더에 규칙을 따로 적지 않는다.\n`;
}

function cmdNew(ctx, pos, opt) {
  const [type, rawSlug] = pos;
  if (!['bug', 'task', 'epic'].includes(type)) fail('type 은 bug | task | epic');
  if (!rawSlug) fail('slug 를 지정하라');
  const slug = rawSlug.startsWith(`${type}-`) ? rawSlug.slice(type.length + 1) : rawSlug;
  const name = `${type}-${slug}`;
  if (!NAME_RE.test(name)) fail(`slug 형식 위반: ${slug} — 영문 소문자·숫자·하이픈만`);
  const priority = String(opt.priority ?? 500).padStart(3, '0');
  if (!/^\d{3}$/.test(priority)) fail('우선순위는 000~999');
  if (opt.source === undefined || opt.source === true) fail('--source "<발견 경위 또는 근거>" 가 필요하다');

  const tickets = load(ctx);
  if (tickets.some((t) => t.name === name)) fail(`이미 있는 이름: ${name}`);

  let parent = path.join(ctx.dir, 'todo');
  if (opt.epic) {
    if (type === 'epic') fail('에픽 안에 에픽을 둘 수 없다');
    const epic = find(tickets, opt.epic);
    if (epic.type !== 'epic') fail(`${epic.name} 은 에픽이 아니다`);
    if (epic.status === 'done') fail(`${epic.name} 은 이미 done 이다`);
    parent = epic.abs;
  }

  const vars = { type, created: today(), source: yamlScalar(opt.source), title: opt.title ?? name };
  const template = readText(path.join(SKILL_DIR, 'template.md'));
  let target;
  if (type === 'epic') {
    target = path.join(parent, `${priority}_${name}`);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'README.md'), render(EPIC_TEMPLATE, vars));
  } else {
    target = path.join(parent, `${priority}_${name}.md`);
    fs.writeFileSync(target, render(template, vars));
  }
  console.log(`생성: ${rel(ctx, target)}  →  참조는 [[${name}]]`);
}

const EPIC_TEMPLATE = `---
type: epic
created: {{created}}
source: {{source}}
---

# {{title}}

## 배경

## 에픽 완료 기준

- [ ]
`;

function cmdStart(ctx, pos) {
  const t = find(load(ctx), pos[0]);
  if (t.status === 'done') fail(`${t.name} 은 이미 done 이다`);
  if (t.epic) {
    if (t.epic.status === 'todo') {
      const to = path.join(ctx.dir, 'doing', path.basename(t.epic.abs));
      move(ctx, t.epic.abs, to);
      console.log(`에픽 이동: ${rel(ctx, to)}`);
      t.md = path.join(to, path.basename(t.md));
    }
    appendLog(t, '착수.');
    console.log(`착수: ${t.name} (에픽 ${t.epic.name})`);
    return;
  }
  if (t.status === 'doing') fail(`${t.name} 은 이미 doing 이다`);
  const to = path.join(ctx.dir, 'doing', path.basename(t.abs));
  move(ctx, t.abs, to);
  t.md = t.isDir ? path.join(to, 'README.md') : to;
  appendLog(t, '착수.');
  console.log(`착수: ${rel(ctx, to)}`);
}

function cmdLog(ctx, pos, opt) {
  const [raw, ...rest] = pos;
  const text = rest.join(' ').trim();
  if (!text) fail('로그 내용을 지정하라');
  // 지난 일을 옮겨 적을 때 (예: 마이그레이션 중 취소 사유 기록)
  if (opt.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(opt.date)) fail('--date 는 YYYY-MM-DD');
  const t = find(load(ctx), raw);
  appendLog(t, text, opt.date);
  console.log(`로그 추가: ${t.name}`);
}

function cmdStop(ctx, pos) {
  const [raw, ...rest] = pos;
  const reason = rest.join(' ').trim();
  if (!reason) fail('중단 사유를 지정하라');
  const t = find(load(ctx), raw);
  if (t.status !== 'doing') fail(`${t.name} 은 doing 이 아니다 (${t.status})`);
  appendLog(t, `중단 — ${reason}`);
  if (t.epic) { console.log(`중단 기록: ${t.name} (서브태스크는 제자리)`); return; }
  const to = path.join(ctx.dir, 'todo', path.basename(t.abs));
  move(ctx, t.abs, to);
  console.log(`todo 로 되돌림: ${rel(ctx, to)}`);
}

function cmdDone(ctx, pos, opt) {
  const tickets = load(ctx);
  const t = find(tickets, pos[0]);
  if (t.status === 'done') fail(`${t.name} 은 이미 done 이다`);
  const cancel = typeof opt.cancel === 'string' ? opt.cancel.trim() : null;
  if (opt.cancel !== undefined && !cancel) fail('--cancel "<사유>" 가 필요하다');

  if (!cancel) {
    const open = uncheckedItems(t);
    if (open.length) fail(`완료 조건이 남아 있다 (${rel(ctx, t.md)}):\n  ${open.join('\n  ')}\n체크하거나, 취소라면 --cancel "<사유>"`);
    if (t.type === 'epic') {
      const left = tickets.filter((s) => s.epic === t && !s.date).map((s) => s.name);
      if (left.length) fail(`끝나지 않은 서브태스크: ${left.join(', ')}`);
    }
  }
  appendLog(t, cancel ? `취소 — ${cancel}` : '완료.');

  const stamp = today().replaceAll('-', '');
  const parent = t.epic ? path.dirname(t.abs) : path.join(ctx.dir, 'done');
  const to = path.join(parent, fileName(t, { date: stamp }));
  move(ctx, t.abs, to);
  console.log(`${cancel ? '취소' : '완료'}: ${rel(ctx, to)}`);
}

function cmdPrio(ctx, pos) {
  const [raw, p] = pos;
  const priority = String(p ?? '').padStart(3, '0');
  if (!/^\d{3}$/.test(priority)) fail('우선순위는 000~999');
  const t = find(load(ctx), raw);
  const to = path.join(path.dirname(t.abs), fileName(t, { priority }));
  if (to === t.abs) { console.log('변경 없음'); return; }
  move(ctx, t.abs, to);
  console.log(`우선순위 변경: ${rel(ctx, to)}`);
}

function cmdList(ctx, pos) {
  const tickets = load(ctx);
  const which = pos[0] ? [pos[0]] : STATUSES;
  for (const status of which) {
    if (!STATUSES.includes(status)) fail('상태는 todo | doing | done');
    const top = tickets.filter((t) => !t.epic && t.status === status).sort(order);
    console.log(`\n${status}/ (${top.length})`);
    for (const t of top) {
      console.log(`  ${t.date ? `${t.date} ` : ''}${t.priority}  ${t.name}`);
      for (const s of tickets.filter((x) => x.epic === t).sort(byPriority)) {
        console.log(`      ${s.date ? '✓' : '·'} ${s.priority}  ${s.name}`);
      }
    }
  }
}

// done 은 완료일 순, 나머지는 처리 순서(우선순위) 순. 서브태스크는 완료 여부와 무관하게 우선순위 순.
function order(a, b) {
  return (a.date ?? '').localeCompare(b.date ?? '') || byPriority(a, b);
}

function byPriority(a, b) {
  return a.priority.localeCompare(b.priority) || a.name.localeCompare(b.name);
}

// ---------- lint ----------

function cmdLint(ctx) {
  const { tickets, problems } = loadTickets(ctx);
  const report = (level, where, msg) => problems.push({ level, where, msg });
  const add = report;
  if (!fs.existsSync(ctx.dir)) fail(`${rel(ctx, ctx.dir)} 가 없다`);

  // 이름 중복
  const byName = new Map();
  for (const t of tickets) byName.set(t.name, [...(byName.get(t.name) ?? []), t]);
  for (const [name, list] of byName) {
    if (list.length > 1) add('error', name, `이름 중복: ${list.map((t) => rel(ctx, t.abs)).join(', ')}`);
  }

  // 프론트매터 · 진행 로그
  for (const t of tickets) {
    const body = readText(t.md);
    if (body === null) continue;
    if (t.type !== 'epic') {
      const fm = body.match(/^---\n([\s\S]*?)\n---/)?.[1];
      if (!fm) add('warn', rel(ctx, t.md), '프론트매터 없음 (type / created / source)');
      else {
        for (const key of ['type', 'created', 'source']) {
          if (!new RegExp(`^${key}:\\s*\\S`, 'm').test(fm)) add('warn', rel(ctx, t.md), `프론트매터 \`${key}\` 누락`);
        }
        const fmType = fm.match(/^type:\s*(\S+)/m)?.[1];
        if (fmType && fmType !== t.type) add('error', rel(ctx, t.md), `프론트매터 type(${fmType}) 이 파일명(${t.type}) 과 다르다`);
      }
    }
    if (t.status === 'doing' && !t.epic) {
      const subs = tickets.filter((s) => s.epic === t);
      const bodies = [body, ...subs.map((s) => readText(s.md) ?? '')];
      if (!bodies.some((b) => LOG_HEADING_RE.test(b) && LOG_LINE_RE.test(b.slice(b.search(LOG_HEADING_RE))))) {
        add('warn', rel(ctx, t.md), 'doing 인데 진행 로그가 없다 — 어디까지 했는지 `log` 로 남겨라');
      }
    }
  }

  // 저장소 전체 참조 검사
  const names = new Set(tickets.map((t) => t.name));
  const priorities = new Set(tickets.map((t) => t.priority));
  const ticketsRel = rel(ctx, ctx.dir).split(path.sep).join('/');
  const own = new Map(tickets.map((t) => [rel(ctx, t.md).split(path.sep).join('/'), t.name]));
  for (const file of listFiles(ctx)) {
    const text = readText(path.join(ctx.root, file));
    if (text === null || text.includes('\u0000')) continue;
    const lines = text.split('\n');
    const inTickets = file.startsWith(`${ticketsRel}/`) && file.endsWith('.md');
    const fmEnd = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
    lines.forEach((line, i) => {
      const where = `${file}:${i + 1}`;
      const ignored = line.includes(IGNORE_MARK);
      const add = (level, w, msg) => { if (level === 'error' || !ignored) report(level, w, msg); };
      const fmKey = i > 0 && i < fmEnd ? line.match(/^(\w+):\s*/)?.[0] : null;
      const covered = []; // 이미 보고한 구간 — 같은 번호를 두 번 보고하지 않는다
      const cover = (m) => covered.push([m.index, m.index + m[0].length]);
      const isCovered = (at) => covered.some(([a, b]) => at >= a && at < b);
      const inCode = (at) => [...line.matchAll(/`[^`]*`/g)].some((m) => at > m.index && at < m.index + m[0].length);

      if (fmKey && line.slice(fmKey.length).startsWith('[[')) {
        add('error', where, `프론트매터 값이 '[[' 로 시작한다 — YAML 리스트로 파싱된다. ${fmKey.trim()} "${line.slice(fmKey.length).replaceAll('"', '\\"')}" 처럼 따옴표로 감싼다`);
      }
      for (const m of line.matchAll(REF_RE)) {
        cover(m);
        if (!names.has(m[1])) add('error', where, `없는 일감 참조 [[${m[1]}]]${suggest(tickets, m[1])}`);
      }
      for (const m of line.matchAll(NUM_SUFFIX_RE)) {
        cover(m);
        add('warn', where, `번호를 덧붙인 참조 '${m[0]}' — [[${m[1]}]] 만 쓴다`);
      }
      checkPaths(ctx, tickets, line, where, add, cover);
      for (const m of line.matchAll(FILENAME_RE)) {
        if (isCovered(m.index)) continue;
        cover(m);
        add('error', where, `파일명으로 된 일감 참조 '${m[0]}' — [[이름]] 으로${candidates(tickets, { name: m[2] })}`);
      }
      for (const m of line.matchAll(WORKS_WORD_RE)) {
        add('warn', where, `옛 폴더명 'works' 가 붙은 참조 '${m[0]}…' — 'works' 를 빼고 [[이름]] 만`);
      }
      for (const m of line.matchAll(PROSE_NUM_RE)) {
        cover(m);
        add('warn', where, `번호로 부른 일감 '${m[0].trim()}' — [[이름]] 으로${candidates(tickets, { num: m[1] ?? m[2] })}`);
      }
      for (const n of numberRefs(line, priorities, (at) => isCovered(at) || inCode(at), inTickets)) {
        add('warn', where, `일감 번호로 보이는 '${n}' — 일감이면 [[이름]] 으로${candidates(tickets, { num: n })} (일감이 아니면 무시)`);
      }
      for (const m of line.matchAll(BARE_RE)) {
        if (!names.has(m[1]) || own.get(file) === m[1]) continue;
        const fix = fmKey ? `${fmKey.trim()} "…[[${m[1]}]]…" (프론트매터는 따옴표로)` : `[[${m[1]}]]`;
        add('warn', where, `[[ ]] 없이 쓴 일감 이름 '${m[1]}' — ${fix} 로`);
      }
    });
  }

  const errors = problems.filter((p) => p.level === 'error');
  const warns = problems.filter((p) => p.level === 'warn');
  for (const p of [...errors, ...warns]) console.log(`${p.level === 'error' ? '✗' : '!'} ${p.where}  ${p.msg}`);
  console.log(`\nrepo-tickets v${VERSION} lint (${rel(ctx, ctx.dir)}, 일감 ${tickets.length}개): 오류 ${errors.length}, 경고 ${warns.length}`);
  if (errors.length) process.exit(1);
}

// 모양(NUM_SHAPES·NUM_LIST_RE)과 실존 우선순위가 둘 다 맞는 3자리 수. HTTP 상태 코드는 뺀다 (코드 주석 오탐).
function numberRefs(line, priorities, isCovered, inTickets) {
  const found = new Set();
  const ok = (n, at) => priorities.has(n) && !HTTP_CODES.has(n) && !isCovered(at);
  const shapes = [...NUM_SHAPES, ...(inTickets ? [TICKET_NUM_RE] : []), ...(/[가-힣]/.test(line) ? [WORD_PAREN_RE] : [])];
  for (const re of shapes) {
    for (const m of line.matchAll(re)) {
      const at = m.index + m[0].indexOf(m[1]);
      if (ok(m[1], at)) found.add(m[1]);
    }
  }
  for (const m of line.matchAll(NUM_LIST_RE)) {
    const nums = m[0].split('/');
    if (nums.every((n) => priorities.has(n) && !HTTP_CODES.has(n))) nums.filter((n) => ok(n, m.index)).forEach((n) => found.add(n));
  }
  return found;
}

function checkPaths(ctx, tickets, line, where, add, cover) {
  let pathFound = false;
  for (const m of line.matchAll(PATH_RE)) {
    const [, base, status] = m;
    // 경로 꼬리: 공백·괄호·따옴표 전까지. `works/todo 490` 처럼 공백 뒤 번호만 오는 형태도 포함.
    const after = line.slice(m.index + m[0].length);
    const tail = (after.match(/^[^\s)\]`'",;]*/)[0] + (after.match(/^\s+\d{3}(?!\d)/)?.[0] ?? '')).replace(/[.:]+$/, '');
    const spec = specifier(tail);
    if (!spec) {
      // 폴더 자체 언급: tickets/todo 는 정상, works/… 는 옛 폴더
      if (base === 'works' && status) { add('warn', where, `옛 폴더 언급 'works/${status}' — docs/tickets 로 갱신`); pathFound = true; }
      continue;
    }
    if (base === 'tickets' && !status) continue; // 상태 폴더 없는 tickets/<n> 은 다른 의미일 수 있다 (API 경로 등)
    pathFound = true;
    cover({ index: m.index, 0: `${m[0]}${tail}` });
    add('error', where, `경로로 된 일감 참조 '${`${m[0]}${tail}`.trim()}' — [[이름]] 으로${candidates(tickets, spec)}`);
  }
  const legacy = !pathFound && line.match(LEGACY_DIR_RE);
  if (legacy) {
    // "docs/works 의 700", "docs/works 의 `task-…`" 같은 간접 참조면 후보를 붙인다
    const spec = specifier(line.slice(legacy.index + legacy[0].length).slice(0, 40));
    add('warn', where, `옛 폴더 언급 'docs/works' — docs/tickets 로 갱신${spec ? `, 일감을 가리키면 [[이름]] 으로${candidates(tickets, spec)}` : ''}`);
  }
}

// 경로 꼬리에서 일감 지정자를 뽑는다: 이름이 있으면 이름, 없으면 우선순위 번호.
function specifier(tail) {
  const name = tail.match(/(?:bug|task|epic)-[a-z0-9]+(?:-[a-z0-9]+)*/)?.[0];
  if (name) return { name };
  const num = tail.match(/(?<!\d)(\d{3})(?!\d)/)?.[1];
  return num ? { num } : null;
}

function candidates(tickets, spec) {
  if (spec.name) {
    if (tickets.some((t) => t.name === spec.name)) return ` → [[${spec.name}]]`;
    return suggest(tickets, spec.name) || ` (일감 '${spec.name}' 없음)`;
  }
  const hits = tickets.filter((t) => t.priority === spec.num).map((t) => `[[${t.name}]]`);
  if (hits.length === 0) return ` (우선순위 ${spec.num} 인 일감 없음 — 직접 찾아야 한다)`;
  return hits.length === 1 ? ` → 후보 ${hits[0]}` : ` → 후보 ${hits.join(' / ')} (번호 중복 — 문맥으로 확정)`;
}

function suggest(tickets, name) {
  const words = name.split('-').slice(1).filter((w) => w.length > 2);
  const scored = tickets
    .map((t) => ({ t, score: words.filter((w) => t.name.includes(w)).length }))
    .filter((x) => x.score >= Math.max(1, Math.ceil(words.length / 2)))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return scored.length ? ` → 후보 ${scored.map((x) => `[[${x.t.name}]]`).join(' / ')}` : '';
}

// git 저장소면 추적 + 미추적(무시 제외) 파일, 아니면 직접 순회. skill 설치본 자체는 제외한다.
function listFiles(ctx) {
  let files;
  if (ctx.git) {
    const out = execFileSync('git', ['-C', ctx.root, 'ls-files', '-co', '--exclude-standard', '-z'], { maxBuffer: 256 << 20 });
    files = out.toString('utf8').split('\0').filter(Boolean);
  } else {
    files = [];
    const walk = (dir) => {
      for (const ent of fs.readdirSync(path.join(ctx.root, dir), { withFileTypes: true })) {
        if (SKIP_DIRS.has(ent.name)) continue;
        const p = dir ? `${dir}/${ent.name}` : ent.name;
        if (ent.isDirectory()) walk(p);
        else if (ent.isFile()) files.push(p);
      }
    };
    walk('');
  }
  const skillRel = path.relative(ctx.root, SKILL_DIR).split(path.sep).join('/');
  return files.filter((f) => {
    if (/(^|\/)skills\/repo-tickets\//.test(f)) return false;
    if (!skillRel.startsWith('..') && f.startsWith(`${skillRel}/`)) return false;
    try { return fs.statSync(path.join(ctx.root, f)).size < 2 << 20; } catch { return false; }
  });
}

// ---------- 진입 ----------

const USAGE = `repo-tickets v${VERSION} — docs/tickets/ 일감 관리 (규칙: ${path.join(SKILL_DIR, 'rules.md')})

  init
  new <bug|task|epic> <slug> --source "<근거>" [--priority N] [--title T] [--epic <에픽 이름>]
  start <이름>
  log <이름> "<내용>" [--date YYYY-MM-DD]
  stop <이름> "<사유>"
  done <이름> [--cancel "<사유>"]
  prio <이름> <N>
  list [todo|doing|done]
  lint [--dir <경로>]

공통 옵션: --root <저장소 루트> (기본: 현재 디렉터리), --dir <일감 폴더> (기본: docs/tickets)`;

const { pos, opt } = parseArgs(process.argv.slice(2));
const [cmd, ...args] = pos;
const root = path.resolve(typeof opt.root === 'string' ? opt.root : process.cwd());
const ctx = { root, dir: path.resolve(root, typeof opt.dir === 'string' ? opt.dir : 'docs/tickets'), git: isGitRepo(root) };

const COMMANDS = { init: cmdInit, new: cmdNew, start: cmdStart, log: cmdLog, stop: cmdStop, done: cmdDone, prio: cmdPrio, list: cmdList, lint: cmdLint };
if (!cmd || cmd === 'help' || opt.help) console.log(USAGE);
else if (!COMMANDS[cmd]) fail(`모르는 명령: ${cmd}\n\n${USAGE}`);
else COMMANDS[cmd](ctx, args, opt);
