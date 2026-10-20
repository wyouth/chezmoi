# 全局规则

## 代理设置

默认代理地址：`http://127.0.0.1:7890`（HTTP/HTTPS），SOCKS5 同端口 `socks5://127.0.0.1:7890`（本机 Clash 混合端口）。

### WSL / bash / zsh

交互式 shell 已加载 `~/.config/shell/proxy.sh`：

```bash
proxy_on              # 设置 http/https + socks5 环境变量
proxy_on 7890         # 改端口
proxy_on 127.0.0.1:7890
proxy_off
proxy_status
```

`proxy_on` 只影响**当前 shell 进程**及其子进程。

### Agent 单次命令（推荐）

访问外网（GitHub、npm、`uv sync` 等）失败时，带代理重试**一次**——用单条命令临时环境变量，不要指望已在别处执行过的 `proxy_on`：

```bash
http_proxy=http://127.0.0.1:7890 https_proxy=http://127.0.0.1:7890 ALL_PROXY=socks5://127.0.0.1:7890 <原命令>
```

### 不要指望 shell 代理覆盖的场景

- Claude Code / Cursor 的 WebFetch、WebSearch：请求由主进程发出，不经过你的 shell，`proxy_on` 无效。
- PowerShell 的 `proxy_on`（若在 Windows profile 里）：只改 PowerShell 进程环境，与 WSL bash 无关。

### 什么时候**不要**重试

如果报错来自工具层而非网络（例如 WebFetch 的 `unable to verify domain`、权限类报错、404/403），换代理、重试都没有意义：

- 如实告诉用户失败原因，不要反复重试；
- **不要绕**：不要为了拿到内容改用别的方式绕过工具自身的校验限制。

## TypeSafe 门禁

动手执行任务前：加载 `typesafe-ai`，用 Jev 判断当前方案是否可执行。

- **通过** → 再执行。
- **未通过** → 先改方案，复判通过后再动手；不得带着未通过的方案执行。
- **Jev 不可用** → 简短说明后自行推进，不得声称已通过。

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
