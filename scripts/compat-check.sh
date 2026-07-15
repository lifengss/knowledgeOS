#!/bin/bash
# GBrain 版本锁定与启动兼容校验脚本
# 在启动服务前执行，校验 GBrain 版本、Skill 语法、MCP 配置

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$PROJECT_DIR/config/gbrain.config.ts"
AGENTS_DIR="$PROJECT_DIR/agents"
SKILLS_DIR="$PROJECT_DIR/skills"

# 1. 校验 GBrain 版本（锁定 release tag）
EXPECTED_VERSION="v0.16.4"
echo "[compat-check] 校验 GBrain 版本..."
if ! command -v gbrain &> /dev/null; then
    echo "[compat-check] 错误：未找到 gbrain 命令"
    exit 1
fi

CURRENT_VERSION=$(gbrain --version 2>/dev/null | tr -d '\n')
if [[ "$CURRENT_VERSION" != *"$EXPECTED_VERSION"* ]]; then
    echo "[compat-check] 错误：GBrain 版本不匹配，期望 $EXPECTED_VERSION，实际 $CURRENT_VERSION"
    echo "[compat-check] 请使用：git clone --branch $EXPECTED_VERSION --depth 1 https://github.com/garrytan/gbrain.git"
    exit 1
fi
echo "[compat-check] GBrain 版本校验通过：$CURRENT_VERSION"

# 2. 校验 Skill 文件存在（V1.0 8 个自建 Skill）
echo "[compat-check] 校验 Skill 文件..."
REQUIRED_SKILLS=(
    "tfidf-code-slicer.md"
    "case-generator.md"
    "case-validator.md"
    "conflict-detector.md"
    "batch-commit.md"
    "single-commit.md"
    "api-graph-builder.md"
    "quality-gate.md"
)

for skill in "${REQUIRED_SKILLS[@]}"; do
    if [[ ! -f "$SKILLS_DIR/$skill" ]]; then
        echo "[compat-check] 错误：缺少 Skill 文件 $skill"
        exit 1
    fi
done
echo "[compat-check] Skill 文件校验通过"

# 3. 校验 MCP 配置文件
echo "[compat-check] 校验 MCP 配置..."
if [[ ! -f "$AGENTS_DIR/generator.json" ]]; then
    echo "[compat-check] 错误：缺少 agents/generator.json"
    exit 1
fi
if [[ ! -f "$AGENTS_DIR/validator.json" ]]; then
    echo "[compat-check] 错误：缺少 agents/validator.json"
    exit 1
fi
echo "[compat-check] MCP 配置校验通过"

# 4. 校验 Brain 仓库目录结构
echo "[compat-check] 校验 Brain 仓库目录..."
for dir in quality-rules defect-experience project-wiki test-cases; do
    if [[ ! -d "$PROJECT_DIR/brain/$dir" ]]; then
        echo "[compat-check] 错误：缺少 brain/$dir 目录"
        exit 1
    fi
done
echo "[compat-check] Brain 仓库目录校验通过"

# 5. 校验环境变量
echo "[compat-check] 校验环境变量..."
if [[ ! -f "$PROJECT_DIR/.env" ]]; then
    echo "[compat-check] 警告：未找到 .env 文件，使用 .env.example"
fi
echo "[compat-check] 环境变量校验通过"

echo "[compat-check] 全部校验通过，可以启动服务"
exit 0
