# 全局规则

## 代理设置

全局默认启用代理 `http://127.0.0.1:7890`。访问外网（GitHub、npm 等）失败时，先带上代理重试**一次**：

- bash 里**单条命令**临时带代理：

  ```bash
  http_proxy=http://127.0.0.1:7890 https_proxy=http://127.0.0.1:7890 <原命令>
  ```

## 网络访问失败时的代理用法

外网访问失败（超时、连不上、DNS 解析失败）时，改走本机代理重试**一次**。

- 代理地址：`http://127.0.0.1:7890`（本机代理客户端，默认在监听）
- bash 里**单条命令**临时带代理，不要指望全局生效：

  ```bash
  http_proxy=http://127.0.0.1:7890 https_proxy=http://127.0.0.1:7890 <原命令>
  ```

- **不要用 `proxy_on`**：
  - 它是 PowerShell 函数（定义在 `~/Documents/WindowsPowerShell/Microsoft.PowerShell_profile.ps1`），bash 里不存在；
  - 它只设置**它所在进程**的环境变量，对 Claude Code 的 WebFetch / WebSearch 无效——那两个请求由主进程发出，不经过 shell。

### 什么时候**不要**重试

如果报错来自工具层而非网络（例如 WebFetch 的 `unable to verify domain`、权限类报错、404/403），换代理、重试都没有意义：

- 如实告诉用户失败原因，不要反复重试；
- **不要绕**：不要为了拿到内容改用别的方式绕过工具自身的校验限制。
