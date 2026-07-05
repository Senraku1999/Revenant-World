#!/usr/bin/env python3
"""
二级标点审查 —— 三步法机械预筛脚本
对全项目 MD+JSON 文件中的每个 ，。；执行删去/替换/互换测试。
机械可判定的直接输出结果，语义模糊的标记为待人工审查。
"""

import os
import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXCLUDE_DIRS = {'.claude', 'node_modules', '.git'}

# ─── 句子分割 ───
# 中文标点中，。！？是句子结束符；，；、是句内停顿
SENTENCE_END_RE = re.compile(r'[。！？!?\n]')
# 用于提取逗号前后文
COMMA_RE = re.compile(r'，')
PERIOD_RE = re.compile(r'。')
SEMICOLON_RE = re.compile(r'；')

def find_files(root):
    """递归查找所有 .md 和 .json 文件，排除指定目录"""
    files = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        rel = os.path.relpath(dirpath, root)
        for f in filenames:
            if f.endswith(('.md', '.json')):
                files.append(os.path.join(dirpath, f))
    return files

def extract_sentences_with_context(text):
    """将文本按句子分割，返回 [(句子文本, 起始位置, 结束位置)]"""
    sentences = []
    current_start = 0
    for i, ch in enumerate(text):
        if ch in '。！？!?\n':
            sent = text[current_start:i+1].strip()
            if sent:
                sentences.append((sent, current_start, i+1))
            current_start = i + 1
    # 末尾残留
    if current_start < len(text):
        sent = text[current_start:].strip()
        if sent:
            sentences.append((sent, current_start, len(text)))
    return sentences

def find_sentence_for_pos(sentences, pos):
    """找到包含给定位置的句子"""
    for sent, start, end in sentences:
        if start <= pos < end:
            return sent, start, end
    return None, -1, -1

def extract_json_fields(obj, prefix=''):
    """递归提取 JSON 对象中的所有字符串字段，返回 [(字段路径, 字符串值)]"""
    results = []
    if isinstance(obj, str):
        return [(prefix, obj)]
    elif isinstance(obj, dict):
        for key, value in obj.items():
            field_path = f"{prefix}.{key}" if prefix else key
            results.extend(extract_json_fields(value, field_path))
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            field_path = f"{prefix}[{i}]"
            results.extend(extract_json_fields(item, field_path))
    return results

def is_in_quote(text, pos):
    """检查指定位置是否在英文直双引号内"""
    # 简单实现：计算 pos 之前的引号数量
    quote_count = text[:pos].count('"')
    return quote_count % 2 == 1

# ─── 逗号删去测试启发式规则 ───

def comma_delete_test(text_before, text_after, full_context):
    """
    执行逗号删去测试。
    返回 (是否可删, 置信度, 理由)
    """
    merged = text_before.rstrip() + text_after.lstrip()

    # 规则 1：删后出现"的的"、"了了"等重复 → 不可删
    if re.search(r'(的的|了了|着着|在在|是是|和和)', merged):
        return False, '高', '删后出现词语重复'

    # 规则 2：逗号前是单字副词（就/便/却/也/都/还/才/又/再）→ 不可删
    if len(text_before) >= 1 and text_before[-1] in '就便却也都还才又再':
        return False, '高', '逗号前为单字副词，删后粘连'

    # 规则 3：逗号后是转折/递进连词（但/而/然而/可是/不过/况且/并且/而且/然后/于是/所以/因此/因为）→ 不可删
    if re.match(r'^(但|而|然而|可是|不过|况且|并且|而且|然后|于是|所以|因此|因为|可|却)', text_after.lstrip()):
        return False, '高', '逗号后为连词，删后语义不清'

    # 规则 4：逗号在列举项之间（数字+、/顿号模式） → 若上下文有顿号列举则不可删
    if '、' in full_context:
        # 上下文有顿号列举，逗号可能是列举分层
        # 检查是否在列举序列中
        before_sent = full_context.split('，')
        if len(before_sent) >= 3:
            return False, '中', '处于多逗号序列中，可能为列举分层'

    # 规则 5：逗号前后主语不同 → 不可删
    # 简单检测：前句以名词+动词结束，后句以不同名词开头
    # 这里用简化规则：后句以显式主语开头（人称代词/专名）
    subject_starters = r'^(他|她|它|他们|她们|我|你|您|这|那|其|该|此|这些|那些)'
    if re.match(subject_starters, text_after.lstrip()):
        return False, '中', '后句有显式主语，可能主语切换'

    # 规则 6：逗号前是地名/时间状语 → 不可删（需要停顿分隔）
    time_place_patterns = r'(时|的时候|后|之后|前|之前|中|期间|以来|以后|以前)$'
    if re.search(time_place_patterns, text_before.rstrip()[-3:]):
        return False, '中', '逗号前为时间/地点状语'

    # 规则 7：删后句子超长（>60字无标点）→ 不可删
    if len(merged) > 60 and '，' not in merged and '。' not in merged:
        return False, '低', '删后句子过长(>60字)'

    # 规则 8：逗号前后是并列动词短语（同一主语）→ 可删
    # "她端起茶杯，啜了一口。" → 可删
    # 检测：前段以动词结尾，后段以动词开头
    if re.search(r'[了着过]$', text_before.rstrip()[-2:]):
        if re.match(r'^[一-鿿]+[了着过]', text_after.lstrip()):
            return True, '中', '并列动词短语，同一主语'

    # 规则 9：逗号前后语义紧密（形容词+名词、副词+动词）→ 可删
    if re.search(r'的$', text_before.rstrip()[-1:]):
        return True, '中', '定语修饰关系，删后更紧凑'

    # 默认：无法机械判定
    return None, '低', '需人工判断'


