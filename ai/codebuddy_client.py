# -*- coding: utf-8 -*-
"""
CodeBuddy 通道客户端（对齐 testcase-gen-frontend/server/codebuddy-client.js）。

关键坑（Windows）：@tencent-ai/agent-sdk 的 stdio 在 Windows 拉不起 CLI，
故直接用 `node <codebuddy 入口脚本>` 启动（node 是真正的 .exe，不绕 cmd.exe，
且 argv 中的多行 prompt 被原样保留，避免被命令行解析截断），再解析
--output-format stream-json 的输出抽取 assistant 文本。

入口脚本解析顺序：
  1. 环境变量 CODEBUDDY_CODE_PATH
  2. npm root -g / @tencent-ai/codebuddy-code/bin/codebuddy
  3. PATH 上的 codebuddy（Linux/macOS）
"""
import os
import sys
import json
import shutil
import subprocess


def resolve_node():
    return shutil.which('node') or 'node'


def resolve_cli_script():
    if os.environ.get('CODEBUDDY_CODE_PATH'):
        return os.environ['CODEBUDDY_CODE_PATH']
    try:
        groot = subprocess.check_output(['npm', 'root', '-g'], encoding='utf-8').strip()
        p = os.path.join(groot, '@tencent-ai', 'codebuddy-code', 'bin', 'codebuddy')
        if os.path.exists(p):
            return p
    except Exception:
        pass
    return 'codebuddy'


def models_file_exists():
    cands = [
        os.path.join(os.getcwd(), '.codebuddy', 'models.json'),
        os.path.join(os.path.expanduser('~'), '.codebuddy', 'models.json'),
    ]
    return any(os.path.exists(c) for c in cands)


def call_codebuddy(prompt, model=None, max_turns=4, timeout=120, load_settings=False):
    cli = resolve_cli_script()
    node = resolve_node()
    load = load_settings or models_file_exists()
    setting_sources = 'project,local' if load else 'none'
    # 已加载设置时交给 CodeBuddy 用 settings.local.json 默认模型；否则用内置/AI_MODEL
    model_eff = model or (None if load else (os.environ.get('AI_MODEL') or 'claude-sonnet-4'))

    args = [node, cli, '--output-format', 'stream-json']
    if model_eff:
        args += ['--model', model_eff]
    args += [
        '--permission-mode', 'bypassPermissions',
        '--setting-sources', setting_sources,
        '--max-turns', str(max_turns),
        '-p', prompt,
    ]

    env = dict(os.environ)
    if os.environ.get('CODEBUDDY_INTERNET_ENVIRONMENT'):
        env['CODEBUDDY_INTERNET_ENVIRONMENT'] = os.environ['CODEBUDDY_INTERNET_ENVIRONMENT']

    try:
        proc = subprocess.run(args, capture_output=True, text=True, env=env, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise RuntimeError('codebuddy 生成超时')

    if proc.returncode != 0 and not proc.stdout.strip():
        raise RuntimeError('codebuddy 退出码 %d: %s' % (proc.returncode, proc.stderr[:600]))

    text = ''
    for line in proc.stdout.split('\n'):
        s = line.strip()
        if not s:
            continue
        try:
            m = json.loads(s)
        except Exception:
            continue
        if m.get('type') == 'assistant':
            content = (m.get('message') or {}).get('content')
            if isinstance(content, list):
                for b in content:
                    if isinstance(b, dict) and b.get('type') == 'text':
                        text += b.get('text', '')
    return text.strip() or None


if __name__ == '__main__':
    # 简单自检：python ai/codebuddy_client.py "你好，回复 ok"
    if len(sys.argv) > 1:
        print(call_codebuddy(sys.argv[1]))
