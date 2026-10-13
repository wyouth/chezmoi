'use strict';
// 把已声明的官方 skill 更新到各上游最新版,并同步进 chezmoi 源目录;上游已删除的会一并移除。
//
// 手动: node ~/.agents/sync-skills.js [--commit]
// 自动: chezmoi apply 时由 run_sync-skills.ps1 调用。
//
// 规则来源: ~/.agents/skills-sources.json（每源: repo / cache / roots / exclude / skills）。
// 机制(不依赖 chezmoi CLI,避免 apply 期间嵌套调用死锁):
//   1. 逐源浅克隆/拉取上游到 ~/.cache/skills-upstream/<cache>
//   2. 对每个【已声明】skill: 把目标(~/.agents/skills/)与 chezmoi 源
//      (dot_agents/skills/)同时镜像为上游内容(rm+cp,增/改/删全处理)
//   3. retired.skills 里的(上游已弃用)从两处删除
//   4. git add -A 源目录,纳入版本控制(不提交,除非 --commit)
// 未声明的本地自建 skill 一律不动。
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ensureLinks } = require('./skill-links.js');

const HOME = require('os').homedir();
const skillsRoot = path.join(HOME, '.agents', 'skills');
const manifestPath = path.join(HOME, '.agents', 'skills-sources.json');
const cacheRoot = path.join(HOME, '.cache', 'skills-upstream');
// chezmoi 默认源目录(本机未自定义 sourceDir)
const sourceRoot = path.join(HOME, '.local', 'share', 'chezmoi');
const sourceSkills = path.join(sourceRoot, 'dot_agents', 'skills');

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
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
const networkErrors = [];
console.log(`源清单: ${manifest.sources.length} 个上游`);

// 1. 逐源克隆/拉取,建立 skill 名 -> 上游目录 映射
const byName = new Map();   // name -> { dir, exclude }
for (const src of manifest.sources) {
  const cacheDir = path.join(cacheRoot, src.cache);
  try {
    if (!fs.existsSync(path.join(cacheDir, '.git'))) {
      fs.mkdirSync(cacheDir, { recursive: true });
      sh(`git clone --depth 1 ${src.repo} "${cacheDir}"`);
    } else {
      sh(`git -C "${cacheDir}" fetch --depth 1 origin HEAD`);
      sh(`git -C "${cacheDir}" reset --hard FETCH_HEAD`);
    }
  } catch (e) {
    networkErrors.push(src.id);
    console.warn(`⚠️ ${src.id}: 拉取失败,沿用本地缓存 (${String(e.message).split('\n')[0]})`);
  }

  let found = 0;
  for (const name of src.skills) {
    let hit = null;
    for (const root of src.roots) {
      const cand = path.join(cacheDir, root === '.' ? '' : root, name);
      if (fs.existsSync(path.join(cand, 'SKILL.md'))) { hit = cand; break; }
    }
    if (hit) { byName.set(name, { dir: hit, exclude: src.exclude || [] }); found++; }
    else console.warn(`⚠️ ${src.id}: 上游已无 skill「${name}」`);
  }
  console.log(`  ${src.id}: 命中 ${found}/${src.skills.length}`);
}

// 2. 镜像更新(目标 + chezmoi 源,两者任一与上游不一致都重写)
const changed = new Set(), removed = new Set();
for (const [name, up] of byName) {
  const loc = path.join(skillsRoot, name);
  const srcLoc = path.join(sourceSkills, name);
  if (!treesEqual(loc, up.dir, up.exclude)) { mirror(up.dir, loc, up.exclude); changed.add(name); }
  if (!treesEqual(srcLoc, up.dir, up.exclude)) { mirror(up.dir, srcLoc, up.exclude); changed.add(name); }
}

// 3. 上游已弃用/删除的 skill:两处一并清除
for (const name of (manifest.retired && manifest.retired.skills) || []) {
  for (const p of [path.join(skillsRoot, name), path.join(sourceSkills, name)]) {
    if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); removed.add(name); }
  }
}

// 4. 三端软链对齐(补建新 skill,清除指向已删 skill 的悬挂链接)
const links = ensureLinks({ pruneDangling: true });

// 5. 纳入版本控制(原子处理增/改/删)
if (fs.existsSync(sourceSkills)) {
  sh(`git -C "${sourceRoot}" add -A dot_agents/skills dot_agents/skills-sources.json`);
}

if (changed.size) console.log(`已更新 ${changed.size} 个官方 skill: ${[...changed].sort().join(', ')}`);
else console.log('所有官方 skill 已是最新,无变更。');
if (removed.size) console.log(`已移除上游弃用的 skill: ${[...removed].sort().join(', ')}`);
if (links.linked) console.log(`补建软链 ${links.linked} 个。`);
if (links.pruned) console.log(`清除悬挂软链 ${links.pruned} 个。`);
if (networkErrors.length) console.warn(`⚠️ 有源拉取失败(沿用缓存,可能非最新): ${networkErrors.join(', ')}`);

if (process.argv.includes('--commit')) {
  sh(`git -C "${sourceRoot}" commit -m "chore: sync skills to upstream latest"`);
  console.log('已提交。记得 push: chezmoi cd && git push');
}
