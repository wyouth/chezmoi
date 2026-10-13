'use strict';
// 共享：把 canonical skill(~/.agents/skills/<name>) 与三端 agent 目录对齐（幂等）。
//   - 缺失的软链补建（junction）
//   - 指向已消失 canonical 的悬挂软链删除
// 供 link-all.js 与 sync-skills.js 复用，避免逻辑分叉。
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const CANON_ROOT = path.join(HOME, '.agents', 'skills');
const AGENT_DIRS = ['.claude/skills', '.codex/skills', '.cursor/skills'];

function canonicalNames() {
  if (!fs.existsSync(CANON_ROOT)) return [];
  return fs.readdirSync(CANON_ROOT)
    .filter(n => {
      try { return fs.statSync(path.join(CANON_ROOT, n)).isDirectory(); } catch { return false; }
    })
    .sort();
}

// 返回 { linked, pruned, skipped }；pruneDangling=false 时只补建不删除。
function ensureLinks({ pruneDangling = true } = {}) {
  const names = canonicalNames();
  const wanted = new Set(names);
  let linked = 0, pruned = 0, skipped = 0;

  for (const rel of AGENT_DIRS) {
    const dir = path.join(HOME, rel);
    fs.mkdirSync(dir, { recursive: true });

    // 1. 补建缺失链接
    for (const name of names) {
      const link = path.join(dir, name);
      let exists = false;
      try { fs.lstatSync(link); exists = true; } catch {}
      if (exists) { skipped++; continue; }
      fs.symlinkSync(path.join(CANON_ROOT, name), link, 'junction');
      linked++;
      console.log('linked ' + link);
    }

    // 2. 只删悬挂链接：本身是软链/junction 且目标已不存在。
    //    绝不删真实目录或有效链接，agent 官方目录不受影响。
    if (pruneDangling) {
      for (const entry of fs.readdirSync(dir)) {
        if (wanted.has(entry)) continue;
        const link = path.join(dir, entry);
        let st;
        try { st = fs.lstatSync(link); } catch { continue; }
        if (!st.isSymbolicLink()) continue;      // 真实目录/文件，不碰
        if (fs.existsSync(link)) continue;       // 链接有效，不碰
        try {
          try { fs.unlinkSync(link); } catch { fs.rmdirSync(link); } // junction 视实现走 unlink 或 rmdir
          pruned++;
          console.log('pruned ' + link);
        } catch (e) {
          console.warn('⚠️ 无法删除悬挂链接 ' + link + '：' + e.message);
        }
      }
    }
  }
  return { linked, pruned, skipped };
}

module.exports = { ensureLinks, canonicalNames, CANON_ROOT, AGENT_DIRS, HOME };
