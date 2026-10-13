'use strict';
// 把一个 canonical skill 链接到各 agent 目录（幂等）。
// 用法: node ~/.agents/link-skill.js <skill-name>
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const name = process.argv[2];
if (!name) { console.error('用法: node link-skill.js <skill-name>'); process.exit(1); }

const canon = path.join(HOME, '.agents', 'skills', name);
if (!fs.existsSync(canon)) { console.error('canonical 不存在: ' + canon); process.exit(1); }

for (const dir of ['.claude/skills', '.codex/skills', '.cursor/skills']) {
  const link = path.join(HOME, dir, name);
  try {
    if (fs.lstatSync(link)) { console.log('已存在, 跳过: ' + link); continue; }
  } catch {}
  fs.symlinkSync(canon, link, 'junction');
  console.log('linked ' + link);
}
console.log('完成。');
