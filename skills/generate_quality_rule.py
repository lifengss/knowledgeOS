# -*- coding: utf-8 -*-
"""
依据人工编辑前后的新旧内容，生成“质量规则”草稿。

流程（对齐设计“链路 3a：人工编辑优化”）：
  1. 由 old / new 构造 diff 提示词；
  2. 调用 AI 平台提炼校验规则（ai/ai_adapter.call_provider，通道见 data/ai_config.json）；
  3. 若未配置 AI 或调用失败，回退“确定性 diff 拼装”：用 difflib 计算差异并生成
     带变更标注的质量规则 Markdown（稳定、可离线、可复现）。

输出 JSON：{"source": "ai" | "deterministic", "content": "<Markdown>"}

用法：
  python skills/generate_quality_rule.py --title "..." --old "..." --new "..."
"""
import os
import sys
import json
import difflib
import argparse

# 复用知识库 AI 适配器
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'ai'))
from ai_adapter import call_provider

SYSTEM = (
    '你是知识库质量规则生成专家。用户会给出一条知识条目“修改前”与“修改后”的内容，'
    '以及条目标题。请对比两者差异，提炼出此次人工编辑所沉淀的“质量规则 / 校验规则”，'
    '用 Markdown 输出：以 # 标题概括规则主题，下列出 - 规则条目，必要时用 ``` 代码块给出示例。'
    '规则应可被执行回流（exec_backflow）校验，聚焦“什么算正确 / 什么算违规”。'
)


def build_prompt(title, old, new):
    return (
        '知识条目标题：{title}\n\n'
        '==== 修改前 ====\n{old}\n\n'
        '==== 修改后 ====\n{new}\n\n'
        '请对比上述前后差异，生成对应的质量规则（Markdown）。'
    ).format(title=title or '未命名条目', old=old or '(空)', new=new or '(空)')


def deterministic_rule(title, old, new):
    old_lines = (old or '').splitlines()
    new_lines = (new or '').splitlines()
    diff = list(difflib.unified_diff(
        old_lines, new_lines, lineterm='', fromfile='修改前', tofile='修改后',
    ))
    diff_text = '\n'.join(diff) if diff else '(无文本差异，仅格式/空白变化)'
    return (
        '# 质量规则：{title}\n\n'
        '> 来源：人工编辑自动沉淀（确定性 diff 回退生成）\n\n'
        '## 变更摘要\n'
        '本次编辑相对原条目产生以下差异，据此形成校验规则：\n\n'
        '```diff\n{diff}\n```\n\n'
        '## 建议校验规则\n'
        '- 条目「{title}」的以下要点应被保留并作为校验基准：\n'
        '  - 修改后新增/调整的内容视为有效规则增量；\n'
        '  - 被删除的内容若仍具约束力，应在回归测试中保留对应断言。\n'
        '- 任何回写该条目的操作须与“修改后”内容一致，冲突检测应拦截偏离。\n'
    ).format(title=title or '未命名条目', diff=diff_text)


def generate(title, old, new):
    prompt = build_prompt(title, old, new)
    try:
        text = call_provider(prompt, system=SYSTEM)
    except Exception:
        text = None
    if text and text.strip():
        return {'source': 'ai', 'content': text.strip()}
    return {'source': 'deterministic', 'content': deterministic_rule(title, old, new)}


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--title', default='未命名条目')
    p.add_argument('--old', default='')
    p.add_argument('--new', default='')
    args = p.parse_args()
    res = generate(args.title, args.old, args.new)
    print(json.dumps(res, ensure_ascii=False))


if __name__ == '__main__':
    main()