# ─── 句号替换测试启发式规则 ───

def period_replace_test(text_before, text_after, full_context, is_paragraph_end):
    """
    执行句号替换为逗号测试。
    返回 (是否应改逗号, 置信度, 理由)
    """
    # 硬止条件 1：段落末尾
    if is_paragraph_end:
        return False, '高', '硬止：段落末尾'

    # 硬止条件 2：后句为感叹/疑问
    if re.match(r'^\s*[！？!?]', text_after):
        return False, '高', '硬止：后句为感叹/疑问'

    # 硬止条件 3：后句以明显新主语开头
    subject_starters = r'^(他|她|它|他们|她们|我|你|您|这|那|其|该|此|这些|那些|一种|另|另外)'
    if re.match(subject_starters, text_after.lstrip()):
        # 但需要看是否与前句同主语
        return False, '高', '硬止：后句主语切换'

    # 条件：前句结束于名词/描述，后句是展开说明 → 应改逗号
    # "副科长。战术思维如棋盘般精密。" → 前为身份标签，后为展开
    if re.search(r'(者|家|师|长|员|人|生|手|专家|科长|成员)$', text_before.rstrip()):
        return True, '高', '前句为身份标签，后句为展开说明'

    # 条件：前后句共享同一主语 → 可能应改逗号
    # 检测：后句没有显式主语（以动词开头）
    if re.match(r'^[一-鿿]+(了|着|过|得|不|在|可|能|会|要|想|敢)', text_after.lstrip()):
        return True, '中', '后句无显式主语，可能共享主语'

    # 条件：后句是前句的结果/补充
    consecutive_patterns = r'^(于是|所以|因此|从而|进而|随后|接着|然后|便|就|也|还|都|却|仍)'
    if re.match(consecutive_patterns, text_after.lstrip()):
        return True, '中', '后句为连贯动作/结果'

    # 默认：需人工判断
    return None, '低', '需人工判断'


# ─── 分号互换测试 ───

def semicolon_swap_test(text_before, text_after):
    """
    执行分号互换测试。
    返回 (是否并列正确, 置信度, 理由)
    """
    before = text_before.strip()
    after = text_after.strip()

    # 规则 1：分号前后是 X：...；Y：... 格式 → 基本是并列
    if re.match(r'^[一-鿿]+[：:]', after):
        return True, '高', '平行对举格式(X：…；Y：…)'

    # 规则 2：分号前后字数相近、结构相似 → 可能是并列
    if abs(len(before) - len(after)) < 5:
        return True, '中', '前后分句长度接近，可能并列'

    # 规则 3：后句以"但/而/然而/于是/所以"等开头 → 非并列
    non_parallel_starters = r'^(但|而|然而|可是|于是|所以|因此|因为|然后|接着|随后|却|可|便|就)'
    if re.match(non_parallel_starters, after):
        return False, '高', '后句为转折/因果/顺序，非并列关系'

    # 默认：需人工判断
    return None, '低', '需人工判断分句关系'


