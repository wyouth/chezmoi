---
name: skill-manager
description: 管理由来源清单跟踪的全局 agent skills。用于检查 skill 是否有上游更新、查看逐文件或完整内容差异，以及更新指定或全部 skills；不用于安装来源清单之外的新 skill。
---

# Skill Manager

使用 `~/.agents/sync-skills.js` 管理 `~/.agents/skills-sources.json` 中声明的 skills。工作副本是 `~/.agents/skills/`，版本化真身在 chezmoi 源目录。

## 选择操作

| 用户目标 | 命令 |
| --- | --- |
| 检查全部更新 | `node ~/.agents/sync-skills.js --check` |
| 查看全部更新内容 | `node ~/.agents/sync-skills.js --check --diff` |
| 检查指定 skill | `node ~/.agents/sync-skills.js --check --skill <name>` |
| 查看指定 skill 的更新内容 | `node ~/.agents/sync-skills.js --check --diff --skill <name>` |
| 更新全部 | `node ~/.agents/sync-skills.js --mode add` |
| 更新指定 skill | `node ~/.agents/sync-skills.js --mode add --skill <name>` |

`--skill` 可重复，也接受逗号分隔的名字。

## 工作流

状态或版本问题只运行 `--check`；用户询问“更新了什么”时加 `--diff`。报告来源提交变化、可更新 skill、文件状态和网络失败；网络失败时不要把缓存结果称为最新。

更新请求先运行同范围的 `--check --diff`，确认实际差异和 chezmoi 仓库状态，再执行更新命令。用户已经明确要求更新时，检查完成后直接更新；范围不明确时以用户点名的 skill 为准，明确说“全部”才更新全部。

更新会同时对齐工作副本与 chezmoi 源，并只暂存本次触及的路径。用户要求提交或同步 dotfiles 时使用 `--commit` 或 `--push`；仓库已有暂存内容时脚本会拒绝开始提交型更新，先报告这些路径并保留现场。

完成后报告：已检查的来源、更新的 skill、主要内容变化、提交或推送结果，以及仍存在的本地改动。自建且未列入来源清单的 skill 保持原样。
