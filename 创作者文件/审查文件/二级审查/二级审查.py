#!/usr/bin/env python3
"""
二级标点审查 —— 三步法机械预筛脚本
对全项目 MD+JSON 文件中的每个 ，。；：！？执行合法性测试。
机械可判定的直接输出结果，语义模糊的标记为待人工审查。

覆盖标点：，删去测试 / 。替换测试 / ；互换测试 / ：合法性判断 / ！？叙述违禁检测
"""

import os
import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
EXCLUDE_DIRS = {'.claude', 'node_modules', '.git'}

# ─── 句子分割 ───
SENTENCE_END_RE = re.compile(r'[。！？!?\n]')
COMMA_RE = re.compile(r'，')
PERIOD_RE = re.compile(r'。')
SEMICOLON_RE = re.compile(r'；')
COLON_RE = re.compile(r'：')
EXCLAM_RE = re.compile(r'[！？]')


# ─── 引号区间 ──────────────────────────────────────
def find_quote_ranges(text):
    """预扫描全文，返回所有英文直双引号 "..." 的区间列表 [(start, end), ...]"""
    ranges = []
    i = 0
    while i < len(text):
        pos = text.find('"', i)
        if pos == -1:
            break
        end_pos = text.find('"', pos + 1)
        if end_pos == -1:
            break  # 未闭合引号，忽略
        ranges.append((pos, end_pos))
        i = end_pos + 1
    return ranges


def is_in_quote_range(pos, ranges):
    """检查 pos 是否落在任一引号区间内"""
    for start, end in ranges:
        if start < pos < end:
            return True
    return False


def find_files(root):
    """仅扫描角色卡目录和 World Info（世界观条目），排除项目文档和工具目录"""
    # 只扫描这两个目录，CLAUDE.md、说明书.md、小说化内容等不在此列
    scan_roots = [
        os.path.join(root, '角色卡'),
        os.path.join(root, '创作者文件', '导出文件', 'world info'),
    ]
    files = []
    for scan_root in scan_roots:
        if not os.path.isdir(scan_root):
            continue
        for dirpath, dirnames, filenames in os.walk(scan_root):
            dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
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


# ─── MD 简介模板行判断 ──────────────────────────────
# 简介中的结构化标签行，冒号为格式需要，不应被审查
MD_TEMPLATE_LABELS = r'^(姓名|一般称呼|性别|年龄|身高|体重|从属|身份|评级|特征|灵力|灵视|身体素质|评估方|武器|防具|[一二三四五六七八九十]、\S+)：'


def is_md_template_colon(line, col_pos):
    """判断冒号是否位于 MD 简介模板标签位置"""
    stripped = line.strip()
    return bool(re.match(MD_TEMPLATE_LABELS, stripped))


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

    # 规则 3：逗号后是转折/递进连词 → 不可删
    if re.match(r'^(但|而|然而|可是|不过|况且|并且|而且|然后|于是|所以|因此|因为|可|却)', text_after.lstrip()):
        return False, '高', '逗号后为连词，删后语义不清'

    # 规则 4：处于多逗号列举序列中 → 不可删
    if '、' in full_context:
        before_sent = full_context.split('，')
        if len(before_sent) >= 3:
            return False, '中', '处于多逗号序列中，可能为列举分层'

    # 规则 5：逗号前后主语不同 → 不可删
    subject_starters = r'^(他|她|它|他们|她们|我|你|您|这|那|其|该|此|这些|那些)'
    if re.match(subject_starters, text_after.lstrip()):
        return False, '中', '后句有显式主语，可能主语切换'

    # 规则 6：逗号前是地名/时间状语 → 不可删
    time_place_patterns = r'(时|的时候|后|之后|前|之前|中|期间|以来|以后|以前)$'
    if re.search(time_place_patterns, text_before.rstrip()[-3:]):
        return False, '中', '逗号前为时间/地点状语'

    # 规则 7：删后句子超长（>60字无标点）→ 不可删
    if len(merged) > 60 and '，' not in merged and '。' not in merged:
        return False, '低', '删后句子过长(>60字)'

    # 规则 8：逗号前后是并列动词短语（同一主语）→ 可删
    if re.search(r'[了着过]$', text_before.rstrip()[-2:]):
        if re.match(r'^[一-鿿]+[了着过]', text_after.lstrip()):
            return True, '中', '并列动词短语，同一主语'

    # 规则 9：逗号前后语义紧密（定语修饰）→ 可删
    if re.search(r'的$', text_before.rstrip()[-1:]):
        return True, '中', '定语修饰关系，删后更紧凑'

    return None, '低', '需人工判断'


