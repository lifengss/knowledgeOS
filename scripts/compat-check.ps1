# GBrain 版本锁定与启动兼容校验脚本（PowerShell 版）
# 在启动服务前执行，校验 GBrain 版本、Skill 语法、MCP 配置

$ErrorActionPreference = "Stop"

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PROJECT_DIR = Split-Path -Parent $SCRIPT_DIR
$AGENTS_DIR = "$PROJECT_DIR\agents"
$SKILLS_DIR = "$PROJECT_DIR\skills"

$EXPECTED_VERSION = "v0.16.4"

Write-Host "[compat-check] 校验 GBrain 版本..."
$gbrain = Get-Command gbrain -ErrorAction SilentlyContinue
if (-not $gbrain) {
    Write-Host "[compat-check] 错误：未找到 gbrain 命令"
    exit 1
}

$CURRENT_VERSION = (gbrain --version 2>$null).Trim()
if ($CURRENT_VERSION -notlike "*$EXPECTED_VERSION*") {
    Write-Host "[compat-check] 错误：GBrain 版本不匹配，期望 $EXPECTED_VERSION，实际 $CURRENT_VERSION"
    Write-Host "[compat-check] 请使用：git clone --branch $EXPECTED_VERSION --depth 1 https://github.com/garrytan/gbrain.git"
    exit 1
}
Write-Host "[compat-check] GBrain 版本校验通过：$CURRENT_VERSION"

Write-Host "[compat-check] 校验 Skill 文件..."
$REQUIRED_SKILLS = @(
    "tfidf-code-slicer.md",
    "case-generator.md",
    "case-validator.md",
    "conflict-detector.md",
    "batch-commit.md",
    "single-commit.md",
    "api-graph-builder.md",
    "quality-gate.md"
)
foreach ($skill in $REQUIRED_SKILLS) {
    if (-not (Test-Path "$SKILLS_DIR\$skill")) {
        Write-Host "[compat-check] 错误：缺少 Skill 文件 $skill"
        exit 1
    }
}
Write-Host "[compat-check] Skill 文件校验通过"

Write-Host "[compat-check] 校验 MCP 配置..."
if (-not (Test-Path "$AGENTS_DIR\generator.json")) {
    Write-Host "[compat-check] 错误：缺少 agents/generator.json"
    exit 1
}
if (-not (Test-Path "$AGENTS_DIR\validator.json")) {
    Write-Host "[compat-check] 错误：缺少 agents/validator.json"
    exit 1
}
Write-Host "[compat-check] MCP 配置校验通过"

Write-Host "[compat-check] 校验 Brain 仓库目录..."
foreach ($dir in @("quality-rules", "defect-experience", "project-wiki", "test-cases")) {
    if (-not (Test-Path "$PROJECT_DIR\brain\$dir")) {
        Write-Host "[compat-check] 错误：缺少 brain/$dir 目录"
        exit 1
    }
}
Write-Host "[compat-check] Brain 仓库目录校验通过"

Write-Host "[compat-check] 全部校验通过，可以启动服务"
exit 0
