# -*- coding: utf-8 -*-
"""
AI 平台适配器（对齐 testcase-gen-frontend/server/index.js 的 callAIProvider）。

三通道（由 data/ai_config.json 的 ai.provider 决定）：
  - codebuddy：调用全局 codebuddy CLI（ai/codebuddy_client.py），超时/异常返回 None
  - openai  ：调用 OpenAI 兼容 REST 端点（豆包/火山方舟/腾讯 TokenHub/codebuddy2api 等）
  - none     ：不调用，返回 None

统一入口 call_provider(prompt, system=None)：
  - 返回 AI 文本，或 None（none 通道 / 失败）。调用方据此决定是否走确定性回退。
"""
import os
import sys
import json
import urllib.request
import urllib.error

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from ai_config import get_config
from codebuddy_client import call_codebuddy

DEFAULT_SYSTEM = (
    '你是测试用例与质量规则生成专家。'
    '请使用 Markdown 结构输出：#/## 标题、- 列表、``` 代码块，'
    '确保可被知识库质量门控收录。'
)


def call_openai(prompt, system=None, cfg=None):
    cfg = cfg or get_config()
    ai = cfg['ai']
    if not ai.get('endpoint'):
        return None
    sys_msg = system or DEFAULT_SYSTEM
    payload = {
        'model': ai.get('model') or 'claude-sonnet-4',
        'messages': [
            {'role': 'system', 'content': sys_msg},
            {'role': 'user', 'content': prompt},
        ],
    }
    req = urllib.request.Request(
        ai['endpoint'],
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (ai.get('apiKey') or ''),
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            j = json.loads(resp.read().decode('utf-8'))
        return (j.get('choices') or [{}])[0].get('message', {}).get('content') or None
    except Exception:
        return None


def call_provider(prompt, system=None, cfg=None):
    cfg = cfg or get_config()
    ai = cfg['ai']
    provider = ai.get('provider', 'none')
    if provider == 'codebuddy':
        # useCustomModel=true 时通过 .codebuddy/models.json 注册的自有模型 endpoint 由 CodeBuddy 路由
        load_settings = bool(ai.get('useCustomModel', False))
        try:
            return call_codebuddy(prompt, model=ai.get('model') or None, load_settings=load_settings)
        except Exception:
            return None
    if provider == 'openai':
        return call_openai(prompt, system=system, cfg=cfg)
    return None


if __name__ == '__main__':
    # 自检：python ai/ai_adapter.py "简要介绍质量门控"
    if len(sys.argv) > 1:
        print(call_provider(sys.argv[1]) or '(no response / provider=none)')
