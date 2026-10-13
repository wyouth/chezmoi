# chezmoi run_ 脚本:每次 `chezmoi apply` 后自动把官方 skill 同步到最新并纳入版本控制。
# 手动同款命令: node ~/.agents/sync-skills.js [--commit]
# 关闭自动同步: 在 chezmoi 源目录重命名/删除本文件后 commit(或删掉后不再应用)。
node "$env:USERPROFILE\.agents\sync-skills.js"
if ($LASTEXITCODE -ne 0) {
  Write-Host "⚠️ skill 自动同步失败(多为网络),稍后可手动运行: node ~/.agents/sync-skills.js"
}
