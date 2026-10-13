'use strict';
// 把一个 canonical skill 链接到各 agent 目录（幂等）。
// 用法: node ~/.agents/link-skill.js <skill-name>
// 注：Skill 目录本身在 canonical 里；这里只负责建链，逻辑与 link-all.js 共用 skill-links.js。
const fs = require('fs');
const path = require('path');
const os = require('os');
const { ensureLinks, canonicalNames } = require('./skill-links.js');

const name = process.argv[2];
if (!name) { console.error('用法: node link-skill.js <skill-name>'); process.exit(1); }

const canon = path.join(os.homedir(), '.agents', 'skills', name);
if (!fs.existsSync(canon)) { console.error('canonical 不存在: ' + canon); process.exit(1); }

ensureLinks({ pruneDangling: false });
console.log(canonicalNames().length + ' 个 canonical skill 已对齐三端。');