# ─── 主处理流程 ───

def process_md_file(filepath, relpath):
    """处理 MD 文件"""
    results = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            text = f.read()
    except Exception as e:
        return [{'file': relpath, 'type': 'ERROR', 'msg': str(e)}]

    sentences = extract_sentences_with_context(text)

    # 处理每个逗号
    for m in COMMA_RE.finditer(text):
        pos = m.start()
        # 在引号内的逗号可能合法，但仍需审查
        sent, s_start, s_end = find_sentence_for_pos(sentences, pos)
        if sent is None:
            continue
        before = text[s_start:pos]
        after = text[pos+1:s_end]
        inside_quote = is_in_quote(text, pos)
        deletable, confidence, reason = comma_delete_test(before, after, sent)

        if deletable is True:
            results.append({
                'file': relpath,
                'field': '正文',
                'symbol': '，',
                'original': sent.strip(),
                'test': f'删去逗号："{before.rstrip()}{after.lstrip()}"',
                'suggestion': '可删',
                'confidence': confidence,
                'reason': reason,
                'note': '(引号内)' if inside_quote else ''
            })
        elif deletable is None and confidence == '低':
            # 低置信度模糊项，标记待审
            results.append({
                'file': relpath,
                'field': '正文',
                'symbol': '，',
                'original': sent.strip(),
                'test': f'删去后："{before.rstrip()}{after.lstrip()}"',
                'suggestion': '待人工判断',
                'confidence': confidence,
                'reason': reason,
                'note': '(引号内)' if inside_quote else ''
            })

    # 处理每个句号
    for m in PERIOD_RE.finditer(text):
        pos = m.start()
        sent, s_start, s_end = find_sentence_for_pos(sentences, pos)
        if sent is None:
            continue

        # 找下一个句子
        next_sent = None
        for ns, ns_start, ns_end in sentences:
            if ns_start >= s_end:
                next_sent = ns
                break

        if next_sent is None:
            continue

        is_para_end = '\n' in text[s_end:ns_start] and text[s_end:ns_start].strip() == ''

        text_before = text[s_start:pos]
        text_after = next_sent

        inside_quote = is_in_quote(text, pos)
        should_change, confidence, reason = period_replace_test(
            text_before, text_after, text[s_start:ns_end], is_para_end
        )

        if should_change is True:
            results.append({
                'file': relpath,
                'field': '正文',
                'symbol': '。',
                'original': f'{sent.strip()} {next_sent.strip()}',
                'test': f'替换为逗号："{text_before.rstrip()}，{text_after.lstrip()}"',
                'suggestion': '改逗号',
                'confidence': confidence,
                'reason': reason,
                'note': '(引号内)' if inside_quote else ''
            })
        elif should_change is None:
            results.append({
                'file': relpath,
                'field': '正文',
                'symbol': '。',
                'original': f'{sent.strip()} {next_sent.strip()}',
                'test': f'替换为逗号后："{text_before.rstrip()}，{text_after.lstrip()}"',
                'suggestion': '待人工判断',
                'confidence': confidence,
                'reason': reason,
                'note': '(引号内)' if inside_quote else ''
            })

    # 处理每个分号
    for m in SEMICOLON_RE.finditer(text):
        pos = m.start()
        sent, s_start, s_end = find_sentence_for_pos(sentences, pos)
        if sent is None:
            continue

        left = text[s_start:pos]
        right = text[pos+1:s_end]
        inside_quote = is_in_quote(text, pos)

        is_correct, confidence, reason = semicolon_swap_test(left, right)

        if is_correct is False:
            results.append({
                'file': relpath,
                'field': '正文',
                'symbol': '；',
                'original': sent.strip(),
                'test': f'互换后："{right.strip()}；{left.strip()}"（语义改变）',
                'suggestion': '改为逗号或句号',
                'confidence': confidence,
                'reason': reason,
                'note': '(引号内)' if inside_quote else ''
            })
        elif is_correct is None:
            results.append({
                'file': relpath,
                'field': '正文',
                'symbol': '；',
                'original': sent.strip(),
                'test': f'互换测试："{right.strip()}；{left.strip()}"',
                'suggestion': '待人工判断',
                'confidence': confidence,
                'reason': reason,
                'note': '(引号内)' if inside_quote else ''
            })

    return results


