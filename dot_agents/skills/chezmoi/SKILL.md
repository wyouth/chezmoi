---
name: chezmoi
description: 管理本机全局配置（dotfiles）的唯一入口。任何要新增/修改/删除「全局配置」的动作都必须走本 skill：全局配置文件、agent 全局规则（~/.codex/AGENTS.md）、Cursor 全局规则（~/.cursor/rules/）、Claude 专用规则（~/.claude/CLAUDE.md）、agent 全局目录（~/.agents/**、~/.claude、~/.codex、~/.cursor）、shell/npm/git 全局配置，真身都在 chezmoi 源目录。MUST trigger when the user says "/chezmoi", "改全局配置", "全局设置", "加到 dotfiles", "chezmoi", "同步 dotfiles", "这台机器的配置", "全局 skill 配置", or when you are about to edit any file under the user's home that chezmoi already manages. Also trigger before running `chezmoi apply`. 手动调用：/chezmoi；自动调用：模型在改全局配置前自行加载。
---

# chezmoi — 全局配置的唯一入口

本机所有「全局配置」由 chezmoi 管理：**真身在源目录，`~` 下的是它 apply 出来的副本**。
直接改 `~` 下的文件 = 改了副本，下次 `chezmoi apply` 会被覆盖，且不会被版本控制记录。

## 0. 先摸清现状（只读，永远第一步）

```bash
chezmoi source-path      # 源目录（本机：C:\Users\wv\.local\share\chezmoi）
chezmoi status           # 源与目标的差异摘要
chezmoi diff             # 具体差异（不写盘）
chezmoi managed          # 当前被管理的全部文件
```

> 本机 chezmoi 装在 `C:\Users\wv\bin\chezmoi.exe`。**新开的终端**里 `chezmoi` 通常能直接解析（WinGet 的 PATH 目录）；若当前进程 PATH 是旧的或报 `command not found`，用全路径 `C:\Users\wv\bin\chezmoi.exe`。

## 1. 本机映射表（源目录文件 → 目标）

| 源目录（`~/.local/share/chezmoi/`） | 部署到 | 说明 |
|---|---|---|
| `dot_agents/` | `~/.agents/` | skill 真身与脚本（见 2） |
| `dot_codex/AGENTS.md` | `~/.codex/AGENTS.md` | Codex 全局规则（如 TypeSafe 门禁） |
| `dot_cursor/rules/` | `~/.cursor/rules/` | Cursor 全局规则（`.mdc`，如 TypeSafe 门禁） |
| `dot_claude/CLAUDE.md` | `~/.claude/CLAUDE.md` | Claude 专用：代理用法、失败处理 |
| `dot_gitconfig` | `~/.gitconfig` | git 全局配置 |
| `dot_npmrc` | `~/.npmrc` | npm 全局配置 |
| `dot_config/git/ignore` | `~/.config/git/ignore` | git 全局 gitignore |
| `run_sync-skills.ps1` | —（不部署） | `chezmoi apply` 后自动执行的 run_ 脚本 |

命名规则：`dot_` 前缀 = 前置 `.`；`executable_` 前缀 = 加可执行位；`run_*.{ps1,sh}` = 每次 apply 后执行；`private_` = 0600；`*.tmpl` = Go 模板。

## 2. skill 目录的特殊规则

`~/.agents/skills/` 是 canonical 真身，三端（claude/codex/cursor）是指向它的 junction。
**官方 skill 用清单同步，不要手改**（清单 `~/.agents/skills-sources.json`；本地自建 skill 不在清单里，永不被覆盖）：

```bash
# 本地为准（默认）：同步上游 → chezmoi add --force 把工作副本收进源并记账
node ~/.agents/sync-skills.js --mode add            # 只会写盘 + git add
node ~/.agents/sync-skills.js --mode add --commit    # 跑完列改动，确认后提交
node ~/.agents/sync-skills.js --mode add --push      # 提交并推送

# 源为准：同步上游写进源 → chezmoi apply --force 把源内容推到 ~
node ~/.agents/sync-skills.js --mode chezmoi

node ~/.agents/link-all.js                           # 单独对齐三端软链（幂等）
```

选项：`--mode add|chezmoi|raw`、`--yes`、`--commit`、`--push`。无 TTY 时永不询问、永不提交。
`run_sync-skills.ps1` 会在**每次 `chezmoi apply`** 时以 `--mode raw`（纯文件镜像，不调 chezmoi CLI——apply 期间嵌套调 chezmoi 会抢状态库锁卡死）自动跑一次同步。

## 3. 改全局配置的标准流程

1. **只读确认**：`chezmoi status` / `chezmoi diff`，看清现有状态与将要发生的覆盖。
2. **改源，不改副本**，二选一：
   - 直接编辑源目录里的 `dot_*` 文件（推荐，一次到位）；或
   - 先改 `~` 下的文件，再 `chezmoi add <路径>` 把它收进源。
   - 新增文件同样用 `chezmoi add <路径>`（会按规则生成 `dot_*` 名）。
3. **干跑**：`chezmoi apply -n -v` 看会写哪些文件。
4. **落地**：`chezmoi apply`（会覆盖 `~` 下对应副本，并触发 run_ 脚本）。
5. **提交并推送（默认）**：`chezmoi cd` → `git add -A && git commit -m "..." && git push`
   （远程 `git@github.com:wyouth/chezmoi.git`，SSH，已验证可用）。
   **提交后默认 `git push`，不要等用户再说「推一下」**；仅当用户明确说不要推、或 push 失败时才停下来说明。

## 4. 边界与危险动作

- **绝不**直接编辑 `~/.claude/skills/*`、`~/.codex/skills/*`、`~/.cursor/skills/*`——那是软链；改 canonical。`.codex/skills/.system`、`.cursor/skills-cursor` 是 agent 官方内置，勿动。
- `chezmoi apply` 会用源内容覆盖目标副本；对目标文件做过的本地修改会被丢弃。动 `apply` 前**先 `diff`**。
- 删除全局配置：改源目录（删对应 `dot_*` 文件）再 `chezmoi apply`；不要只在 `~` 下删。
- 需要交互确认的一次性/危险操作，先向用户说明影响再执行。
- 只处理本 skill 触发范围内的全局配置；项目内的文件不归 chezmoi 管。
