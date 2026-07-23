# -*- coding: utf-8 -*-
"""
AI 平台配置中心（对齐 testcase-gen-frontend/server/config.js 的设计）。

- 默认值从环境变量种子：AI_PROVIDER / AI_ENDPOINT / AI_API_KEY / AI_MODEL / AI_USE_CUSTOM_MODEL
- 运行时修改持久化到 data/ai_config.json（与前端 data/config.json 同位思想：env 种子 + 文件热更新）
- 单例（进程内 get() 实时读取文件，便于 REST/CLI 复用同一份事实）
- 子命令：
    python ai/ai_config.py get
    python ai/ai_config.py set --json '{"ai":{"provider":"openai","endpoint":"...","apiKey":"...","model":"...","useCustomModel":false}}'
"""
import os
import sys
import json
import shutil
import subprocess

# data/ai_config.json 位于项目根的 data 目录
_CONFIG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
CONFIG_PATH = os.path.join(_CONFIG_DIR, 'ai_config.json')


def _defaults():
    return {
        'ai': {
            'provider': os.environ.get('AI_PROVIDER', 'none'),          # openai | codebuddy | none
            'useCustomModel': str(os.environ.get('AI_USE_CUSTOM_MODEL', 'false')).lower() == 'true',
            'endpoint': os.environ.get('AI_ENDPOINT', ''),
            'apiKey': os.environ.get('AI_API_KEY', ''),
            'model': os.environ.get('AI_MODEL', 'claude-sonnet-4'),
        },
        # GBrain 所用大模型：支撑 Wiki 摘要、实体抽取、TOC 生成等智能能力
        'gbrain': {
            'provider': os.environ.get('GBRAIN_PROVIDER', 'openai'),    # openai | none
            'endpoint': os.environ.get('GBRAIN_ENDPOINT', ''),
            'apiKey': os.environ.get('GBRAIN_API_KEY', ''),
            'model': os.environ.get('GBRAIN_MODEL', 'gpt-4o-mini'),
        },
        # 语义检索（向量 embeddings）所用模型：缺省回退 gbrain 配置
        'embedding': {
            'endpoint': os.environ.get('EMBEDDING_ENDPOINT', ''),
            'apiKey': os.environ.get('EMBEDDING_API_KEY', ''),
            'model': os.environ.get('EMBEDDING_MODEL', ''),
        },
        # 知识库落库路径（GBrain 存储根目录）：运行时经系统设置调整
        'storage': {
            'knowledgeBasePath': '',
        },
    }


def _deep_copy(cfg):
    return json.loads(json.dumps(cfg))


def _gbrain_home():
    """GBrain 落库目录（即 .gbrain 目录本身），由 GBRAIN_HOME 环境变量决定。"""
    return os.environ.get('GBRAIN_HOME') or os.path.join(os.path.expanduser('~'), '.gbrain')


def _set_gbrain_home_env(p):
    """持久化 GBRAIN_HOME 环境变量（Windows 用 setx，写入用户环境注册表）。"""
    try:
        if sys.platform.startswith('win'):
            subprocess.run(['setx', 'GBRAIN_HOME', p], check=False, capture_output=True)
    except Exception:
        pass


