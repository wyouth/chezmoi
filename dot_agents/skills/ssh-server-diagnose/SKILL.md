---
name: ssh-server-diagnose
description: >
  用 SSH 在远端服务器上定位并修复问题。覆盖两种模式：A Remote-SSH（Agent 在远端工作区）与
  B 本机 Agent + 非交互 ssh。在用户说「连服务器排障」「SSH 查一下」「79 上怎么了」、
  「79_arm」「45_dev」「Remote-SSH 定位」、或明确要 AI 上机诊断/修复时使用。
  不替代 79-arm-build-image 的镜像构建流程。
---

# SSH 服务器诊断与修复

目标：在真实服务器上建立 **tight 红信号**，定位根因，改完后再用同一信号验证。密钥与 Host 别名走本机 `~/.ssh/config`，密钥内容永不写入聊天或提交。

## 选模式

| 场景 | 模式 |
|------|------|
| 要在服务器上长时间改配置、翻大量日志、多步交互排障 | **A Remote-SSH** |
| 本机已开仓库，只需几次远端命令确认状态/改一两处 | **B 非交互 SSH** |
| 用户已在 Remote-SSH 窗口里说话 | **A**（当前工作区即远端，勿再套一层 `ssh`） |
| 当前窗口是本机/WSL 工作区 | 默认 **B**；需要 A 时请用户先连 Remote-SSH 再开新对话 |

两种模式都要会：同一问题可先用 B 快速取证，再切 A 深挖。

## 主机别名（本机已配）

优先用 SSH Host 名，不要手写 IP。用户说「79 / ARM 机」→ `79_arm`；说「45 / 开发机」→ `45_dev`。

- `45_dev` — 开发服务器 `172.16.200.45`，用户 `ticp`，x86，兼跳板；Remote 工作区优先 `/home/ticp/develop/631`（`project` 后端、`resona_ai_core` 核心侧）
- `79_arm` — ARM 服务器 `172.16.20.79`（经 `ProxyJump 45_dev`），用户 `ticp`，`aarch64`

**Cursor Remote-SSH 跑在 Windows 上**：必须同时维护 `C:\Users\wyout\.ssh\config` 与同名私钥（不能只改 WSL `~/.ssh/config`）。Windows `ssh 45_dev` 不通时，Remote 也会报 `Could not resolve hostname`。

连不通时先本机：`ssh -o BatchMode=yes -o ConnectTimeout=8 79_arm 'hostname'`。成功应看到主机名；失败停下来报告（密钥、跳板、VPN），不要猜别的主机。

备用参考（若 `~/.ssh/config` 缺条目）：仓库内 `.tmp/ragflow79.ssh_config`，用  
`ssh -F /home/wyouth/developer/projects/631/.tmp/ragflow79.ssh_config -o BatchMode=yes 79_arm '…'`。

## 模式 A — Remote-SSH

**人先做（Agent 无法代点 Cursor UI）：**

1. `Ctrl+Shift+P` → `Remote-SSH: Connect to Host…` → 选 `79_arm` 或 `45_dev`。
2. 打开要排障的远端目录（45 上 631 多为 `/home/ticp/Project/631/project`）。
3. 左下角显示 `SSH: …` 后，**在该窗口**开 Agent 对话描述现象。
4. 若 Agent 一直 Reconnecting / 连不上模型：Settings → **Remote [SSH: …]** → 搜 `remoteInferenceRoute` → 设为 `always` → `Developer: Reload Window`。

**Agent 在 A 窗口里：**

- Shell 已在远端：直接跑诊断命令，**不要**再 `ssh 79_arm '…'`。
- 先取证：`hostname`、`uname -m`、相关 `docker ps` / `systemctl` / 日志路径 / 配置文件。
- 写操作前说明影响；用户未授权部署/删数据/重启生产时只读。
- 修完用同一检查命令证明信号变绿。

## 模式 B — 本机非交互 SSH

Agent 终端不能交互登录。一律：

```bash
ssh -o BatchMode=yes -o ConnectTimeout=15 79_arm '<remote-command>'
```

多条远端命令用远端 shell 串起来，一次往返：

```bash
ssh -o BatchMode=yes 79_arm 'set -euo pipefail; hostname; docker ps --format "table {{.Names}}\t{{.Status}}" | head'
```



规则：

- 必须 `BatchMode=yes`（禁密码提示）。
- 远端命令用单引号包住；需要本机变量再分层转义。
- 大日志：远端先 `tail`/`grep` 收窄，再拉回片段；密钥、`.env`、token 输出用 `<REDACTED>`。
- 写文件/重启/改 compose：先只读取证 → 报计划 → 用户明确同意后再执行。
- 与「79 ARM 镜像构建」重叠时，构建步骤交给 `79-arm-build-image`，本 skill 只做故障取证与授权后的定点修复。

## 诊断循环（A/B 共用）

1. **复述现象**：用户看到的错误、时间、环境（哪台 Host、哪个服务）。
2. **红信号**：一条可重复命令，坏时失败/异常，修好应变好（状态码、日志关键字、健康检查、HTTP）。
3. **只读取证**：进程/容器、最近日志、相关配置、磁盘与端口；每轮假设对照证据保留或否决。
4. **最小修复**：改一处、验一次；避免无授权的大范围重启或清数据。
5. **验收**：再跑红信号；贴出修复前后对比（脱敏）。

完成标准：已指出根因（或已排除到明确下一步），修复若已做则红信号变绿，并写明在哪台 Host、用了 A 还是 B。

## 安全边界

- 不把私钥、密码、完整 `.env` 贴进回复。
- 不 `ssh` 进交互壳，不依赖 `ssh-copy-id` 现场改授权除非用户要求。
- 生产破坏性操作（`rm -rf`、强制推库、覆盖运行中容器）默认拒绝，除非用户本回合明确授权。
