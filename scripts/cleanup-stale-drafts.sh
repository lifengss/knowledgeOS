#!/bin/bash
# 过期草稿定时清理脚本

cd "$(dirname "$0")/.."
python scripts/cleanup_stale_drafts.py
