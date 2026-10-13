# 全局 Skills 管理规则

本机所有 agent 的 skill 收敛到**唯一真身 + 软链**，规则如下，照此执行即可避免多处混乱。

## 唯一真身

```
~/.agents/skills/<skill-name>/SKILL.md      ← 只在这里增删改
```

## 各 agent 目录（全部是指向真身的 junction，勿手改）

| Agent | 目录 | 说明 |
|---|---|---|
| Claude Code | `~/.claude/skills/` | 35 个 junction |
| Codex | `~/.codex/skills/` | 35 个 junction；`.system/` 是 Codex 官方内置，**勿动** |
| Cursor | `~/.cursor/skills/` | 35 个 junction；`skills-cursor/`（同级目录）是 Cursor 官方同步，**勿动** |
| Pi | 不设 skill 目录 | `~/.pi/agent/settings.json` 的 `skills` 指向 `~/.codex/skills` 与 `~/.claude/skills` |

> 因为三端目录都是链接，**改一次 canonical，三个 agent 同时生效**。

## 五条规则

1. **只在一处增删改**：`~/.agents/skills/`。不要往各 agent 目录里放文件。
2. **官方 skill 走清单同步**（见下）：`skills-sources.json` 声明来源，`sync-skills.js` 拉取上游最新并覆盖；上游删除的自动移除。
3. **自建 skill**：在 `~/.agents/skills/` 下建目录放 `SKILL.md`，再跑 `node ~/.agents/link-all.js` 给三端建链。清单里没声明的 skill **永远不会被同步覆盖或删除**。
4. **不要再用 `npx skills update` / cc-switch / SkillsGate 管理这些 skill**（见文末「已停用的其他技能管理器」），以免与「唯一真身 + 软链」互相覆盖。
5. **软链即 `link-all.js` 的产物**：新增或删除 canonical 后跑一次 `node ~/.agents/link-all.js` 对齐三端（幂等，顺带清除悬挂链接）。

## 官方 skill 来源清单（`~/.agents/skills-sources.json`）

| 上游仓库 | 管理的 skill |
|---|---|
| `mattpocock/skills`（SSH） | 27 个：ask-matt、code-review、codebase-design、diagnosing-bugs、domain-modeling、grill-me、grill-with-docs、grilling、handoff、implement、implement-spec、improve-codebase-architecture、pr、prototype、research、retro、setup-matt-pocock-skills、tdd、teach、to-questionnaire、to-spec、to-tickets、triage、wait-what、wayfinder、wizard、writing-for-agents |
| `vercel-labs/skills` | find-skills |
| `typesafe-ai/skills` | typesafe-ai |
| `charlie947/show-me` | show-me |
| `KKKKhazix/khazix-skills` | neat-freak（排除上游 `evals/` 测试夹具） |

本地自建、不由任何上游提供的 skill：`chezmoi`、`git-sync-push`、`hermes-log`、`test-review-daily`——**不写进清单**，永不被同步覆盖或删除。

`chezmoi`（手动 `/chezmoi`，也可由模型在改全局配置前自动加载）是「改全局配置」的统一入口：改全局配置 / 全局规则（`~/.claude/CLAUDE.md`）/ agent 全局目录前都先走它，真身在 chezmoi 源目录 `~/.local/share/chezmoi`，`~` 下只是 apply 出来的副本。

### 更新官方 skill（自动 + 手动）

```bash
# 手动（更新内容 + 对齐三端软链，不提交）
node ~/.agents/sync-skills.js

# 手动并直接 commit
node ~/.agents/sync-skills.js --commit

# 自动：chezmoi apply 时由 run_sync-skills.ps1 触发
chezmoi apply
```

机制（`sync-skills.js`，不依赖 chezmoi CLI，避免 apply 期间嵌套调用死锁）：

1. 逐源浅克隆/拉取上游到 `~/.cache/skills-upstream/<cache>`；
2. 对清单里每个 skill，把 **目标**（`~/.agents/skills/`）与 **chezmoi 源**（`dot_agents/skills/`）同时镜像为上游内容（`rm`+`cp`，增/改/删全处理）；
3. `retired.skills`（上游已弃用）从两处删除，例如 `resolving-merge-conflicts`；
4. 跑 `ensureLinks()` 对齐三端 junction（补建新 skill、清除悬挂链接）；
5. 把 `~/.agents/` 下这些**工作副本**镜像进 chezmoi 源（消除漂移，否则 `chezmoi apply` 会因「源与目标都改了」而交互询问）：`README.md`、`skills-sources.json`、`skill-links.js`、`sync-skills.js`、`link-all.js`、`link-skill.js`；
6. `git add -A dot_agents`，纳入版本控制（除非 `--commit` 否则不提交）。

所以**日常只需改 `~/.agents/` 下的文件，再跑一次 `node ~/.agents/sync-skills.js`**，源目录会被自动对齐。

同步后记得 `chezmoi cd && git push`。某一源网络失败时沿用本地缓存并告警，不会中断其余源。

关闭自动同步：在 chezmoi 源目录重命名/删除 `run_sync-skills.ps1` 并 commit。

### 增删官方 skill

- **加**：在 `skills-sources.json` 对应源的 `skills` 数组里加名字，跑 `node ~/.agents/sync-skills.js`，会自动下载并建链。
- **删**：从数组移除；若是「上游彻底删掉」的 skill，改记入 `retired.skills` 以便下次同步清除本地残留。
- **改工作副本**：改 `~/.agents/` 下的 README / 脚本 / 清单后跑一次 `node ~/.agents/sync-skills.js` 让它镜像进 chezmoi 源（见上面第 5 步），再 `chezmoi cd && git push`。
- 全局配置的通用流程（含模板、`chezmoi add`、危险动作边界）见 skill `~/.agents/skills/chezmoi/`（手动 `/chezmoi`）。

## 已停用的其他技能管理器（2026-10-13）

本机另有两个 GUI 也管理 skill，已停用，以免与「唯一真身 + 软链」互相覆盖：

| 应用 | 原本行为 | 已做的处理 |
|---|---|---|
| **cc-switch** | 自建于 `~/.cc-switch/skills/`，按 app 启用矩阵推送到 **codex / grokbuild**，并重写 `~/.agents/.skill-lock.json` | 清空其 `skills` 表（24→0）、停用全部 `skill_repos`，并删除 `~/.cc-switch/skills/` |
| **SkillsGate** | base 路径 `~/.agents/skills`，向 **claude-code / cursor / codex-cli** 写入 | 清空其 `settings.agents.active` |

> ⚠️ **若日后在任一应用里重新启用技能，请勿同时使用**——它们会重建目录、清掉"不认得"的条目。
> 备份：`~/skill-backup-20261013-101646/`（含两应用的 db 与 settings）。

## 回滚

迁移前的完整备份位于 `~/skill-backup-20261013-101646/`（含各 agent 原始 skills、cc-switch 与 pi 配置）。