def process_json_file(filepath, relpath):
    """处理 JSON 文件，提取字符串字段"""
    results = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        return [{'file': relpath, 'type': 'ERROR', 'msg': str(e)}]

    fields = extract_json_fields(data)

    for field_path, text in fields:
        if not text or not isinstance(text, str) or len(text) < 5:
            continue

        # 跳过纯英文/数字字段
        if not re.search(r'[一-鿿]', text):
            continue

        sentences = extract_sentences_with_context(text)

        # 处理逗号
        for m in COMMA_RE.finditer(text):
            pos = m.start()
            sent, s_start, s_end = find_sentence_for_pos(sentences, pos)
            if sent is None:
                continue
            before = text[s_start:pos]
            after = text[pos+1:s_end]
            deletable, confidence, reason = comma_delete_test(before, after, text[s_start:s_end])

            if deletable is True:
                results.append({
                    'file': relpath,
                    'field': field_path,
                    'symbol': '，',
                    'original': text[s_start:s_end].strip(),
                    'test': f'删去逗号："{before.rstrip()}{after.lstrip()}"',
                    'suggestion': '可删',
                    'confidence': confidence,
                    'reason': reason,
                    'note': ''
                })

        # 处理句号
        for m in PERIOD_RE.finditer(text):
            pos = m.start()
            sent, s_start, s_end = find_sentence_for_pos(sentences, pos)
            if sent is None:
                continue

            next_sent_text = text[s_end:].lstrip()
            next_end = text.find('。', s_end)
            if next_end == -1:
                next_end = len(text)
            next_sent = text[s_end:next_end].strip()

            if not next_sent:
                continue

            is_para_end = (pos == len(text.rstrip()) - 1) or (s_end >= len(text.rstrip()))

            text_before = text[s_start:pos]
            should_change, confidence, reason = period_replace_test(
                text_before, next_sent, text[s_start:next_end], is_para_end
            )

            if should_change is True:
                results.append({
                    'file': relpath,
                    'field': field_path,
                    'symbol': '。',
                    'original': f'{text[s_start:s_end].strip()} {next_sent}',
                    'test': f'替换为逗号："{text_before.rstrip()}，{next_sent}"',
                    'suggestion': '改逗号',
                    'confidence': confidence,
                    'reason': reason,
                    'note': ''
                })
            elif should_change is None:
                results.append({
                    'file': relpath,
                    'field': field_path,
                    'symbol': '。',
                    'original': f'{text[s_start:s_end].strip()} {next_sent}',
                    'test': f'替换为逗号后："{text_before.rstrip()}，{next_sent}"',
                    'suggestion': '待人工判断',
                    'confidence': confidence,
                    'reason': reason,
                    'note': ''
                })

        # 处理分号
        for m in SEMICOLON_RE.finditer(text):
            pos = m.start()
            sent, s_start, s_end = find_sentence_for_pos(sentences, pos)
            if sent is None:
                continue
            left = text[s_start:pos]
            right = text[pos+1:s_end]
            is_correct, confidence, reason = semicolon_swap_test(left, right)

            if is_correct is False or is_correct is None:
                results.append({
                    'file': relpath,
                    'field': field_path,
                    'symbol': '；',
                    'original': text[s_start:s_end].strip(),
                    'test': f'互换后："{right.strip()}；{left.strip()}"',
                    'suggestion': '改为逗号或句号' if is_correct is False else '待人工判断',
                    'confidence': confidence,
                    'reason': reason,
                    'note': ''
                })

    return results


