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
import time
import shutil
import subprocess

from llm_logger import log_llm


def resolve_node():
    return shutil.which('node') or 'node'


def resolve_cli_script():
    """定位全局 codebuddy CLI 入口脚本（供 `node <脚本>` 直接启动）。

    解析顺序（不依赖 npm 是否在 PATH 上，避免子进程环境缺失 npm 时回退成
    裸 'codebuddy' 被 node 当作相对路径而瞬间报错）：
      1. 环境变量 CODEBUDDY_CODE_PATH
      2. `npm root -g` 下的 @tencent-ai/codebuddy-code/bin/codebuddy
      3. 由 which/where 找到的 codebuddy 可执行反推全局 node_modules/bin 脚本
      4. 常见 Windows npm 前缀下的全局 node_modules/bin 脚本
      5. 最后才回退裸 'codebuddy'（仅 Linux/macOS 上可靠）
    """
    if os.environ.get('CODEBUDDY_CODE_PATH'):
        return os.environ['CODEBUDDY_CODE_PATH']
    # 2) npm 全局路径
    try:
        groot = subprocess.check_output(['npm', 'root', '-g'], encoding='utf-8').strip()
        p = os.path.join(groot, '@tencent-ai', 'codebuddy-code', 'bin', 'codebuddy')
        if os.path.exists(p):
            return p
    except Exception:
        pass
    # 3) 由 which/where 反推
    for exe in ('codebuddy', 'codebuddy.cmd', 'codebuddy.ps1'):
        wp = shutil.which(exe)
        if wp:
            npm_dir = os.path.dirname(wp)
            cand = os.path.join(npm_dir, 'node_modules', '@tencent-ai',
                                'codebuddy-code', 'bin', 'codebuddy')
            if os.path.exists(cand):
                return cand
    # 4) 常见 Windows npm 前缀
    home = os.path.expanduser('~')
    for base in (os.path.join(home, 'AppData', 'Roaming', 'npm'),
                 os.path.join(home, 'AppData', 'Roaming', 'nodejs')):
        cand = os.path.join(base, 'node_modules', '@tencent-ai',
                            'codebuddy-code', 'bin', 'codebuddy')
        if os.path.exists(cand):
            return cand
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

    t0 = time.time()
    try:
        # Windows 默认 locale 为 gbk，而 codebuddy 输出为 UTF-8（含中文），
        # 必须用 encoding='utf-8' 显式解码，否则 gbk 解码崩溃导致 proc.stdout 为 None。
        proc = subprocess.run(args, capture_output=True, text=True,
                              encoding='utf-8', errors='replace', env=env, timeout=timeout)
    except subprocess.TimeoutExpired:
        log_llm('codebuddy', model_eff, (time.time() - t0) * 1000, prompt, None,
                False, error='codebuddy 生成超时')
        raise RuntimeError('codebuddy 生成超时')
    except Exception as e:
        log_llm('codebuddy', model_eff, (time.time() - t0) * 1000, prompt, None,
                False, error='subprocess error: %s' % e)
        raise

    if proc.returncode != 0 and not proc.stdout.strip():
        err = 'codebuddy 退出码 %d: %s' % (proc.returncode, proc.stderr[:600])
        log_llm('codebuddy', model_eff, (time.time() - t0) * 1000, prompt, None,
                False, error=err)
        raise RuntimeError(err)

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
    result = text.strip() or None
    log_llm('codebuddy', model_eff, (time.time() - t0) * 1000, prompt, result,
            result is not None)
    return result


if __name__ == '__main__':
    # 简单自检：python ai/codebuddy_client.py "你好，回复 ok"
    if len(sys.argv) > 1:
        print(call_codebuddy(sys.argv[1]))
