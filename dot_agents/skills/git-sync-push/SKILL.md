---
name: git-sync-push
description: 手动同步本地改动并推送——先 stash 保全，再 merge pull，处理冲突后一次性给出确认包，用户确认后再 commit 并 push。
disable-model-invocation: true
---

# Git Sync Push

两阶段流程：**阶段 A 只准备并停住**；**阶段 B 仅在用户确认后**才 commit 并 push。

## 硬约束

- 阶段 A 结束前：不 `commit`、不 `push`、不 `--force`。
- 阶段 B：用户明确确认后，才一次性 `commit` + `push`。
- 不改 git config；不用 `-i`；不用 `--no-verify`（除非用户明确要求）。
- 不提交疑似密钥文件（`.env`、`credentials.json` 等）；若用户点名要提交，先警告。

## 阶段 A — 准备（停住等确认）

按序执行；每步失败则停止并说明原因与可选回滚。

### 1. 摸清现状

并行执行：

- `git status`
- `git diff` / `git diff --staged`
- `git branch -vv`（看 upstream）
- `git log -5 --oneline`（对齐近期风格，但文案仍用下方全局默认格式）

完成标准：已知当前分支、是否跟踪远端、本地改动范围、是否已有冲突/rebase 进行中。

### 2. 保全本地改动

有未提交改动时：

```bash
git stash push -u -m "git-sync-push: wip before pull"
```

无改动则跳过 stash，并在确认包里注明。

完成标准：工作区干净，或已明确记录 stash ref（`stash@{0}` 等）。

### 3. 拉取（merge）

```bash
git pull --no-rebase
```

完成标准：pull 成功，或已进入可处理的 merge 冲突状态（不是未知失败）。

### 4. 恢复本地改动

若步骤 2 做了 stash：

```bash
git stash pop
```

`stash pop` 产生冲突时，保留冲突标记，进入步骤 5。pop 失败且 stash 仍在时，不要丢弃该 stash。

完成标准：本地改动已叠回，或冲突文件列表已完整列出。

### 5. 合并冲突

对每个冲突文件：

| 情况 | 动作 |
|------|------|
| 语义明确（格式-only、明显一方过时、机械合并） | 直接解完并 `git add` |
| 业务语义不明、删改意图冲突、两端逻辑都可能对 | **不猜**；列入待确认 |

完成标准：可自动项已全部解决并暂存；不确定项路径 + 双方差异摘要已备好。

### 6. 生成确认包（必须输出后停住）

一次性输出以下结构，然后**停止，等待用户确认**：

```markdown
## 待办 / 结果确认包

### 同步摘要
- 分支：
- 远端：
- stash：已做 / 未做（ref：）
- pull：成功 / 冲突中
- stash pop：成功 / 冲突 / 未执行

### 已自动合并
- `path`：做了什么（一句话）

### 待你处理的冲突
- `path`：冲突要点 + 请你决定保留哪边或怎么合
（若无：写「无」）

### 将纳入本次提交的变更
- 文件列表（含新增/修改/删除）
- 排除项（若有，说明原因）

### 拟 commit 信息
类型（模块）：内容

### 拟执行
- [ ] 按你的冲突决定完成合并
- [ ] `git add` 相关文件
- [ ] `git commit`
- [ ] `git push`

请确认：回复「确认」或逐条修正（commit 文案、排除文件、冲突决定）。
```

完成标准：确认包已发出，且尚未执行 commit/push。

## 阶段 B — 确认后提交并推送

仅当用户明确确认（或给出可执行的逐条修正）后继续。

1. 按用户意见完成剩余冲突；用户说已手改的文件，重新读盘并 `git add`。
2. 再次 `git status`，确认无未解决冲突、无意外文件。
3. 按确认包中的（或用户改过的）信息一次性 commit。
4. `git push`（跟踪已有 upstream；若无 upstream，先说明将使用的 `-u` 目标并仅在用户已同意时执行）。
5. 回报：commit hash、push 结果、残留 stash（若有）。

完成标准：`git status` 干净（或仅剩有意保留的未提交文件），且 push 已成功或已说明失败原因。

## Commit 文案（全局默认）

格式：`类型（模块）：内容`

- **类型**：`feature` | `fix` | `refactor` | `docs` | `test` | `chore`
- **模块**：短英文标识（如 `frontend`、`backend`、`deploy`）
- **内容**：中文，说明为什么改 / 改动要点

示例：`feature（frontend）：增加任务列表筛选`

依据 `git diff` 起草 1 条信息，放入确认包；用户可改后再提交。

## 失败与回滚

| 场景 | 处理 |
|------|------|
| pull 失败（网络/权限） | 停止；若已 stash，说明用 `git stash pop` 恢复 |
| merge 无法自动解决 | 保留冲突，写入确认包「待你处理」 |
| stash pop 冲突 | 不 drop stash（若仍存在）；列出冲突文件 |
| push 被拒绝 | 不 force；说明需再 pull 或用户决策 |
| 用户放弃 | 不 commit/push；说明如何 `stash pop` / `merge --abort`（仅在 merge 未完成且安全时） |

## 禁止

- 阶段 A 偷偷 commit/push
- 无确认就 push
- `push --force` / `reset --hard`（除非用户在本轮明确要求）
- 把确认包拆成多次零散提问（冲突不确定项可列在包内，一次性问清）
