#!/bin/bash
# 异常告警监控脚本

cd "$(dirname "$0")/.."
node scripts/alert-monitor.js