def main():
    print("=" * 80)
    print("二级标点审查 · 三步法机械预筛")
    print("=" * 80)

    all_files = find_files(PROJECT_ROOT)
    print(f"\n找到 {len(all_files)} 个文件")

    all_results = []
    error_count = 0

    for i, filepath in enumerate(all_files):
        relpath = os.path.relpath(filepath, PROJECT_ROOT)

        if (i + 1) % 50 == 0:
            print(f"  进度: {i+1}/{len(all_files)} ({len(all_results)} 项标记)")

        if filepath.endswith('.json'):
            results = process_json_file(filepath, relpath)
        else:
            results = process_md_file(filepath, relpath)

        all_results.extend(results)
        if results and results[0].get('type') == 'ERROR':
            error_count += 1

    print(f"\n处理完成: {len(all_files)} 文件, {error_count} 错误")

    # ─── 分类汇总 ───
    comma_deletable = [r for r in all_results if r.get('symbol') == '，' and r.get('suggestion') == '可删']
    comma_ambiguous = [r for r in all_results if r.get('symbol') == '，' and r.get('suggestion') == '待人工判断']
    period_changeable = [r for r in all_results if r.get('symbol') == '。' and r.get('suggestion') == '改逗号']
    period_ambiguous = [r for r in all_results if r.get('symbol') == '。' and r.get('suggestion') == '待人工判断']
    semicolon_issues = [r for r in all_results if r.get('symbol') == '；']

    print(f"\n─── 汇总 ───")
    print(f"逗号可删 (高/中置信度): {len(comma_deletable)}")
    print(f"逗号待人工判断: {len(comma_ambiguous)}")
    print(f"句号应改逗号 (高/中置信度): {len(period_changeable)}")
    print(f"句号待人工判断: {len(period_ambiguous)}")
    print(f"分号问题项: {len(semicolon_issues)}")
    print(f"总计标记: {len(all_results)}")

    # ─── 输出详细结果 ───
    output_path = os.path.join(PROJECT_ROOT, '创作者文件', '审查文件', '二级审查', '二级审查结果.txt')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write("=" * 80 + "\n")
        f.write("二级标点审查 · 三步法机械预筛结果\n")
        f.write("=" * 80 + "\n\n")

        sections = [
            ("─── 一、逗号可删（删去测试通过）───", comma_deletable),
            ("─── 二、句号应改逗号（替换测试通过）───", period_changeable),
            ("─── 三、分号问题项（互换测试未通过）───", semicolon_issues),
            ("─── 四、逗号待人工判断（模糊项）───", comma_ambiguous),
            ("─── 五、句号待人工判断（模糊项）───", period_ambiguous),
        ]

        for section_title, items in sections:
            f.write(f"\n{section_title} ({len(items)} 项)\n\n")
            for item in items:
                f.write(f"文件: {item['file']}\n")
                f.write(f"字段: {item.get('field', '正文')}\n")
                f.write(f"符号: {item['symbol']}\n")
                f.write(f"原句: {item['original']}\n")
                f.write(f"测试: {item['test']}\n")
                f.write(f"建议: {item['suggestion']} | 置信度: {item['confidence']} | 理由: {item.get('reason', '')}\n")
                if item.get('note'):
                    f.write(f"备注: {item['note']}\n")
                f.write("---\n")

        # 按文件分组的统计
        f.write(f"\n\n─── 按文件分组统计 ───\n\n")
        file_groups = {}
        for r in all_results:
            fname = r['file']
            if fname not in file_groups:
                file_groups[fname] = {'comma_del': 0, 'comma_amb': 0, 'period_chg': 0, 'period_amb': 0, 'semi': 0}
            if r.get('symbol') == '，' and r.get('suggestion') == '可删':
                file_groups[fname]['comma_del'] += 1
            elif r.get('symbol') == '，' and r.get('suggestion') == '待人工判断':
                file_groups[fname]['comma_amb'] += 1
            elif r.get('symbol') == '。' and r.get('suggestion') == '改逗号':
                file_groups[fname]['period_chg'] += 1
            elif r.get('symbol') == '。' and r.get('suggestion') == '待人工判断':
                file_groups[fname]['period_amb'] += 1
            elif r.get('symbol') == '；':
                file_groups[fname]['semi'] += 1

        for fname in sorted(file_groups.keys()):
            g = file_groups[fname]
            total = sum(g.values())
            if total > 0:
                f.write(f"{fname}: 逗可删{g['comma_del']} 逗模糊{g['comma_amb']} 句改逗{g['period_chg']} 句模糊{g['period_amb']} 分号{g['semi']} (共{total})\n")

    print(f"\n详细结果已输出到: {output_path}")
    return all_results


if __name__ == '__main__':
    results = main()
