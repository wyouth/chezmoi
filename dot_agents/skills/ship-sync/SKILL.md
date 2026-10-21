---
name: ship-sync
description: 同步本地改动并推送。默认手动：拉取前 code-review 硬门禁，通过后确认包，用户确认再 commit/push。参数 auto：自动审核，按需 neat-freak，修阻塞项，默认最多 3 轮；再加 force 则最多 5 轮，通过后直接 commit 并 push。
disable-model-invocation: true
---

# Ship Sync

原名 `git-sync-push`；调用用 `/ship-sync`。

## 模式选择

在动手前判定模式与门禁轮次上限（整次调用只选一次）：

| 调用 | 模式 | `maxRounds` |
| --- | --- | --- |
| `/ship-sync`（无参） | **manual**（默认） | （无闭环） |
| `/ship-sync auto` / `/ship-sync --auto` | **auto** | **3**（默认） |
| `/ship-sync auto force` / `/ship-sync --auto --force` / `/ship-sync auto --force` | **auto** | **5** |

- **manual**：阶段 A 只准备并停住；阶段 B 仅在用户确认后才 commit + push。
- **auto**：自动门禁与修复闭环（默认最多 **3** 轮；调用含 `force` / `--force` 时最多 **5** 轮）；门禁通过且无待决冲突后，**直接**走阶段 B（视为用户已确认），不再等「确认」回复。
- **ship-sync 的 `force`**：只放大 auto 门禁轮次上限；**不等于**授权 `git push --force` / `reset --hard`。

## 硬约束

- 不改 git config；不用 `-i`；不用 `--no-verify`（除非用户明确要求）。
- 不提交疑似密钥文件（`.env`、`credentials.json` 等）；若用户点名要提交，先警告。
- **拟提交 = 工作区全部本地改动**（见下节）：不是「本次功能范围内的文件」、不是「与主题相关的子集」；除非用户另有说明，一次 ship-sync 提交工作区里能看见的全部合法改动。
- **manual**：阶段 A 结束前不 `commit`、不 `push`、不 `git push --force`；门禁未通过则硬停（不 stash、不 pull、不生成可继续同步的确认包）。
- **auto**：允许在闭环内改代码/文档以消除阻塞；**通过门禁且无待决冲突之前**仍不 `commit`/`push`；通过后直接阶段 B。`git push --force` / `reset --hard` 仍禁止（除非用户本轮明确要求）。
- 用户明确「忽略门禁继续」时，两种模式均可跳过未通过的门；须在摘要/确认包中标注已忽略及原因。

## 拟提交集合（全部本地文件，非「范围内」）

**定义**：`git status -u` 列出的全部 **modified / staged / deleted / untracked**（含新增目录下每一个文件）。  
**默认动作**：上述集合 **100% 进入**拟提交清单，并在阶段 B 全部 `git add`。

禁止用下列理由缩小集合（即便写进门禁结论也不行）：

- 「不在本次功能范围 / 另开 PR / 主题无关 / Speculative Generality」
- 「只是设计文档 / 半成品 / 应单独提交」
- 用户未说「只提交某某」时，自行按路径前缀或模块做范围筛选

| 唯一可自动排除（写入「排除项」并说明） | 其余一律纳入 |
| --- | --- |
| 疑似密钥（`.env`、`credentials.json`、含明文 secret 的本地配置） | 任意 docs、设计稿、源码、测试、migration、未跟踪新文件等 |
| 明确构建/运行时产物（`dist/`、`*.map`、日志、临时目录等，且通常已被 ignore） | 用户未点名排除的一切路径 |
| 用户在本轮**已点名**排除的路径 | — |

- 用户若说「只提交 X」或「排除 Y」，才按用户指令收缩；未说则全量。
- 门禁只审全量集合的质量（通过/硬停），**不得**把「建议缩小提交范围」当成默认可执行计划；确认包不设「建议排除」栏（除非用户先问「哪些可拆」）。
- 阶段 B `git add` 前再跑 `git status -u`：仍 `??` / 未暂存却属于全量集合的路径必须补 add；漏加视为流程失败。

---

## Manual — 阶段 A（准备，停住等确认）

按序执行；每步失败则停止并说明原因与可选回滚。

**顺序不可颠倒**：摸清现状 → 门禁（硬停）→ 再保全/拉取 → 再合并冲突 → 最后确认包。

### A1. 摸清现状

并行执行：

