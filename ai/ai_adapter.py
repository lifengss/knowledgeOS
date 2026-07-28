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
import time
import urllib.request
import urllib.error

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from ai_config import get_config
from codebuddy_client import call_codebuddy
from llm_logger import log_app, log_llm

DEFAULT_SYSTEM = (
    '你是测试用例与质量规则生成专家。'
    '请使用 Markdown 结构输出：#/## 标题、- 列表、``` 代码块，'
    '确保可被知识库质量门控收录。'
)


def call_openai(prompt, system=None, cfg=None):
    cfg = cfg or get_config()
    ai = cfg['ai']
    endpoint = (ai.get('endpoint') or '').rstrip('/')
    if not endpoint:
        return None
    # 归一化：gbrain 等段配置的是 base URL（如 https://x/v1），需补 /chat/completions；
    # 已填完整 chat/completions URL 的（如 codebuddy2api）则保持原样。
    if not endpoint.endswith('/chat/completions'):
        endpoint = endpoint + '/chat/completions'
    sys_msg = system or DEFAULT_SYSTEM
    payload = {
        'model': ai.get('model') or 'claude-sonnet-4',
        'messages': [
            {'role': 'system', 'content': sys_msg},
            {'role': 'user', 'content': prompt},
        ],
    }
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (ai.get('apiKey') or ''),
        },
        method='POST',
    )
    model = ai.get('model') or 'claude-sonnet-4'
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            j = json.loads(resp.read().decode('utf-8'))
        content = (j.get('choices') or [{}])[0].get('message', {}).get('content') or None
        log_llm('openai', model, (time.time() - t0) * 1000, prompt, content,
                content is not None, endpoint=endpoint)
        return content
    except Exception as e:
        log_llm('openai', model, (time.time() - t0) * 1000, prompt, None,
                False, error='openai error: %s' % e, endpoint=endpoint)
        return None


def call_provider(prompt, system=None, cfg=None):
    cfg = cfg or get_config()
    ai = cfg['ai']
    provider = ai.get('provider', 'none')
    log_app('info', 'ai call_provider', src='ai_adapter', provider=provider,
            model=ai.get('model'), use_custom_model=bool(ai.get('useCustomModel', False)))
    if provider == 'codebuddy':
        # useCustomModel=true 时通过 .codebuddy/models.json 注册的自有模型 endpoint 由 CodeBuddy 路由
        load_settings = bool(ai.get('useCustomModel', False))
        try:
            r = call_codebuddy(prompt, model=ai.get('model') or None, load_settings=load_settings)
        except Exception as e:
            log_app('warning', 'codebuddy channel failed', src='ai_adapter',
                    error=str(e), fallback='openai/gbrain')
            r = None
        if r:
            log_app('info', 'ai result from codebuddy', src='ai_adapter')
            return r
        # codebuddy 通道不可用（未登录 / 未安装 CLI）时，回退链：
        # 1) ai 段已显式配置的 OpenAI 兼容端点；
        if ai.get('endpoint'):
            log_app('info', 'fallback -> openai(ai.endpoint)', src='ai_adapter')
            return call_openai(prompt, system=system, cfg=cfg)
        # 2) 否则复用 gbrain 段配置的 LLM 端点（如 icompify/minimax-m3），
        #    使业务图谱等依赖 AI 的功能在 CLI 不可用时仍能用真实 LLM 产出中文语义图，
        #    而非退化为英文确定性骨架。gbrain 段与 ai 段字段结构一致（endpoint/apiKey/model）。
        gbrain = cfg.get('gbrain') or {}
        if gbrain.get('endpoint'):
            log_app('info', 'fallback -> openai(gbrain.endpoint)', src='ai_adapter')
            return call_openai(prompt, system=system, cfg={'ai': gbrain})
        log_app('warning', 'no AI channel available, deterministic fallback will be used',
                src='ai_adapter')
        return None
    if provider == 'openai':
        return call_openai(prompt, system=system, cfg=cfg)
    log_app('info', 'provider=none, no AI call', src='ai_adapter')
    return None


if __name__ == '__main__':
    # 自检：python ai/ai_adapter.py "简要介绍质量门控"
    if len(sys.argv) > 1:
        print(call_provider(sys.argv[1]) or '(no response / provider=none)')