# ─── 句号替换测试启发式规则 ───

def period_replace_test(text_before, text_after, full_context, is_paragraph_end):
    """
    执行句号替换为逗号测试。
    返回 (是否应改逗号, 置信度, 理由)
    """
    if is_paragraph_end:
        return False, '高', '硬止：段落末尾'

    if re.match(r'^\s*[！？!?]', text_after):
        return False, '高', '硬止：后句为感叹/疑问'

    # 后句以代词开头 → 降级为待人工复核（同主语连续动作合法，如"他放下杯子。他转身。")
    subject_starters = r'^(他|她|它|他们|她们|我|你|您|这|那|其|该|此|这些|那些|一种|另|另外)'
    if re.match(subject_starters, text_after.lstrip()):
        return None, '中', '后句代词开头，可能共享主语（待人工复核）'

    # 前句为身份标签，后句为展开说明 → 应改逗号
    if re.search(r'(者|家|师|长|员|人|生|手|专家|科长|成员)$', text_before.rstrip()):
        return True, '高', '前句为身份标签，后句为展开说明'

    # 后句无显式主语 → 可能共享主语
    if re.match(r'^[一-鿿]+(了|着|过|得|不|在|可|能|会|要|想|敢)', text_after.lstrip()):
        return True, '中', '后句无显式主语，可能共享主语'

    # 后句为连贯动作/结果
    consecutive_patterns = r'^(于是|所以|因此|从而|进而|随后|接着|然后|便|就|也|还|都|却|仍)'
    if re.match(consecutive_patterns, text_after.lstrip()):
        return True, '中', '后句为连贯动作/结果'

    return None, '低', '需人工判断'


# ─── 分号互换测试 ───

def semicolon_swap_test(text_before, text_after):
    """
    执行分号互换测试。
    返回 (是否并列正确, 置信度, 理由)
    """
    before = text_before.strip()
    after = text_after.strip()

    if re.match(r'^[一-鿿]+[：:]', after):
        return True, '高', '平行对举格式(X：…；Y：…)'

    if abs(len(before) - len(after)) < 5:
        return True, '中', '前后分句长度接近，可能并列'

    non_parallel_starters = r'^(但|而|然而|可是|于是|所以|因此|因为|然后|接着|随后|却|可|便|就)'
    if re.match(non_parallel_starters, after):
        return False, '高', '后句为转折/因果/顺序，非并列关系'

    return None, '低', '需人工判断分句关系'


# ─── 冒号合法性判断 ───

def check_colon_usage(text_before, text_after, full_context):
    """
    判断 ：是否属于三种合法用法之一（枚举/解释/引述）。
    返回 (是否合法, 匹配模式, 理由)
    """
    before = text_before.strip()
    after = text_after.strip()

    # 模式 1：引述 — 言语动词 + ："
    if after.startswith('"'):
        # 取 ： 前 1-6 字检查是否为言语动词
        speech_verbs = {
            '说', '道', '问', '喊', '叫', '答', '骂', '曰',
            '讲', '谈', '聊', '补', '接', '应', '叹', '念',
            '问道', '说道', '喊道', '叫道', '答道', '骂道', '笑道', '吼道',
            '回道', '嚷道', '讲道', '叹道', '念道', '应道',
            '嘀咕', '嘟囔', '吩咐', '命令', '解释', '质问', '反驳', '补充',
            '追问', '反问', '宣布', '插嘴', '插话', '开口', '接话', '抢白',
        }
        m = re.search(r'([一-鿿]{1,6})$', before)
        if m:
            word = m.group(1)
            # 剥离体标记
            for p in ['了', '着', '过']:
                if word.endswith(p) and len(word) > 1:
                    word = word[:-1]
                    break
            for i in range(len(word)):
                if word[i:] in speech_verbs:
                    return True, '引述', f'言语动词「{m.group(1)}」+：'
        return None, '未知', '非言语动词后 ："，非合法引述'

    # 模式 2：枚举 — ： 后出现 、分隔的列举项
    if '、' in after[:30]:
        return True, '枚举', '：后含顿号列举'

    # 模式 3：解释 — ： 后是一句说明文字
    # 宽松判断：前后均为中文内容且 ： 前为名词/名词短语
    if re.search(r'[一-鿿]', before) and re.search(r'[一-鿿]', after):
        if len(after) > 2 and not after.startswith('"'):
            return True, '解释', '：前后均为中文，可能为解释说明'

    return None, '未知', '无法机械判定，待人工判断'