- `git status -u`（未跟踪文件须完整列出，勿只显示目录名就漏文件）
- `git diff` / `git diff --staged`
- `git branch -vv`（看 upstream）
- `git log -5 --oneline`（对齐近期风格，但文案仍用下方全局默认格式）

完成标准：已知当前分支、是否跟踪远端、**工作区全部本地改动清单**（含全部 untracked，非功能范围子集）、是否已有冲突/rebase 进行中。

### A2. 门禁（拉取之前；未通过则硬停）

在 stash / pull 之前审查**工作区全部拟提交改动**（`git diff` + `git diff --staged`，**含全部未跟踪文件**；不是「范围内」子集）。固定点：当前 upstream（`@{u}`）；无 upstream 时用 `HEAD`。审查对象是工作区相对该基线的全量内容，不是「已提交的 HEAD 三点 diff」 alone——未提交 hunk 与未跟踪新文件必须纳入审查。

#### code-review（始终执行）

- 读取并遵循同目录旁的 `code-review` skill（`~/.agents/skills/code-review/SKILL.md`）。
- 无独立 spec 时：Spec 轴记「无 spec」，以 Standards + 风险为主；不阻塞流程去追问 spec，除非用户事先指定了路径。
- 无本地改动可审时：记「无本地改动」，跳过双轴审查正文，本门视为通过。
- **未通过（硬停）**：结论为「建议先改」「勿提交」，或存在未消除的缺陷级发现 / 疑似密钥 / 明显破坏性改动。输出审查摘要与待改项后**停止**，不进入 A3。
- **通过**：建议为可提交（或「无发现」且无阻塞项）→ 进入 A3。
- 用户明确「忽略门禁继续」时可跳过未通过的门；须在确认包中标注已忽略及原因。

完成标准：code-review 已通过（或用户明确忽略）；且尚未 stash、尚未 pull。硬停时本条不成立。

### A3. 保全本地改动

有未提交改动时：

```bash
git stash push -u -m "ship-sync: wip before pull"
```

无改动则跳过 stash，并在确认包里注明。

完成标准：工作区干净，或已明确记录 stash ref（`stash@{0}` 等）。

### A4. 拉取（merge）

```bash
git pull --no-rebase
```

完成标准：pull 成功，或已进入可处理的 merge 冲突状态（不是未知失败）。

### A5. 恢复本地改动

若 A3 做了 stash：

```bash
git stash pop
```

`stash pop` 产生冲突时，保留冲突标记，进入 A6。pop 失败且 stash 仍在时，不要丢弃该 stash。

完成标准：本地改动已叠回，或冲突文件列表已完整列出。

### A6. 合并冲突

对每个冲突文件：

| 情况 | 动作 |
|------|------|
| 语义明确（格式-only、明显一方过时、机械合并） | 直接解完并 `git add` |
| 业务语义不明、删改意图冲突、两端逻辑都可能对 | **不猜**；列入待确认 |

完成标准：可自动项已全部解决并暂存；不确定项路径 + 双方差异摘要已备好。

### A7. 生成确认包（必须输出后停住）

一次性输出以下结构，然后**停止，等待用户确认**：

```markdown
## 待办 / 结果确认包

### 同步摘要
- 分支：
- 远端：
- stash：已做 / 未做（ref：）
- pull：成功 / 冲突中
- stash pop：成功 / 冲突 / 未执行

### 门禁
- code-review：通过 / 已忽略（原因）
  - 基线：
  - Standards：…（或「无发现」）
  - Spec：无 spec / …
  - 风险摘要：一句话
  - 建议：可提交 / …

### 已自动合并
- `path`：做了什么（一句话）

### 待你处理的冲突
- `path`：冲突要点 + 请你决定保留哪边或怎么合
（若无：写「无」）

### 将纳入本次提交的变更
- 文件列表 = **工作区全部**新增未跟踪 / 修改 / 删除（非功能「范围内」子集）
- 排除项（仅密钥/产物/用户已点名；说明原因；无则写「无」）

### 拟 commit 信息
类型（模块）：内容

### 拟执行
- [ ] 按你的冲突决定完成合并
- [ ] `git add` 工作区全部拟提交文件（含未跟踪）
- [ ] `git commit`
- [ ] `git push`

请确认：回复「确认」或逐条修正（commit 文案、排除文件、冲突决定）。
```

完成标准：确认包已发出（含 A2 的门禁结论、**全量**本地文件清单），且尚未执行 commit/push。

## Manual — 阶段 B（确认后提交并推送）

仅当用户明确确认（或给出可执行的逐条修正）后继续。

