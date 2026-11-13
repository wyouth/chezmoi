---
name: 79-arm-build-image
description: 在 79 服务器拉取 631 后端与核心侧指定分支，构建 linux/arm64 镜像，并原子更新 /home/ticp/develop/output/arm 离线交付包。用于“更新 631 ARM 镜像”“重打核心侧/后端离线包”；不负责启动或替换运行中的业务容器。
---

# 构建 631 ARM 离线镜像

在服务器已有源码和 Docker 缓存上构建，交付两个可追溯的 ARM64 TAR：

- 后端：`/home/ticp/app/projects/631/project`，分支 `2.1.0-dev`，镜像 `test-review-app:<YYYYMMDD>-<sha8>-arm64`
- 核心侧：`/home/ticp/app/projects/631/resona_ai_core`，分支 `develop`，镜像 `resona-worker:<YYYYMMDD>-<sha8>-arm64`
- 交付目录：`/home/ticp/develop/output/arm`

优先使用本机 `~/.ssh/config`（或备用 `/home/wyouth/developer/projects/631/.tmp/ragflow79.ssh_config`）里的 Host `79_arm`。用户说「79 / ARM 机」即此主机。若条目不存在，先只读解析用户所称的目标，不可猜测主机。

## 执行边界

拉取、构建和替换交付包都是外部写操作；本次请求必须明确授权这些动作。授权不包含部署：保持运行中容器、Compose、数据卷和运行时 `.env` 不变。

任何一个仓库工作区不干净、当前分支不符、无法快进、磁盘不足或现有交付包结构不唯一时停止，报告现场状态。保留用户改动，不做 stash、reset、checkout 或清理 Docker。

## 1. 基线

连接后读取两个仓库各自适用的 `AGENTS.md`。确认：

- `hostname` 指向目标服务器，`uname -m` 为 `aarch64`，Docker 可用；
- 两个仓库工作区为空，分支和 upstream 符合上表；
- 交付目录中后端和核心侧各只有一个当前 TAR，`SHA256SUMS` 校验通过；
- `/home` 与 Docker 数据目录的可用空间足以同时容纳构建层、两个新 TAR 和一份旧 TAR 备份。

记录两个仓库拉取前 HEAD、现有镜像名、镜像 ID、TAR 路径和 SHA256。此记录是回滚基线。

## 2. 快进源码

分别执行 `git fetch --prune`，再次确认工作区和分支，然后只用 `git pull --ff-only` 更新 upstream。网络连接失败时按当前全局代理规则最多重试一次；认证、权限、冲突或非快进错误直接停止。

拉取完成条件：两个 HEAD 均等于各自 upstream，工作区仍为空。某仓库没有新提交也算完成，但仍按当前 HEAD 重建。

## 3. 构建镜像

在仓库根目录构建，不调用会部署容器的 CI 脚本。

后端使用根目录上下文和 `deploy/Dockerfile`：

```bash
docker build --platform linux/arm64 -f deploy/Dockerfile -t "test-review-app:${tag}" .
```

核心侧运行时镜像依赖 `resona-base:1.0.0`。先计算 `pyproject.toml` 与 `uv.lock` 的组合 SHA256；基础镜像不存在或记录的依赖指纹不同才使用 `docker/Dockerfile.base` 重建基础镜像并更新仓库内被忽略的 `.ci-resona-base.hash`。随后使用：

```bash
docker build --platform linux/arm64 -f docker/Dockerfile -t "resona-worker:${tag}" .
```

外部依赖下载发生网络错误时，按全局代理规则重试该次构建一次；构建内容错误不使用代理重试。

每个镜像必须通过 `docker image inspect` 验证 `Os=linux`、`Architecture=arm64`，并记录镜像 ID、创建时间和源码完整 HEAD。核心侧还要做无密钥导入检查，后端至少验证镜像配置中存在健康检查；这些检查不启动或替换业务容器。

## 4. 更新交付包

使用 Skill 自带脚本 [scripts/update_delivery.py](scripts/update_delivery.py)。先把脚本复制到服务器临时目录，再以交付根目录、两个新镜像和两个源码 HEAD 为参数运行。脚本负责：

- `docker save` 到同文件系统的临时目录并验证 TAR；
- 把旧 TAR 和相关元数据移动/复制到 `backups/<timestamp>/`；
- 原子替换两个 TAR；
- 同步 `images-manifest.txt`、README、后端/核心侧环境示例中的镜像引用；
- 重建覆盖交付文件的 `SHA256SUMS`；
- 失败时回滚已替换的文件。

脚本只处理 `review631-backend` 与 `resona-core-worker` 两个 manifest 块。不得手工批量替换其他基础镜像条目。

## 5. 验收

从交付目录执行 `sha256sum -c SHA256SUMS`，必须全部成功。再核对：

- manifest、README、配置示例与两个 TAR 文件名一致；
- 两个 TAR 的 `manifest.json` 可读；
- 将 TAR 加载后的镜像 ID 与刚构建镜像一致（镜像已在本机时可用 `docker load` 幂等验证）；
- 两个源码 HEAD、镜像标签和 manifest 的 `source_revision` 一致；
- 运行中容器及其镜像在本次流程中没有变化。

最终报告拉取前后提交、镜像标签/ID/架构、TAR 路径与 SHA256、备份目录、校验结果，以及未执行部署这一边界。只有所有验收项可核验时任务才完成。