# ─── 感叹号/问号叙述违禁检测 ───

def check_exclam_question(text, ranges, is_response_field=False):
    """
    角色卡叙述中！？仅限对话内（引号内）。
    is_response_field: 是否为 dialogue_examples[*].response（对话文本）
    返回 [(位置, 字符, 是否违规, 理由), ...]
    """
    results = []
    for m in EXCLAM_RE.finditer(text):
        pos = m.start()
        ch = m.group()
        in_quote = is_in_quote_range(pos, ranges)

        if in_quote:
            if is_response_field:
                # 对话文本中引号内 ！？ → 低优先级待审（角色卡规则仅解锁 ——……）
                results.append((pos, ch, None, '低', '引号内！？，角色卡对话仅解锁 ——……'))
            else:
                # 非对话字段引号内出现 ！？ → 中优先级
                results.append((pos, ch, None, '中', '引号内！？，角色卡叙述中引号内不应使用'))
        else:
            # 引号外 ！？ → 违规
            results.append((pos, ch, False, '高', '引号外！？，角色卡叙述禁止'))
    return results


# ─── 主处理流程 ───

def process_md_file(filepath, relpath):
    """处理 MD 文件"""
    results = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            text = f.read()
    except Exception as e:
        return [{'file': relpath, 'type': 'ERROR', 'msg': str(e)}]

    ranges = find_quote_ranges(text)
    sentences = extract_sentences_with_context(text)

    # ── 逗号 ──
    for m in COMMA_RE.finditer(text):
        pos = m.start()
        if is_in_quote_range(pos, ranges):
            continue  # 引号内逗号不扫
        sent, s_start, s_end = find_sentence_for_pos(sentences, pos)
        if sent is None:
            continue
        before = text[s_start:pos]
        after = text[pos+1:s_end]
        deletable, confidence, reason = comma_delete_test(before, after, sent)

        if deletable is True:
            results.append({
                'file': relpath, 'field': '正文', 'symbol': '，',
                'original': sent.strip(),
                'test': f'删去逗号："{before.rstrip()}{after.lstrip()}"',
                'suggestion': '可删', 'confidence': confidence,
                'reason': reason, 'note': ''
            })
        elif deletable is None and confidence == '低':
            results.append({
                'file': relpath, 'field': '正文', 'symbol': '，',
                'original': sent.strip(),
                'test': f'删去后："{before.rstrip()}{after.lstrip()}"',
                'suggestion': '待人工判断', 'confidence': confidence,
                'reason': reason, 'note': ''
            })

    # ── 句号 ──
    for m in PERIOD_RE.finditer(text):
        pos = m.start()
        if is_in_quote_range(pos, ranges):
            continue
        sent, s_start, s_end = find_sentence_for_pos(sentences, pos)
        if sent is None:
            continue

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

        should_change, confidence, reason = period_replace_test(
            text_before, text_after, text[s_start:ns_end], is_para_end
        )

        if should_change is True:
            results.append({
                'file': relpath, 'field': '正文', 'symbol': '。',
                'original': f'{sent.strip()} {next_sent.strip()}',
                'test': f'替换为逗号："{text_before.rstrip()}，{text_after.lstrip()}"',
                'suggestion': '改逗号', 'confidence': confidence,
                'reason': reason, 'note': ''
            })
        elif should_change is None:
            results.append({
                'file': relpath, 'field': '正文', 'symbol': '。',
                'original': f'{sent.strip()} {next_sent.strip()}',
                'test': f'替换为逗号后："{text_before.rstrip()}，{text_after.lstrip()}"',
                'suggestion': '待人工判断', 'confidence': confidence,
                'reason': reason, 'note': ''
            })

    # ── 分号 ──
    for m in SEMICOLON_RE.finditer(text):
        pos = m.start()
        if is_in_quote_range(pos, ranges):
            continue
        sent, s_start, s_end = find_sentence_for_pos(sentences, pos)
        if sent is None:
            continue

        left = text[s_start:pos]
        right = text[pos+1:s_end]
        is_correct, confidence, reason = semicolon_swap_test(left, right)

        if is_correct is False:
            results.append({
                'file': relpath, 'field': '正文', 'symbol': '；',
                'original': sent.strip(),
                'test': f'互换后："{right.strip()}；{left.strip()}"（语义改变）',
                'suggestion': '改为逗号或句号', 'confidence': confidence,
                'reason': reason, 'note': ''
            })
        elif is_correct is None:
            results.append({
                'file': relpath, 'field': '正文', 'symbol': '；',
                'original': sent.strip(),
                'test': f'互换测试："{right.strip()}；{left.strip()}"',
                'suggestion': '待人工判断', 'confidence': confidence,
                'reason': reason, 'note': ''
            })

    # ── 冒号（新增）──
    for m in COLON_RE.finditer(text):
        pos = m.start()
        if is_in_quote_range(pos, ranges):
            continue
        sent, s_start, s_end = find_sentence_for_pos(sentences, pos)
        if sent is None:
            continue
        before = text[s_start:pos]
        after = text[pos+1:s_end]

        # 跳过 MD 简介模板标签行的冒号（姓名：、评级：等）
        line_start = text.rfind('\n', 0, pos) + 1
        line = text[line_start:text.find('\n', pos) if text.find('\n', pos) != -1 else len(text)]
        if is_md_template_colon(line, pos - line_start):
            continue

        is_legal, pattern, reason = check_colon_usage(before, after, sent)

        if is_legal is False or is_legal is None:
            results.append({
                'file': relpath, 'field': '正文', 'symbol': '：',
                'original': sent.strip(),
                'test': f'：前「{before.rstrip()[-10:]}」后「{after.lstrip()[:20]}」',
                'suggestion': f'合法-{pattern}' if is_legal else '待人工判断',
                'confidence': '高' if is_legal else '低',
                'reason': reason, 'note': ''
            })

    # ── ！？（新增）──
    for pos, ch, is_bad, confidence, reason in check_exclam_question(text, ranges):
        sent, s_start, s_end = find_sentence_for_pos(sentences, pos)
        ctx = text[max(0, pos-8):pos+9].replace('\n', ' ')
        results.append({
            'file': relpath, 'field': '正文', 'symbol': ch,
            'original': sent.strip() if sent else f'…{ctx}…',
            'test': f'出现 {ch}',
            'suggestion': '违规' if is_bad is False else '待人工判断',
            'confidence': confidence, 'reason': reason, 'note': ''
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
        if not re.search(r'[一-鿿]', text):
            continue

        ranges = find_quote_ranges(text)
        sentences = extract_sentences_with_context(text)

        # 判断是否为对话 response 字段
        is_response = bool(re.search(r'char_dialogue_examples\[\d+\]\.response', field_path))

        # ── 逗号 ──
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
                    'file': relpath, 'field': field_path, 'symbol': '，',
                    'original': text[s_start:s_end].strip(),
                    'test': f'删去逗号："{before.rstrip()}{after.lstrip()}"',
                    'suggestion': '可删', 'confidence': confidence,
                    'reason': reason, 'note': ''
                })

        # ── 句号 ──
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
                    'file': relpath, 'field': field_path, 'symbol': '。',
                    'original': f'{text[s_start:s_end].strip()} {next_sent}',
                    'test': f'替换为逗号："{text_before.rstrip()}，{next_sent}"',
                    'suggestion': '改逗号', 'confidence': confidence,
                    'reason': reason, 'note': ''
                })
            elif should_change is None:
                results.append({
                    'file': relpath, 'field': field_path, 'symbol': '。',
                    'original': f'{text[s_start:s_end].strip()} {next_sent}',
                    'test': f'替换为逗号后："{text_before.rstrip()}，{next_sent}"',
                    'suggestion': '待人工判断', 'confidence': confidence,
                    'reason': reason, 'note': ''
                })

        # ── 分号 ──
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
                    'file': relpath, 'field': field_path, 'symbol': '；',
                    'original': text[s_start:s_end].strip(),
                    'test': f'互换后："{right.strip()}；{left.strip()}"',
                    'suggestion': '改为逗号或句号' if is_correct is False else '待人工判断',
                    'confidence': confidence, 'reason': reason, 'note': ''
                })

        # ── 冒号（新增）──
        for m in COLON_RE.finditer(text):
            pos = m.start()
            sent, s_start, s_end = find_sentence_for_pos(sentences, pos)
            if sent is None:
                continue
            before = text[s_start:pos]
            after = text[pos+1:s_end]

            is_legal, pattern, reason = check_colon_usage(before, after, text[s_start:s_end])

            if is_legal is False or is_legal is None:
                results.append({
                    'file': relpath, 'field': field_path, 'symbol': '：',
                    'original': text[s_start:s_end].strip(),
                    'test': f'：前「{before.rstrip()[-10:]}」后「{after.lstrip()[:20]}」',
                    'suggestion': f'合法-{pattern}' if is_legal else '待人工判断',
                    'confidence': '高' if is_legal else '低',
                    'reason': reason, 'note': ''
                })

        # ── ！？（新增）──
        for pos, ch, is_bad, confidence, reason in check_exclam_question(text, ranges, is_response):
            sent, s_start, s_end = find_sentence_for_pos(sentences, pos)
            ctx = text[max(0, pos-8):pos+9].replace('\n', ' ')
            results.append({
                'file': relpath, 'field': field_path, 'symbol': ch,
                'original': sent.strip() if sent else f'…{ctx}…',
                'test': f'出现 {ch}',
                'suggestion': '违规' if is_bad is False else '待人工判断',
                'confidence': confidence, 'reason': reason, 'note': ''
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

        # 排除审查文件自身和创作模板（非角色内容）
        rel = relpath.replace('\\', '/')
        if rel.startswith('创作者文件/审查文件') or rel.startswith('创作者文件/创作文件'):
            continue

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
    colon_issues = [r for r in all_results if r.get('symbol') == '：']
    exclam_issues = [r for r in all_results if r.get('symbol') in ('！', '？')]

    print(f"\n─── 汇总 ───")
    print(f"逗号可删 (高/中置信度): {len(comma_deletable)}")
    print(f"逗号待人工判断: {len(comma_ambiguous)}")
    print(f"句号应改逗号 (高/中置信度): {len(period_changeable)}")
    print(f"句号待人工判断: {len(period_ambiguous)}")
    print(f"分号问题项: {len(semicolon_issues)}")
    print(f"冒号问题项 (新增): {len(colon_issues)}")
    print(f"！？问题项 (新增): {len(exclam_issues)}")
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
            ("─── 四、冒号审查（新增）───", colon_issues),
            ("─── 五、！？叙述违禁检测（新增）───", exclam_issues),
            ("─── 六、逗号待人工判断（模糊项）───", comma_ambiguous),
            ("─── 七、句号待人工判断（模糊项）───", period_ambiguous),
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

        # 按文件分组统计
        f.write(f"\n\n─── 按文件分组统计 ───\n\n")
        file_groups = {}
        for r in all_results:
            fname = r['file']
            if fname not in file_groups:
                file_groups[fname] = {
                    'comma_del': 0, 'comma_amb': 0,
                    'period_chg': 0, 'period_amb': 0,
                    'semi': 0, 'colon': 0, 'exclam': 0,
                }
            sym = r.get('symbol', '')
            sug = r.get('suggestion', '')
            if sym == '，' and sug == '可删':
                file_groups[fname]['comma_del'] += 1
            elif sym == '，' and sug == '待人工判断':
                file_groups[fname]['comma_amb'] += 1
            elif sym == '。' and sug == '改逗号':
                file_groups[fname]['period_chg'] += 1
            elif sym == '。' and sug == '待人工判断':
                file_groups[fname]['period_amb'] += 1
            elif sym == '；':
                file_groups[fname]['semi'] += 1
            elif sym == '：':
                file_groups[fname]['colon'] += 1
            elif sym in ('！', '？'):
                file_groups[fname]['exclam'] += 1

        for fname in sorted(file_groups.keys()):
            g = file_groups[fname]
            total = sum(g.values())
            if total > 0:
                f.write(f"{fname}: 逗可删{g['comma_del']} 逗模糊{g['comma_amb']} "
                        f"句改逗{g['period_chg']} 句模糊{g['period_amb']} "
                        f"分号{g['semi']} 冒号{g['colon']} 叹问{g['exclam']} (共{total})\n")

    print(f"\n详细结果已输出到: {output_path}")
    return all_results


if __name__ == '__main__':
    results = main()
