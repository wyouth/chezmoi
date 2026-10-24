# 全局 Agent 规则

## 网络代理

默认代理：`127.0.0.1:7890`。Helper：`~/.config/shell/proxy.sh`。

外网失败（超时、连接重置、TLS 失败、区域封锁如 HTTP 451、GitHub/npm/`uv`/TypeSafe 不可达）：**先 `proxy_on`，再重试一次**，不要先问用户。

```bash
. "$HOME/.config/shell/proxy.sh" && proxy_on >/dev/null
```

工具校验失败、权限错误、真实 404/403 不要靠换代理硬扛。WebFetch/WebSearch 主进程不走 shell 代理。

## TypeSafe 门禁

动手执行任务前：加载 `typesafe-ai`，用 Jev 判断当前方案是否可执行。

调用 Jev 前先加载本地密钥（Agent 非交互 shell 不一定读 bashrc）：

```bash
[ -f "$HOME/.config/shell/secrets.sh" ] && . "$HOME/.config/shell/secrets.sh"
```

- **通过** → 再执行。
- **未通过** → 先改方案，复判通过后再动手；不得带着未通过的方案执行。
- **Jev 调用失败** → 先按上方开代理重试一次；仍不可用则简短说明后自行推进，不得声称已通过。

## Git 提交信息

全局默认格式（半角括号与冒号，冒号后一个空格）：`类型(模块): 内容`

- **类型**：`feat` | `fix` | `refactor` | `docs` | `test` | `chore`（勿用 `feature`）
- **模块**：短英文标识（如 `frontend`、`backend`、`deploy`、`infra`、`docs`、`repo`）
- **内容**：单句中文；示例：`feat(frontend): 增加任务列表筛选`

仓库若另有强制规范则以仓库为准；否则一律用本格式（含 `/ship-sync`）。

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
