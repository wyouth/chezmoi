# chezmoi run_ 脚本：每次 `chezmoi apply` 后自动把官方 skill 同步到最新并纳入版本控制。
#
# 为什么用 --mode raw（纯文件镜像、不调 chezmoi CLI）：
#   本脚本本身就在 `chezmoi apply` 内运行，再嵌套调用 chezmoi 会争抢状态库锁而卡死。
#   手动场景请另开终端用带 chezmoi 的模式：
#     node ~/.agents/sync-skills.js --mode add      # 本地为准：chezmoi add --force
#     node ~/.agents/sync-skills.js --mode chezmoi  # 源为准：chezmoi apply --force
# 关闭自动同步：重命名/删除本文件后 commit。
node "$env:USERPROFILE\.agents\sync-skills.js" --mode raw
if ($LASTEXITCODE -ne 0) {
  Write-Host "⚠️ skill 自动同步失败(多为网络),稍后可手动运行: node ~/.agents/sync-skills.js"
}
