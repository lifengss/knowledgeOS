#!/bin/bash
# 过期草稿定时清理脚本

cd "$(dirname "$0")/.."
node scripts/cleanup-stale-drafts.js
