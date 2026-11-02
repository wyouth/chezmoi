'use strict';
// 把已声明的官方 skill 更新到各上游最新版,并同步进 chezmoi 源目录;上游已删除的会一并移除。
// 之后按所选模式把 ~/.agents 工作副本与 chezmoi 源对齐。
//
// 用法: node ~/.agents/sync-skills.js [--check] [--diff] [--skill NAME]
//                                      [--mode chezmoi|add|raw] [--yes] [--commit] [--push]
//
//   --mode add      （默认，手动）本地为准：同步上游后跑 `chezmoi add --force ~/.agents`
//                   把工作副本收进源，并更新 chezmoi 状态（此后 apply 不会因漂移交互询问）。
//   --mode chezmoi  （手动）源为准：同步上游写进源后跑 `chezmoi apply --force` 把源内容推到 ~。
//                   用在「工作副本还没动、改动都在源里」的场景。
//   --mode raw      纯 Node 双向镜像，不调用 chezmoi CLI。供 run_ 脚本自动调用
//                   （chezmoi apply 期间嵌套 chezmoi 会抢状态库锁而卡死）。
//
//   --check        获取上游并只报告可更新 skill，不改工作副本或 chezmoi 源
//   --diff         在 --check 基础上显示逐文件内容差异
//   --skill NAME   只检查/更新指定 skill；可重复，也可用逗号分隔
//   --yes          跳过交互确认
//   --commit       确认后提交（不推送）
//   --push         确认后提交并推送
// 无 TTY（自动调用）时永不询问、永不提交，只把改动写盘并 git add。
//
// 规则来源: ~/.agents/skills-sources.json（每源: repo / cache / roots / exclude / skills）。
// 更新机制(不依赖 chezmoi CLI 的纯文件操作):
//   1. 逐源浅克隆/拉取上游到 ~/.cache/skills-upstream/<cache>
//   2. 对每个【已声明】skill: 把目标(~/.agents/skills/)与 chezmoi 源
//      (dot_agents/skills/)同时镜像为上游内容(rm+cp,增/改/删全处理)
//   3. retired.skills 里的(上游已弃用)从两处删除
//   4. 三端软链对齐
//   5. 按模式对齐工作副本与源；git add -A（是否提交见上面选项）
// 未声明的本地自建 skill 一律不动。
const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const { ensureLinks } = require('./skill-links.js');

const HOME = require('os').homedir();
const agentsDir = path.join(HOME, '.agents');
const skillsRoot = path.join(agentsDir, 'skills');
const manifestPath = path.join(agentsDir, 'skills-sources.json');
const cacheRoot = path.join(HOME, '.cache', 'skills-upstream');
// chezmoi 默认源目录(本机未自定义 sourceDir)
const sourceRoot = path.join(HOME, '.local', 'share', 'chezmoi');
const sourceSkills = path.join(sourceRoot, 'dot_agents', 'skills');

// ~/.agents 下的这些文件是「工作副本」，需与 chezmoi 源保持一致，避免两份漂移
// （chezmoi apply 在源与目标都不一致时会交互询问，漂移正是触发条件）。
// 格式：[live 文件名, 源目录里的名字]
// 注意：Windows 的 PATHEXT 含 .JS，chezmoi 会把所有 .js 视为可执行 → 源里带 executable_ 前缀。
const AGENT_FILES = [
  ['README.md', 'README.md'],
  ['skills-sources.json', 'skills-sources.json'],
  ['skill-links.js', 'executable_skill-links.js'],
  ['sync-skills.js', 'executable_sync-skills.js'],
  ['link-all.js', 'executable_link-all.js'],
  ['link-skill.js', 'executable_link-skill.js'],
];

// —— 选项解析 ——
const argv = process.argv.slice(2);
function optValue(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
}
function optValues(name) {
  const values = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      values.push(...argv[++i].split(',').map(x => x.trim()).filter(Boolean));
    }
  }
  return values;
}
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--skill' && (!argv[i + 1] || argv[i + 1].startsWith('--'))) {
    console.error('--skill 后必须提供 skill 名称。');
    process.exit(2);
  }
}
const checkOnly = argv.includes('--check') || argv.includes('--diff');
const showDiff = argv.includes('--diff');
const requestedSkills = new Set(optValues('--skill'));
const mode = optValue('--mode', 'add');
if (!['add', 'chezmoi', 'raw'].includes(mode)) {
  console.error(`未知模式: ${mode}（可选 add | chezmoi | raw）`);
  process.exit(2);
}
const assumeYes = argv.includes('--yes');
const wantPush = argv.includes('--push');
const wantCommit = wantPush || argv.includes('--commit');
if (checkOnly && wantCommit) {
  console.error('--check/--diff 不能与 --commit/--push 同时使用。');
  process.exit(2);
}