1. 若阶段 A 曾硬停且用户未明确忽略门禁：不得进入阶段 B。
2. 按用户意见完成剩余冲突；用户说已手改的文件，重新读盘并 `git add`。
3. 再次 `git status -u`：确认无未解决冲突；**确认包标明纳入却仍 `??` 的路径必须补 `git add`**；仅用户明确排除或密钥/产物类自动排除项可保持未跟踪。
4. 按确认包中的（或用户改过的）信息一次性 commit。
5. `git push`（跟踪已有 upstream；若无 upstream，先说明将使用的 `-u` 目标并仅在用户已同意时执行）。
6. 回报：commit hash、push 结果、残留未跟踪（须说明是否用户排除）、残留 stash（若有）。

完成标准：`git status` 干净（或仅剩用户明确保留/排除的未提交文件），且 push 已成功或已说明失败原因；不得在用户未排除的情况下留下本应提交的新增文件。

---

## Auto 模式

触发：`/ship-sync auto` / `/ship-sync --auto`（可选再加 `force` / `--force`）。调用即视为授权：门禁通过后直接 commit + push（等价于确认包已确认），无需再问「确认」。

动手前定死本轮上限：

- **默认** `maxRounds = 3`
- 调用含 **`force` / `--force`**（ship-sync 参数）→ `maxRounds = 5`

共用上文「拟提交集合」「Commit 文案」「失败与回滚」；stash / pull / pop / 冲突规则与 A3–A6 相同。

### 总流程（最多 `maxRounds` 轮）

```text
摸清现状 → [轮次 1..maxRounds: 门禁 → 按需 neat-freak → 修阻塞项 → 再门禁]
         → 通过后：A3–A6（stash/pull/pop/冲突）
         → 无待决冲突则直接阶段 B（commit + push）
```

**一轮** = 一次完整 code-review 门禁 +（若触发）neat-freak + 对**必要阻塞项**的修复 + 复审准备。  
`round` 从 1 计到 `maxRounds`；第 `maxRounds` 轮复审仍未通过则**硬停**，不 stash/pull/commit/push。

### Auto-1. 摸清现状

同 A1。额外记录：`mode=auto`、`maxRounds`（3 或 5）、`round=0`（尚未开审）。

### Auto-2. 门禁闭环（拉取之前）

对每一轮 `round = 1..maxRounds`：

1. **code-review**（同 A2 规则与基线；始终执行）。
2. **判定**：
   - **通过** → 记下门禁摘要，跳出闭环，进入 Auto-3。
   - **未通过** 且 `round == maxRounds` → 硬停：输出各轮摘要与仍未消除的阻塞项；停止。
   - **未通过** 且 `round < maxRounds` → 进入本轮修复（下两步），然后 `round += 1` 复审。

#### 何时跑 neat-freak

读取并遵循 `~/.agents/skills/neat-freak/SKILL.md`。本轮满足任一则执行（轻量知识同步，文档/规则对齐）；否则跳过：

- 门禁指出 docs / `AGENTS.md` / `CLAUDE.md` / 规则与代码不一致或过期
- 拟提交含文档或规则，且审查认为「应先对齐知识面」才可提交
- 明显会话残留（过期 PLAN/TODO、被替代副本）已构成阻塞，且 neat-freak 会处理

约束：

- 只做授权范围内的文档/规则同步与安全小修；**破坏性清场**（删分支/worktree/临时库等）按 neat-freak 规则：只列候选，**不**在 auto 里擅自删除。
- neat-freak 无法裁决、需用户拍板的项：记入「待决」；若该项同时是门禁阻塞且无法绕过 → 硬停，不盲目进下一轮。

#### 修必要阻塞项

仅修门禁标为阻塞、且语义明确可改的项（缺陷、明显标准违反、密钥误纳入 → 移出拟提交并写入排除项、过期文档与代码对齐等）。

不得：

- 把「建议缩小提交范围」当成修复
- 用 `--no-verify` / 忽略门禁冒充通过
- 猜测业务意图去「修」不确定冲突或产品决策

本轮有实际写盘后，必须带着**更新后的全量工作区**再跑 code-review（计入下一 `round`）。

完成标准：门禁通过且 `round ≤ maxRounds`；或第 `maxRounds` 轮仍失败并已硬停。

### Auto-3. 保全 / 拉取 / 恢复 / 冲突

门禁通过后执行 A3→A4→A5→A6。

