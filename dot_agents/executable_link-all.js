'use strict';
// 把 ~/.agents/skills/ 下所有 canonical skill 链接到各 agent 目录（幂等，并清除悬挂链接）。
// 用法: node ~/.agents/link-all.js
const { ensureLinks, canonicalNames } = require('./skill-links.js');

const names = canonicalNames();
if (!names.length) {
  console.error('canonical 目录为空或不存在: ~/.agents/skills');
  process.exit(1);
}
const { linked, pruned, skipped } = ensureLinks({ pruneDangling: true });
console.log(`完成: canonical ${names.length} 个，新建 ${linked} 个链接, 清除悬挂 ${pruned} 个, 跳过 ${skipped} 个(已存在)。`);