// 定位 chezmoi CLI：PATH 优先，否则用本机已知安装位置。
function resolveChezmoi() {
  try { execSync('chezmoi --version', { stdio: ['ignore', 'ignore', 'ignore'] }); return 'chezmoi'; }
  catch {}
  for (const c of [path.join(HOME, 'bin', 'chezmoi.exe'), path.join(HOME, '.local', 'bin', 'chezmoi.exe')]) {
    if (fs.existsSync(c)) return `"${c}"`;
  }
  return null;
}
const chezmoiBin = checkOnly || mode === 'raw' ? null : resolveChezmoi();


function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).toString().trim();
}

function githubHttps(repo) {
  const match = repo.match(/^git@github\.com:(.+)$/);
  return match ? `https://github.com/${match[1]}` : repo;
}

function syncCache(repo, cacheDir) {
  const hasRepo = fs.existsSync(path.join(cacheDir, '.git'));
  const sync = (remote, env) => {
    if (!hasRepo) {
      fs.mkdirSync(path.dirname(cacheDir), { recursive: true });
      git(['clone', '--depth', '1', remote, cacheDir], { env });
    } else {
      git(['-C', cacheDir, 'fetch', '--depth', '1', remote, 'HEAD'], { env });
      git(['-C', cacheDir, 'reset', '--hard', 'FETCH_HEAD']);
    }
  };

  try {
    sync(repo, process.env);
  } catch (firstError) {
    if (!hasRepo && fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
    const proxyEnv = {
      ...process.env,
      http_proxy: 'http://127.0.0.1:7890',
      https_proxy: 'http://127.0.0.1:7890',
    };
    try {
      sync(githubHttps(repo), proxyEnv);
    } catch {
      throw firstError;
    }
  }
}

function collect(root, base = '', map = new Map(), exclude = []) {
  if (!fs.existsSync(root)) return map;
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const rel = path.join(base, e.name).replace(/\\/g, '/');
    if (exclude.some(x => rel === x || rel.startsWith(x + '/'))) continue;
    const abs = path.join(root, e.name);
    if (e.isDirectory()) collect(abs, rel, map, exclude);
    else if (e.isFile()) map.set(rel, abs);
  }
  return map;
}

function treesEqual(a, b, exclude) {
  const fa = collect(a, '', new Map(), exclude), fb = collect(b, '', new Map(), exclude);
  if (fa.size !== fb.size) return false;
  for (const [rel, absA] of fa) {
    const absB = fb.get(rel);
    if (!absB || !fs.readFileSync(absA).equals(fs.readFileSync(absB))) return false;
  }
  return true;
}

function fileChanges(oldRoot, newRoot, exclude) {
  const oldFiles = collect(oldRoot, '', new Map(), exclude);
  const newFiles = collect(newRoot, '', new Map(), exclude);
  const names = [...new Set([...oldFiles.keys(), ...newFiles.keys()])].sort();
  const changes = [];
  for (const rel of names) {
    const oldPath = oldFiles.get(rel);
    const newPath = newFiles.get(rel);
    if (!oldPath) changes.push({ status: 'A', rel, oldPath: '/dev/null', newPath });
    else if (!newPath) changes.push({ status: 'D', rel, oldPath, newPath: '/dev/null' });
    else if (!fs.readFileSync(oldPath).equals(fs.readFileSync(newPath))) {
      changes.push({ status: 'M', rel, oldPath, newPath });
    }
  }
  return changes;
}

function shortRef(ref) {
  return ref ? ref.slice(0, 8) : 'none';
}