def _apply_storage(storage, current_kb=None):
    """应用知识库落库路径变更：把 GBrain 的 .gbrain 数据迁移到 <path>/.gbrain，
    并更新其 config.json 的 database_path，再持久化 GBRAIN_HOME。
    current_kb 为变更前的落库根目录（来自已保存配置），用作迁移源。"""
    kb = (storage or {}).get('knowledgeBasePath', '').strip()
    if not kb:
        return
    kb_abs = os.path.abspath(kb)
    new_home = os.path.join(kb_abs, '.gbrain')
    if current_kb:
        cur_home = os.path.join(os.path.abspath(current_kb), '.gbrain')
    else:
        cur_home = _gbrain_home()
    if os.path.abspath(new_home) == os.path.abspath(cur_home):
        return  # 路径未变，无需迁移
    os.makedirs(new_home, exist_ok=True)
    # 迁移旧目录内容到新目录
    if os.path.isdir(cur_home):
        try:
            for name in os.listdir(cur_home):
                src = os.path.join(cur_home, name)
                dst = os.path.join(new_home, name)
                if os.path.exists(dst):
                    continue
                shutil.move(src, dst)
            if not os.listdir(cur_home):
                os.rmdir(cur_home)
        except Exception:
            pass
    # 更新新目录内 config.json 的 database_path
    cfg_path = os.path.join(new_home, 'config.json')
    if os.path.isfile(cfg_path):
        try:
            with open(cfg_path, 'r', encoding='utf-8') as f:
                gc = json.load(f)
            gc['database_path'] = os.path.join(new_home, 'brain.pglite')
            with open(cfg_path, 'w', encoding='utf-8') as f:
                json.dump(gc, f, ensure_ascii=False, indent=2)
        except Exception:
            pass
    # 持久化 GBRAIN_HOME 环境变量，使 GBrain 落库路径同步修改
    _set_gbrain_home_env(new_home)


def load_config():
    """读取配置：env 默认值 + 文件覆盖（文件不存在返回默认值）。"""
    cfg = _deep_copy(_defaults())
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                saved = json.load(f)
            if isinstance(saved, dict):
                if isinstance(saved.get('ai'), dict):
                    cfg['ai'].update(saved['ai'])
                if isinstance(saved.get('gbrain'), dict):
                    cfg['gbrain'].update(saved['gbrain'])
                if isinstance(saved.get('embedding'), dict):
                    cfg['embedding'].update(saved['embedding'])
                if isinstance(saved.get('storage'), dict):
                    cfg['storage'].update(saved['storage'])
        except Exception:
            pass
    # 默认填当前 GBrain 落库根目录（GBRAIN_HOME 的父目录）
    if not cfg['storage'].get('knowledgeBasePath'):
        cfg['storage']['knowledgeBasePath'] = os.path.dirname(_gbrain_home())
    return cfg


def save_config(cfg):
    os.makedirs(_CONFIG_DIR, exist_ok=True)
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    return cfg


def get_config():
    return load_config()


def set_config(partial):
    """局部更新：接受 {ai:{...}, gbrain:{...}, storage:{...}} 或扁平 {...}，仅覆盖对应段下的字段。"""
    cfg = load_config()
    old_kb = cfg['storage'].get('knowledgeBasePath', '')
    if isinstance(partial, dict):
        for section in ('ai', 'gbrain', 'embedding', 'storage'):
            src = partial.get(section) if section in partial else partial
            if isinstance(src, dict):
                for k, v in src.items():
                    cfg[section][k] = v
        # 应用存储路径变更（迁移 GBrain 落库）
        if isinstance(partial.get('storage'), dict):
            _apply_storage(partial['storage'], old_kb)
    return save_config(cfg)


def _parse_json_arg(args):
    for i, a in enumerate(args):
        if a == '--json' and i + 1 < len(args):
            return args[i + 1]
    return None


def main():
    args = sys.argv[1:]
    if not args or args[0] == 'get':
        print(json.dumps(get_config(), ensure_ascii=False))
        return
    if args[0] == 'set':
        raw = _parse_json_arg(args)
        if raw:
            try:
                partial = json.loads(raw)
            except Exception as e:
                print(json.dumps({'success': False, 'error': 'JSON 解析失败: ' + str(e)}, ensure_ascii=False))
                sys.exit(1)
            print(json.dumps({'success': True, 'data': set_config(partial)}, ensure_ascii=False))
        else:
            print(json.dumps({'success': False, 'error': '缺少 --json 参数'}, ensure_ascii=False))
        return
    print(json.dumps({'success': False, 'error': 'unknown cmd: ' + args[0]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
