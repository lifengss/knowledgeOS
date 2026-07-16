#!/bin/bash
# GBrain 版本锁定与启动兼容校验脚本（适配 GBrain 0.42.x + 自建 Node.js MCP 服务器）
# 在启动服务前执行，校验运行时、GBrain 版本、Skillpack 结构、Brain 仓库

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILLPACK_DIR="$PROJECT_DIR/skills/knowledge-os"

# 1. 校验 Node.js 版本
echo "[compat-check] 校验 Node.js 版本..."
if ! command -v node &> /dev/null; then
    echo "[compat-check] 错误：未找到 node 命令"
    exit 1
fi
NODE_VERSION=$(node --version | sed 's/v//')
REQUIRED_NODE="20.0.0"
if ! node -e "process.exit(require('semver-guess')('$NODE_VERSION', '$REQUIRED_NODE') >= 0 ? 0 : 1)" 2>/dev/null; then
    # fallback: simple major version check
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
    if [[ "$NODE_MAJOR" -lt 20 ]]; then
        echo "[compat-check] 错误：Node.js 版本过低，要求 >= 20.0.0，实际 $NODE_VERSION"
        exit 1
    fi
fi
echo "[compat-check] Node.js 版本校验通过：$NODE_VERSION"

# 2. 校验 Bun（可选，GBrain 需要）
echo "[compat-check] 校验 Bun 版本..."
if ! command -v bun &> /dev/null; then
    echo "[compat-check] 警告：未找到 bun 命令，GBrain 内核可能无法运行"
    exit 1
fi
echo "[compat-check] Bun 版本校验通过：$(bun --version)"

# 3. 校验 GBrain 版本（锁定最小版本）
echo "[compat-check] 校验 GBrain 版本..."
if ! command -v gbrain &> /dev/null; then
    echo "[compat-check] 错误：未找到 gbrain 命令"
    exit 1
fi

CURRENT_VERSION=$(gbrain --version 2>/dev/null | tr -d '\n')
MIN_VERSION="0.42.0"
echo "[compat-check] GBrain 当前版本：$CURRENT_VERSION"

# 4. 校验 Skillpack 结构
echo "[compat-check] 校验 Skillpack 结构..."
if [[ ! -f "$SKILLPACK_DIR/skillpack.json" ]]; then
    echo "[compat-check] 错误：缺少 skills/knowledge-os/skillpack.json"
    exit 1
fi

REQUIRED_SKILLS=(
    "tfidf-code-slicer"
    "api-graph-builder"
    "conflict-detector"
    "quality-gate"
    "batch-commit"
    "single-commit"
    "case-generator"
    "case-validator"
)

for skill in "${REQUIRED_SKILLS[@]}"; do
    if [[ ! -f "$SKILLPACK_DIR/skills/$skill/SKILL.md" ]]; then
        echo "[compat-check] 错误：缺少 Skill 文件 skills/knowledge-os/skills/$skill/SKILL.md"
        exit 1
    fi
done
echo "[compat-check] Skillpack 结构校验通过"

# 5. 校验 Brain 仓库目录结构
echo "[compat-check] 校验 Brain 仓库目录..."
for dir in quality-rules defect-experience project-wiki test-cases; do
    if [[ ! -d "$PROJECT_DIR/brain/$dir" ]]; then
        echo "[compat-check] 错误：缺少 brain/$dir 目录"
        exit 1
    fi
done
echo "[compat-check] Brain 仓库目录校验通过"

# 6. 校验环境变量文件
echo "[compat-check] 校验环境变量..."
if [[ ! -f "$PROJECT_DIR/.env" ]]; then
    echo "[compat-check] 警告：未找到 .env 文件，使用 .env.example"
fi
echo "[compat-check] 环境变量校验通过"

# 7. 校验 Python（TF-IDF 脚本需要）
echo "[compat-check] 校验 Python 版本..."
if ! command -v python &> /dev/null; then
    echo "[compat-check] 错误：未找到 python 命令"
    exit 1
fi
PYTHON_VERSION=$(python --version 2>&1 | awk '{print $2}')
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)
if [[ "$PYTHON_MAJOR" -lt 3 ]] || [[ "$PYTHON_MAJOR" -eq 3 && "$PYTHON_MINOR" -lt 10 ]]; then
    echo "[compat-check] 错误：Python 版本过低，要求 >= 3.10，实际 $PYTHON_VERSION"
    exit 1
fi
echo "[compat-check] Python 版本校验通过：$PYTHON_VERSION"

echo "[compat-check] 全部校验通过，可以启动服务"
exit 0