function printPatch(change) {
  const existing = [change.oldPath, change.newPath].filter(x => x !== '/dev/null');
  if (existing.some(p => fs.readFileSync(p).subarray(0, 8192).includes(0))) {
    console.log(`Binary ${change.status} ${change.rel}`);
    return;
  }
  try {
    git(['diff', '--no-index', '--no-ext-diff', '--unified=3', '--', change.oldPath, change.newPath], {
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (e) {
    if (e.status === 1 && e.stdout) process.stdout.write(e.stdout.toString());
    else throw e;
  }
}

function mirror(src, dest, exclude) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const [rel, abs] of collect(src, '', new Map(), exclude)) {
    const out = path.join(dest, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.copyFileSync(abs, out);
  }
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const knownSkills = new Set(manifest.sources.flatMap(src => src.skills));
for (const name of (manifest.retired && manifest.retired.skills) || []) knownSkills.add(name);
const unknownSkills = [...requestedSkills].filter(name => !knownSkills.has(name));
if (unknownSkills.length) {
  console.error(`来源清单中没有这些 skill: ${unknownSkills.join(', ')}`);
  process.exit(2);
}
if (wantCommit) {
  const alreadyStaged = git(['-C', sourceRoot, 'diff', '--cached', '--name-only']);
  if (alreadyStaged) {
    console.error('chezmoi 仓库已有暂存内容；为避免混入提交，本次未开始更新：\n' + alreadyStaged);
    process.exit(2);
  }
}
const networkErrors = [];
console.log(`源清单: ${manifest.sources.length} 个上游`);

// 1. 逐源克隆/拉取,建立 skill 名 -> 上游目录 映射
const byName = new Map();   // name -> { dir, exclude }
for (const src of manifest.sources) {
  const selectedForSource = src.skills.filter(name => !requestedSkills.size || requestedSkills.has(name));
  if (!selectedForSource.length) continue;
  const cacheDir = path.join(cacheRoot, src.cache);
  let beforeRef = null;
  if (fs.existsSync(path.join(cacheDir, '.git'))) {
    try { beforeRef = git(['-C', cacheDir, 'rev-parse', 'HEAD']); } catch {}
  }
  try {
    syncCache(src.repo, cacheDir);
  } catch (e) {
    networkErrors.push(src.id);
    console.warn(`⚠️ ${src.id}: 拉取失败,沿用本地缓存 (${String(e.message).split('\n')[0]})`);
  }
  let afterRef = null;
  if (fs.existsSync(path.join(cacheDir, '.git'))) {
    try { afterRef = git(['-C', cacheDir, 'rev-parse', 'HEAD']); } catch {}
  }

  let found = 0;
  for (const name of selectedForSource) {
    let hit = null;
    for (const root of src.roots) {
      const cand = path.join(cacheDir, root === '.' ? '' : root, name);
      if (fs.existsSync(path.join(cand, 'SKILL.md'))) { hit = cand; break; }
    }
    if (hit) {
      byName.set(name, {
        dir: hit,
        exclude: src.exclude || [],
        source: src.id,
        beforeRef,
        afterRef,
      });
      found++;
    }
    else console.warn(`⚠️ ${src.id}: 上游已无 skill「${name}」`);
  }
  console.log(`  ${src.id}: 命中 ${found}/${selectedForSource.length} (${shortRef(beforeRef)} -> ${shortRef(afterRef)})`);
}

// 2. 先计算变更；检查模式到此为止，不改工作副本或 chezmoi 源。
const pending = new Map();
for (const [name, up] of byName) {
  const loc = path.join(skillsRoot, name);
  const srcLoc = path.join(sourceSkills, name);
  const changes = fileChanges(loc, up.dir, up.exclude);
  const sourceDrift = !treesEqual(srcLoc, up.dir, up.exclude);
  if (changes.length || sourceDrift) pending.set(name, { ...up, changes, sourceDrift });
}

if (pending.size) {
  console.log(`\n可更新 ${pending.size} 个 skill:`);
  for (const [name, item] of pending) {
    console.log(`\n${name}  [${item.source} @ ${shortRef(item.afterRef || item.beforeRef)}]`);
    if (item.changes.length) {
      for (const change of item.changes) console.log(`  ${change.status} ${change.rel}`);
    } else {
      console.log('  工作副本已是最新，仅 chezmoi 源需要对齐');
    }
    if (showDiff) {
      for (const change of item.changes) printPatch(change);
    }
  }
} else {
  console.log('\n所有选定 skill 已是最新。');
}

if (checkOnly) {
  if (networkErrors.length) {
    console.warn(`\n⚠️ 检查不完整，以下来源拉取失败: ${networkErrors.join(', ')}`);
    process.exitCode = 1;
  }
  process.exit();
}

if (networkErrors.length && mode !== 'raw') {
  console.error(`\n未更新：以下来源拉取失败，拒绝用旧缓存覆盖 skill: ${networkErrors.join(', ')}`);
  process.exit(1);
}

// 3. 镜像更新(目标 + chezmoi 源,两者任一与上游不一致都重写)
const changed = new Set(), removed = new Set();
for (const [name, up] of byName) {
  const loc = path.join(skillsRoot, name);
  const srcLoc = path.join(sourceSkills, name);
  if (!treesEqual(loc, up.dir, up.exclude)) { mirror(up.dir, loc, up.exclude); changed.add(name); }
  if (!treesEqual(srcLoc, up.dir, up.exclude)) { mirror(up.dir, srcLoc, up.exclude); changed.add(name); }
}

// 4. 上游已弃用/删除的 skill:两处一并清除
for (const name of (manifest.retired && manifest.retired.skills) || []) {
  if (requestedSkills.size && !requestedSkills.has(name)) continue;
  for (const p of [path.join(skillsRoot, name), path.join(sourceSkills, name)]) {
    if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); removed.add(name); }
  }
}

// 5. 三端软链对齐(补建新 skill,清除指向已删 skill 的悬挂链接)
const links = ensureLinks({ pruneDangling: true });

// 6. 按模式对齐 ~/.agents 工作副本与 chezmoi 源
const mirrored = [];
function rawMirrorAgentFiles() {
  for (const [liveName, srcName] of AGENT_FILES) {
    const live = path.join(agentsDir, liveName);
    const src = path.join(sourceRoot, 'dot_agents', srcName);
    if (!fs.existsSync(live)) continue;
    const same = fs.existsSync(src) && fs.readFileSync(live).equals(fs.readFileSync(src));
    if (same) continue;
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.copyFileSync(live, src);
    mirrored.push(srcName);
  }
}

if (mode === 'raw' || !chezmoiBin) {
  if (mode !== 'raw' && !chezmoiBin) console.warn('⚠️ 未找到 chezmoi CLI，回退为纯文件镜像（raw）');
  rawMirrorAgentFiles();
} else if (mode === 'add') {
  // 本地为准：把工作副本（含 skills 与脚本/清单/README）收进源，并更新 chezmoi 状态
  const skillTargets = requestedSkills.size
    ? [...requestedSkills].map(name => path.join(skillsRoot, name))
    : [skillsRoot];
  const targets = [...skillTargets, ...AGENT_FILES.map(([n]) => path.join(agentsDir, n))]
    .filter(p => fs.existsSync(p))
    .map(p => `"${p}"`)
    .join(' ');
  console.log(`chezmoi add --force  ${targets.replace(/"/g, '')}`);
  sh(`${chezmoiBin} add --force --secrets ignore ${targets}`);
} else if (mode === 'chezmoi') {
  // 源为准：把源内容推到 home
  console.log('chezmoi apply --force');
  sh(`${chezmoiBin} apply --force`);
}

// 7. 只暂存本次触及的路径，避免把仓库里原有的无关改动混入提交。
const stagePaths = new Set();
for (const name of [...changed, ...removed]) stagePaths.add(`dot_agents/skills/${name}`);
if (mode === 'add' || mode === 'raw') {
  for (const [, srcName] of AGENT_FILES) {
    if (fs.existsSync(path.join(sourceRoot, 'dot_agents', srcName))) {
      stagePaths.add(`dot_agents/${srcName}`);
    }
  }
}
if (fs.existsSync(sourceSkills) && stagePaths.size) {
  git(['-C', sourceRoot, 'add', '-A', '--', ...stagePaths]);
}

if (changed.size) console.log(`已更新 ${changed.size} 个官方 skill: ${[...changed].sort().join(', ')}`);
else console.log('所有官方 skill 已是最新,无变更。');
if (removed.size) console.log(`已移除上游弃用的 skill: ${[...removed].sort().join(', ')}`);
if (links.linked) console.log(`补建软链 ${links.linked} 个。`);
if (links.pruned) console.log(`清除悬挂软链 ${links.pruned} 个。`);
if (mirrored.length) console.log(`镜像到 chezmoi 源: ${mirrored.join(', ')}`);
if (networkErrors.length) console.warn(`⚠️ 有源拉取失败(沿用缓存,可能非最新): ${networkErrors.join(', ')}`);

// 8. 展示本次暂存内容 → 确认 → 提交（可选推送）
const staged = git(['-C', sourceRoot, 'diff', '--cached', '--name-status']);
if (!staged) {
  console.log('chezmoi 源无待提交改动。');
  process.exit(0);
}
console.log('\n待提交改动（chezmoi 源）:\n' + staged);

const interactive = !assumeYes && process.stdin.isTTY === true;
function confirm(question) {
  process.stdout.write(question + ' [y/N] ');
  try {
    const buf = Buffer.alloc(256);
    const n = fs.readSync(0, buf, 0, buf.length, null);
    const ans = buf.toString('utf8', 0, n).trim().toLowerCase();
    return ans === 'y' || ans === 'yes';
  } catch {
    return false;
  }
}

if (!wantCommit) {
  if (process.stdin.isTTY) console.log('\n未提交（加 --commit 提交，--push 提交并推送）。');
  process.exit(0);
}
if (!interactive && !assumeYes) {
  console.log('\n未提交：提交需要交互确认，当前无 TTY。确需非交互提交请显式加 --yes。');
  process.exit(0);
}
if (interactive && !confirm('\n确认无误，提交' + (wantPush ? '并推送' : '') + '？')) {
  console.log('已取消，改动保留在 chezmoi 源（未提交）。');
  process.exit(0);
}

sh(`git -C "${sourceRoot}" commit -m "chore: sync skills to upstream latest"`);
console.log('已提交。');
if (wantPush) {
  sh(`git -C "${sourceRoot}" push`);
  console.log('已推送。');
} else {
  console.log('推送：chezmoi cd && git push');
}
