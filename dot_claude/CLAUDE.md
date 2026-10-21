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

### Agent：外网失败 → 自动 `proxy_on` 再试一次

访问外网（GitHub、npm、`uv sync`、TypeSafe API 等）失败时（超时、连接重置、TLS 失败、区域封锁如 HTTP 451）：**不要先问用户**，在同一 shell 里开启代理后重试**一次**：

```bash
. "$HOME/.config/shell/proxy.sh" && proxy_on >/dev/null
# 然后重跑原命令
```

单条命令也可临时带环境变量（不依赖已执行过的 `proxy_on`）：

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

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
