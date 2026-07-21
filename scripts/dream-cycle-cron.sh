#!/bin/bash
# Dream Cycle 定时任务脚本
# 每日执行：同步 Markdown 变更、重新生成向量、修复引用、丰富实体

cd "$(dirname "$0")/.."

echo "[dream-cycle] 开始执行 $(date)"

# 1. 同步 Brain 仓库 Markdown 变更
echo "[dream-cycle] 同步 Markdown..."
gbrain sync

# 2. 重新生成过期的向量嵌入
echo "[dream-cycle] 重新生成向量..."
gbrain embed --stale

# 3. 调用 API 图谱增量更新（如有代码变更）
echo "[dream-cycle] 增量更新 API 图谱..."
python scripts/alert_monitor.py

# 4. 过期草稿清理
echo "[dream-cycle] 清理过期草稿..."
python scripts/cleanup_stale_drafts.py

echo "[dream-cycle] 执行完成 $(date)"
