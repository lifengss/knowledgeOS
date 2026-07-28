# -*- coding: utf-8 -*-
"""
统一日志模块（知识系统 AI 层）。

两类日志，按天轮转，启动时按 mtime 精确清理（保留期与需求一致）：
  - 应用/操作日志：logs/app.log（及 logs/app.log.YYYY-MM-DD 轮转备份），保留 7 天。
  - 大模型请求/响应日志：logs/llm/app-llm.log（含完整 prompt + response），保留 1 天。

格式：每行一条 JSON（JSON Lines），便于 grep / jq / 脚本分析。
纯后台文件写入，不涉及任何前端展示。

注意：KS 为「每请求 spawn 一个 Python 子进程」模型，本模块以 append 模式写共享文件；
多进程并发轮转同一文件在单主机开发环境下可接受（竞态概率极低）。
"""
import os
import sys
import json
import logging
import logging.handlers
import time

_HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(_HERE)
LOG_DIR = os.path.join(PROJECT_ROOT, 'logs')
LLM_DIR = os.path.join(LOG_DIR, 'llm')

APP_RETENTION_DAYS = 7
LLM_RETENTION_DAYS = 1


def _ensure_dirs():
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        os.makedirs(LLM_DIR, exist_ok=True)
    except Exception:
        pass


def _json_format(record):
    """把 LogRecord 序列化为单行 JSON。"""
    payload = {
        'ts': time.strftime('%Y-%m-%dT%H:%M:%S', time.localtime(record.created)),
        'level': record.levelname.lower(),
    }
    msg = record.getMessage()
    # 通过 extra 注入的结构化字段（注意避开 LogRecord 内建名：module/msg/levelname 等）
    for key in ('src', 'event', 'provider', 'model', 'use_custom_model',
                'duration_ms', 'prompt_len', 'response_len', 'success', 'error',
                'prompt', 'response', 'fallback', 'detail'):
        if hasattr(record, key):
            payload[key] = getattr(record, key)
    payload['msg'] = msg
    if record.exc_info:
        payload['exc'] = record.exc_info and getattr(record, 'exc_text', None)
    return json.dumps(payload, ensure_ascii=False)


class _JsonFormatter(logging.Formatter):
    def format(self, record):
        return _json_format(record)


def _make_handler(subdir, basename, retention_days):
    _ensure_dirs()
    target_dir = LOG_DIR if subdir is None else os.path.join(LOG_DIR, subdir)
    os.makedirs(target_dir, exist_ok=True)
    path = os.path.join(target_dir, basename)
    # 按天轮转：午夜切分，保留 backupCount 个备份作为安全网；
    # 真正的到期删除由 sweep_logs() 按 mtime 统一执行，保证精确保留期。
    handler = logging.handlers.TimedRotatingFileHandler(
        path, when='midnight', backupCount=max(retention_days, 1),
        encoding='utf-8', delay=True,
    )
    handler.setFormatter(_JsonFormatter())
    return handler


_app_logger = None
_llm_logger = None


def _get_app_logger():
    global _app_logger
    if _app_logger is None:
        lg = logging.getLogger('ks.app')
        lg.setLevel(logging.INFO)
        lg.propagate = False
        if not lg.handlers:
            lg.addHandler(_make_handler(None, 'app.log', APP_RETENTION_DAYS))
        _app_logger = lg
    return _app_logger


def _get_llm_logger():
    global _llm_logger
    if _llm_logger is None:
        lg = logging.getLogger('ks.llm')
        lg.setLevel(logging.INFO)
        lg.propagate = False
        if not lg.handlers:
            lg.addHandler(_make_handler('llm', 'app-llm.log', LLM_RETENTION_DAYS))
        _llm_logger = lg
    return _llm_logger


def sweep_logs():
    """按 mtime 删除超过保留期的日志文件（精确到期清理）。"""
    now = time.time()
    try:
        for fn in os.listdir(LOG_DIR):
            fp = os.path.join(LOG_DIR, fn)
            if not os.path.isfile(fp):
                continue
            if fn == 'llm' or fn.startswith('llm' + os.sep):
                continue
            _maybe_delete(fp, now, APP_RETENTION_DAYS)
    except Exception:
        pass
    try:
        for fn in os.listdir(LLM_DIR):
            fp = os.path.join(LLM_DIR, fn)
            if os.path.isfile(fp):
                _maybe_delete(fp, now, LLM_RETENTION_DAYS)
    except Exception:
        pass


def _maybe_delete(fp, now, retention_days):
    try:
        age = now - os.path.getmtime(fp)
        if age > retention_days * 86400:
            os.remove(fp)
    except Exception:
        pass


# 导入即清理一次（每次 AI 子进程启动时执行，开销极小）
try:
    sweep_logs()
except Exception:
    pass


def log_app(level, msg, **meta):
    lg = _get_app_logger()
    lg.log(getattr(logging, level.upper(), logging.INFO), msg, extra=meta)


def log_llm(provider, model, duration_ms, prompt, response, success,
            error=None, **extra):
    """记录一次大模型请求/响应（完整 prompt + response，保留 1 天）。"""
    lg = _get_llm_logger()
    lg.info(
        'llm %s' % ('ok' if success else 'fail'),
        extra={
            'provider': provider,
            'model': model,
            'duration_ms': int(duration_ms),
            'prompt_len': len(prompt or ''),
            'response_len': len(response or ''),
            'success': bool(success),
            'error': error,
            'prompt': prompt,
            'response': response,
            **extra,
        },
    )


if __name__ == '__main__':
    log_app('info', 'llm_logger self-check', src='llm_logger')
    log_llm('codebuddy', 'kimi-k2.7-code', 1234, 'ping', 'pong', True)
    print('llm_logger ok ->', LOG_DIR)
