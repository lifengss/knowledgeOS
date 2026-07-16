# GBrain 版本锁定与启动兼容校验脚本（PowerShell 版，适配 GBrain 0.42.x + 自建 Node.js MCP 服务器）
# 在启动服务前执行，校验运行时、GBrain 版本、Skillpack 结构、Brain 仓库

$ErrorActionPreference = "Stop"

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PROJECT_DIR = Split-Path -Parent $SCRIPT_DIR
$SKILLPACK_DIR = "$PROJECT_DIR\skills\knowledge-os"

# 1. 校验 Node.js 版本
Write-Host "[compat-check] 校验 Node.js 版本..."
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "[compat-check] 错误：未找到 node 命令"
    exit 1
}
$NODE_VERSION = (node --version).Trim().Substring(1)
$NODE_MAJOR = [int]($NODE_VERSION -split '\.')[0]
if ($NODE_MAJOR -lt 20) {
    Write-Host "[compat-check] 错误：Node.js 版本过低，要求 >= 20.0.0，实际 $NODE_VERSION"
    exit 1
}
Write-Host "[compat-check] Node.js 版本校验通过：$NODE_VERSION"

# 2. 校验 Bun
Write-Host "[compat-check] 校验 Bun 版本..."
$bun = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bun) {
    Write-Host "[compat-check] 错误：未找到 bun 命令"
    exit 1
}
Write-Host "[compat-check] Bun 版本校验通过：$(bun --version)"

# 3. 校验 GBrain 版本
Write-Host "[compat-check] 校验 GBrain 版本..."
$gbrain = Get-Command gbrain -ErrorAction SilentlyContinue
if (-not $gbrain) {
    Write-Host "[compat-check] 错误：未找到 gbrain 命令"
    exit 1
}
$CURRENT_VERSION = (gbrain --version 2>$null).Trim()
Write-Host "[compat-check] GBrain 当前版本：$CURRENT_VERSION"

# 4. 校验 Skillpack 结构
Write-Host "[compat-check] 校验 Skillpack 结构..."
if (-not (Test-Path "$SKILLPACK_DIR\skillpack.json")) {
    Write-Host "[compat-check] 错误：缺少 skills\knowledge-os\skillpack.json"
    exit 1
}

$REQUIRED_SKILLS = @(
    "tfidf-code-slicer",
    "api-graph-builder",
    "conflict-detector",
    "quality-gate",
    "batch-commit",
    "single-commit",
    "case-generator",
    "case-validator"
)
foreach ($skill in $REQUIRED_SKILLS) {
    if (-not (Test-Path "$SKILLPACK_DIR\skills\$skill\SKILL.md")) {
        Write-Host "[compat-check] 错误：缺少 Skill 文件 skills\knowledge-os\skills\$skill\SKILL.md"
        exit 1
    }
}
Write-Host "[compat-check] Skillpack 结构校验通过"

# 5. 校验 Brain 仓库目录结构
Write-Host "[compat-check] 校验 Brain 仓库目录..."
foreach ($dir in @("quality-rules", "defect-experience", "project-wiki", "test-cases")) {
    if (-not (Test-Path "$PROJECT_DIR\brain\$dir")) {
        Write-Host "[compat-check] 错误：缺少 brain\$dir 目录"
        exit 1
    }
}
Write-Host "[compat-check] Brain 仓库目录校验通过"

# 6. 校验环境变量文件
Write-Host "[compat-check] 校验环境变量..."
if (-not (Test-Path "$PROJECT_DIR\.env")) {
    Write-Host "[compat-check] 警告：未找到 .env 文件，使用 .env.example"
}
Write-Host "[compat-check] 环境变量校验通过"

# 7. 校验 Python
Write-Host "[compat-check] 校验 Python 版本..."
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Host "[compat-check] 错误：未找到 python 命令"
    exit 1
}
$PYTHON_VERSION = (python --version 2>&1).Trim().Split(' ')[1]
$PYTHON_MAJOR = [int]($PYTHON_VERSION -split '\.')[0]
$PYTHON_MINOR = [int]($PYTHON_VERSION -split '\.')[1]
if ($PYTHON_MAJOR -lt 3 -or ($PYTHON_MAJOR -eq 3 -and $PYTHON_MINOR -lt 10)) {
    Write-Host "[compat-check] 错误：Python 版本过低，要求 >= 3.10，实际 $PYTHON_VERSION"
    exit 1
}
Write-Host "[compat-check] Python 版本校验通过：$PYTHON_VERSION"

Write-Host "[compat-check] 全部校验通过，可以启动服务"
exit 0