- 语义明确的冲突：直接解完并 `git add`。
- **不确定冲突**：硬停，列出路径与双方差异；**不**自动 commit/push（即使门禁已通过）。
- pull/网络失败：同失败表；已 stash 则说明如何 `stash pop`。

### Auto-4. 直接阶段 B

无待决冲突时，**跳过确认包停住**，立即执行阶段 B（将本次门禁摘要 + 全量文件清单 + 拟 commit 信息当作已确认包）：

1. `git status -u`：无未解决冲突；拟提交集合中仍 `??`/未暂存的路径全部 `git add`（密钥/产物/用户已点名排除除外）。
2. 按拟 commit 信息一次性 commit（项目规范优先）。
3. `git push`（已有 upstream 则直接推；**无 upstream** 时硬停说明拟用的 `-u` 目标，等用户同意后再推——auto 不擅自设 upstream）。
4. 回报：模式与轮次、是否跑过 neat-freak、commit hash、push 结果、排除项、残留 stash。

可在回报里附简版同步摘要（不必再问确认）：

```markdown
## Auto 完成摘要
- 模式：auto（force：是 / 否）
- 轮次：N / maxRounds（neat-freak：做过 / 跳过）
- 门禁：通过
- commit：
- push：
- 排除项：
```

完成标准：与 manual 阶段 B 相同。

### Auto 硬停（不进入 commit/push）

| 条件 | 动作 |
| --- | --- |
| `maxRounds` 轮后门禁仍未通过 | 输出待改项；停止 |
| 疑似密钥无法安全排除且阻塞提交 | 停止并警告 |
| neat-freak/修复出现需用户裁决的待决且仍阻塞 | 停止 |
| 不确定 merge 冲突 | 保留标记；停止 |
| 无 upstream 需 `-u` | commit 可完成与否以当时状态为准；**push 前**停止询问目标 |

---

## Commit 文案（全局默认）

格式：`类型（模块）：内容`

- **类型**：`feature` | `fix` | `refactor` | `docs` | `test` | `chore`
- **模块**：短英文标识（如 `frontend`、`backend`、`deploy`）
- **内容**：中文，说明为什么改 / 改动要点

示例：`feature（frontend）：增加任务列表筛选`

项目若另有强制 commit 规范（如 `feat(module): …`），以**当前仓库规则**为准，本全局默认仅在无项目规范时使用。

依据 `git diff` 起草 1 条信息；manual 放入确认包供用户改；auto 直接用于 commit（用户若在调用时写了文案则优先用用户文案）。

## 失败与回滚

| 场景 | 处理 |
|------|------|
| 门禁未通过（manual） | 硬停；不 stash/pull；列出待改项 |
| 门禁未通过（auto，未满 `maxRounds`） | 按需 neat-freak + 修阻塞项后复审 |
| 门禁未通过（auto，第 `maxRounds` 轮） | 硬停；不 stash/pull/commit/push |
| pull 失败（网络/权限） | 停止；若已 stash，说明用 `git stash pop` 恢复 |
| merge 无法自动解决 | 保留冲突；manual 写入确认包；auto 硬停 |
| stash pop 冲突 | 不 drop stash（若仍存在）；列出冲突文件 |
| push 被拒绝 | 不 `git push --force`；说明需再 pull 或用户决策 |
| 用户放弃 | 不 commit/push；说明如何 `stash pop` / `merge --abort`（仅在 merge 未完成且安全时） |

## 禁止

- manual：阶段 A 偷偷 commit/push；无确认就 push
- auto：门禁未通过或存在待决不确定冲突时 commit/push；超过 `maxRounds` 轮仍强行提交
- 门禁未通过仍 stash/pull（除非用户本轮明确忽略门禁，或处于 auto 且**本轮门禁已通过**之后）
- `git push --force` / `reset --hard`（除非用户在本轮明确要求；ship-sync 参数 `force` 不授权此类操作）
- 把确认包拆成多次零散提问（冲突不确定项与门禁项可列在包内，一次性问清）
- 先 pull / stash 再做门禁（门禁必须针对拉取前的本地改动；auto 修复轮次同样在 pull 之前）
- **按「功能范围 / 主题相关」筛选拟提交文件**（未获用户「只提交…」指令时，必须全量本地改动）
- **擅自把未跟踪新文件移出拟提交集合**（含以「另批提交 / 主题无关」为由排除）
- 阶段 B 漏 `git add` 拟提交集合已纳入的路径（含新增）
- 在确认包中用「建议排除」诱导缩小全量集合（除非用户主动要求拆分）
- auto 内执行 neat-freak 的破坏性清场（未经用户确认）
