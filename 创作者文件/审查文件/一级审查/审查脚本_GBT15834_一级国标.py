#!/usr/bin/env python3
"""
GB/T 15834—2011 一级国标标点审查脚本
仅检查国标原文规则，不涉及项目追加约束（""引号、——……仅限对话等）。

检查项目：
1. 句末点号（。？！）使用是否合规
2. 句内点号（，、；：）使用是否合规
3. 引号、括号、书名号配对是否完整
4. 标点符号位置和书写形式是否规范
"""

import os
import re
import json
import sys
from pathlib import Path
from collections import defaultdict

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent

# 文件/目录排除列表
EXCLUDE_DIRS = {
    ".git", ".claude", "__pycache__", "node_modules", ".obsidian",
}
EXCLUDE_FILES = {
    # 排除本脚本自身
    "审查脚本_GBT15834_一级国标.py",
}

# 违反条目的严重等级
SEVERITY = {
    "T0": "阻断级 — 明确违反 GB/T 15834 强制性条款，必须修复",
    "T1": "高 — 大概率违反国标，需人工确认后修复",
    "T2": "中 — 疑似违规或格式不规范，建议修正",
    "T3": "低 — 最佳实践建议，非强制性",
}


class GBT15834Checker:
    """GB/T 15834—2011 标点符号用法合规检查器"""

    def __init__(self):
        self.violations = defaultdict(list)
        self.file_count = 0
        self.violation_count = 0

    # ─── 工具函数 ───────────────────────────────────────

    def _add(self, filepath, line_no, original, clause, suggestion, severity):
        """记录一条违规"""
        self.violations[filepath].append({
            "line": line_no,
            "original": original.strip(),
            "clause": clause,
            "suggestion": suggestion,
            "severity": severity,
        })
        self.violation_count += 1

    def _is_chinese_line(self, text):
        """判断一行是否主要为中文内容（非代码块、非纯标点、非纯英文）"""
        stripped = text.strip()
        if not stripped:
            return False
        # 跳过 Markdown 代码块
        if stripped.startswith("```"):
            return False
        # 跳过纯 URL
        if re.match(r'^https?://', stripped):
            return False
        # 跳过纯 ASCII 行（如表格分隔线、纯英文注释）
        chinese_chars = len(re.findall(r'[一-鿿㐀-䶿]', stripped))
        if chinese_chars == 0:
            return False
        return True

    def _is_code_or_table_line(self, text):
        """判断是否为代码块、表格行、或纯结构标记"""
        stripped = text.strip()
        if not stripped:
            return True
        if stripped.startswith("```"):
            return True
        if stripped.startswith("|") and stripped.endswith("|"):
            return True  # Markdown 表格行
        if re.match(r'^[\-\*]\s', stripped):
            return True  # 列表项标记行（结构标记，非正文）
        if re.match(r'^#{1,6}\s', stripped):
            return True  # 标题行
        if stripped.startswith("---"):
            return True  # 水平线
        if stripped.startswith("> "):
            return True  # 引用块
        return False

    def _extract_chinese_sentences(self, text):
        """从文本中提取中文句子（去除英文部分）"""
        # 按中文标点分句
        sentences = re.split(r'([。！？；：，])', text)
        return sentences

    # ─── 检查 1：句末点号 ────────────────────────────────
    # GB/T 4.1 句号：用于句子末尾，表示陈述语气
    # GB/T 4.2 问号：用于句子末尾，表示疑问语气
    # GB/T 4.3 叹号：用于句子末尾，表示感叹语气

    def check_sentence_end(self, filepath, lines):
        """检查句末点号使用"""
        for i, line in enumerate(lines, 1):
            if self._is_code_or_table_line(line):
                continue
            if not self._is_chinese_line(line):
                continue

            stripped = line.strip()

            # 检查：英文句号 . 用于中文句子末尾
            # 模式：中文字符后直接跟英文句号然后空格或行尾
            if re.search(r'[一-鿿㐀-䶿]\.[\s]*$', stripped):
                self._add(filepath, i, stripped,
                          "4.1 句号 — 中文陈述句末尾应使用 。，不得使用英文句号 .",
                          "将句末英文句号 . 改为中文句号 。", "T0")

            # 检查：中文句号后无空格直接跟中文（可能漏了句号或句子粘连）
            # 这个检测较难自动化，跳过

            # 检查：感叹号叠用超过三个（GB/T 4.3 允许最多三个）
            if re.search(r'！{4,}', stripped):
                self._add(filepath, i, stripped,
                          "4.3 叹号 — 叹号叠用最多三个，此处超过三个",
                          "减少叹号数量至三个以内", "T2")

            # 检查：问号叠用超过三个（GB/T 4.2 允许最多三个）
            if re.search(r'？{4,}', stripped):
                self._add(filepath, i, stripped,
                          "4.2 问号 — 问号叠用最多三个，此处超过三个",
                          "减少问号数量至三个以内", "T2")

    # ─── 检查 2：句内点号 ────────────────────────────────
    # GB/T 4.4 逗号、4.5 顿号、4.6 分号、4.7 冒号

    def check_sentence_internal(self, filepath, lines):
        """检查句内点号使用"""
        for i, line in enumerate(lines, 1):
            if self._is_code_or_table_line(line):
                continue
            if not self._is_chinese_line(line):
                continue

            stripped = line.strip()

            # 检查：英文逗号 , 用于中文文本中
            # 中文文本中不应使用英文逗号替代中文逗号
            if re.search(r'[一-鿿],[一-鿿]', stripped):
                self._add(filepath, i, stripped,
                          "4.4 逗号 — 中文文本中不应使用英文逗号 , 替代中文逗号 ，",
                          "将英文逗号 , 改为中文逗号 ，", "T0")

            # 检查：英文分号 ; 用于中文文本中
            if re.search(r'[一-鿿];[一-鿿]', stripped):
                self._add(filepath, i, stripped,
                          "4.6 分号 — 中文文本中不应使用英文分号 ; 替代中文分号 ；",
                          "将英文分号 ; 改为中文分号 ；", "T0")

            # 检查：英文冒号 : 用于中文文本中（非 JSON 键值场景）
            if re.search(r'[一-鿿]:[一-鿿]', stripped):
                self._add(filepath, i, stripped,
                          "4.7 冒号 — 中文文本中不应使用英文冒号 : 替代中文冒号 ：",
                          "将英文冒号 : 改为中文冒号 ：", "T0")

            # 检查：非言语动词后冒号接引号（GB/T 4.7 冒号 + 4.8 引号）
            # 模式：非"说/问/道/喊/叫"等言语动词后使用 ："
            non_speech_patterns = [
                (r'(抬头|低头|转身|回头|站起|坐下|走来|走去|微笑|笑|点头|摇头|叹气|叹息|咳嗽|挥手|指着|看向|望着|盯着|瞥|扫视|环顾|翻开|打开|关上|敲|拍|推|拉|扔|放|拿起|掏出|抽出|举起|放下|转身|回头|站起来|坐下去|走过来|走过去|跑过来|跑过去|指了指|看了看|望了望|叹了|笑道|冷笑|苦笑|轻笑|淡笑|浅笑|莞尔|嗤笑)："',
                 "4.7 冒号 + 4.8 引号 — 非言语提示动词后不应使用冒号引出对话，应使用逗号"
                ),
            ]
            for pattern, clause in non_speech_patterns:
                if re.search(pattern, stripped):
                    self._add(filepath, i, stripped, clause,
                              "将冒号改为逗号，如「抬头，\"...」", "T0")

            # 检查：顿号用于非并列关系（较难自动化，标记疑似）
            # 跳过

            # 检查：中文顿号 、被英文逗号 , 替代
            # 已在英文逗号检查中覆盖

    # ─── 检查 3：引号配对 ───────────────────────────────
    # GB/T 4.8 引号：双引号在外，单引号在内

    def check_quote_pairing(self, filepath, lines):
        """检查引号、括号、书名号配对"""
        full_text = "\n".join(lines)

        # 中文双引号 ""（U+201C, U+201D）
        left_quotes_cn = full_text.count("“")  # "
        right_quotes_cn = full_text.count("”")  # "
        if left_quotes_cn != right_quotes_cn:
            self._add(filepath, 0, f"全文左引号\" {left_quotes_cn} 个，右引号\" {right_quotes_cn} 个",
                      "4.8 引号 — 中文双引号左右数量不匹配，存在未闭合引号",
                      f"检查全文，补齐缺失的 {'左' if left_quotes_cn < right_quotes_cn else '右'}引号", "T0")

        # 英文直双引号 ""
        ascii_double_quotes = full_text.count('"')
        if ascii_double_quotes % 2 != 0:
            self._add(filepath, 0, f"全文英文直双引号 \" 共 {ascii_double_quotes} 个（奇数），存在未闭合",
                      "4.8 引号 — 引号数量为奇数，存在未闭合引号",
                      "检查全文，补齐缺失的引号", "T0")

        # 书名号 《》
        left_book = full_text.count("《")  # 《
        right_book = full_text.count("》")  # 》
        if left_book != right_book:
            self._add(filepath, 0, f"全文左书名号《 {left_book} 个，右书名号》 {right_book} 个",
                      "4.15 书名号 — 书名号左右数量不匹配",
                      "检查全文，补齐缺失的书名号", "T0")

        # 中文括号 （）
        left_paren_cn = full_text.count("（")  # （
        right_paren_cn = full_text.count("）")  # ）
        if left_paren_cn != right_paren_cn:
            self._add(filepath, 0, f"全文中左括号（ {left_paren_cn} 个，右括号） {right_paren_cn} 个",
                      "4.9 括号 — 中文括号左右数量不匹配",
                      "检查全文，补齐缺失的括号", "T0")

        # 方头括号 【】
        left_sq = full_text.count("【")  # 【
        right_sq = full_text.count("】")  # 】
        if left_sq != right_sq:
            self._add(filepath, 0, f"全文左方头括号【 {left_sq} 个，右方头括号】 {right_sq} 个",
                      "4.9 括号 — 方头括号左右数量不匹配",
                      "检查全文，补齐缺失的括号", "T1")

        # 逐行检查引号内的引号嵌套
        for i, line in enumerate(lines, 1):
            if not self._is_chinese_line(line):
                continue
            stripped = line.strip()

            # 检查：中文卷曲单引号 ''
            if '‘' in stripped or '’' in stripped:
                self._add(filepath, i, stripped,
                          "4.8 引号 — 出现中文卷曲单引号 ''（U+2018/U+2019），中文文本中单引号应使用 ''（U+2018/U+2019）内嵌于双引号中",
                          "确认引号嵌套层级无误", "T2")

    # ─── 检查 4：标点书写形式 ────────────────────────────
    # GB/T 5.1 横行文稿标点符号的位置

    def check_punctuation_form(self, filepath, lines):
        """检查标点符号的书写形式和位置"""
        for i, line in enumerate(lines, 1):
            if self._is_code_or_table_line(line):
                continue
            if not self._is_chinese_line(line):
                continue

            stripped = line.strip()

            # 检查：英文省略号 ... 用于中文文本
            if re.search(r'[一-鿿]\.\.\.[一-鿿]', stripped):
                self._add(filepath, i, stripped,
                          "4.11 省略号 — 中文文本应使用 ……（两个字符位，六个点），不得使用 ...",
                          "将 ... 替换为 ……", "T0")

            if re.search(r'[一-鿿]\.\.\.[\s]*$', stripped):
                self._add(filepath, i, stripped,
                          "4.11 省略号 — 中文文本应使用 ……，不得使用 ...",
                          "将 ... 替换为 ……", "T0")

            # 检查：中文文本中使用三个点 ...（非标准省略号）
            if re.search(r'[一-鿿]\s*\.\.\.\s*[一-鿿]', stripped):
                self._add(filepath, i, stripped,
                          "4.11 省略号 — 中文文本中省略号应为 ……，不得使用三个英文句点 ...",
                          "将 ... 替换为 ……", "T0")

            # 检查：中文文本中使用两个点 .. 或四个点 ....
            if re.search(r'(?<!\.)\.\.(?!\.)', stripped) and not re.search(r'\.\.\.', stripped):
                if re.search(r'[一-鿿]', stripped):
                    self._add(filepath, i, stripped,
                              "4.11 省略号 — 中文文本中出现两个句点 ..，可能为省略号残缺",
                              "若为省略号，应使用 ……；若为其他用途，请确认", "T2")

            # 检查：一个 em dash —（U+2014）用于中文文本（应为两个 —— 占两字位）
            # 但表格和列表中可能正常使用
            single_em_dashes = re.findall(r'(?<!—)—(?!—)', stripped)
            if single_em_dashes and re.search(r'[一-鿿]', stripped):
                # 排除：数字范围（如 2011—2012）、英文名等
                # 只标记中文字符前后的单个 em dash
                for match in re.finditer(r'[一-鿿（）《》]—[一-鿿（）《》]', stripped):
                    self._add(filepath, i, stripped,
                              "4.10 破折号 — 中文文本中破折号应占两个字位置（——），单个 — 不符合国标",
                              "将单个 — 替换为 ——（两个 em dash 连续），或确认此处是否应为连接号", "T1")

            # 检查：破折号中间断开（GB/T 5.1：破折号占两个字位置，中间不断开）
            if re.search(r'—\s+—', stripped):
                self._add(filepath, i, stripped,
                          "5.1 标点位置 — 破折号占两个字位置，中间不得断开加空格",
                          "删除破折号中间的空格", "T0")

            # 检查：省略号中间断开
            if re.search(r'…\s+…', stripped):
                self._add(filepath, i, stripped,
                          "5.1 标点位置 — 省略号占两个字位置，中间不得断开加空格",
                          "删除省略号中间的空格", "T0")

            # 检查：行首出现句内点号（，、；：。？！）
            # GB/T 5.1：句号、逗号、顿号、分号、冒号不出现在一行之首
            if re.match(r'^\s*[，、；：。？！]', stripped):
                self._add(filepath, i, stripped,
                          "5.1 标点位置 — 句内点号和句末点号不得出现在一行之首",
                          "将行首标点移至上一行末尾", "T0")

            # 检查：行末出现前引号/前括号/前书名号
            # GB/T 5.1：前一半不出现在一行之末
            if re.search(r'[“（《【]\s*$', stripped):
                self._add(filepath, i, stripped,
                          "5.1 标点位置 — 前引号/前括号/前书名号不得出现在一行之末",
                          "将行末前引号/前括号移至下一行开头", "T2")

            # 检查：中文文本中感叹号后应有空格或换段（非强制性，仅建议）
            # 不检查

            # 检查：间隔号应为 ·（U+00B7），不应使用 •（U+2022）
            if '•' in stripped and re.search(r'[一-鿿]', stripped):
                # 如果在中文名中（如 菲利普 · 钢翼），应检查间隔号
                if re.search(r'[一-鿿]•[一-鿿]', stripped):
                    self._add(filepath, i, stripped,
                              "4.14 间隔号 — 中文人名中的间隔号应为 ·（U+00B7），而非项目符号 •（U+2022）",
                              "将 • 改为 ·", "T1")

    # ─── 检查 5：JSON 文件特殊处理 ──────────────────────

    def check_json_file(self, filepath):
        """对 JSON 文件提取中文字符串值进行检查"""
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            data = json.loads(content)
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            self._add(filepath, 0, f"JSON 解析失败: {e}",
                      "—", "修复 JSON 语法错误", "T0")
            return

        # 递归提取所有中文字符串值
        chinese_strings = []

        def extract_strings(obj, path=""):
            if isinstance(obj, str):
                if re.search(r'[一-鿿]', obj):
                    chinese_strings.append((path, obj))
            elif isinstance(obj, dict):
                for k, v in obj.items():
                    extract_strings(v, f"{path}.{k}" if path else k)
            elif isinstance(obj, list):
                for idx, item in enumerate(obj):
                    extract_strings(item, f"{path}[{idx}]")

        extract_strings(data)

        # 对每个中文字符串执行检查
        for str_path, text in chinese_strings:
            lines = text.split("\n")
            # 只对多行字符串模拟行号，单行字符串直接检查
            virtual_file = f"{filepath}::{str_path}"

            # 检查英文省略号
            if '...' in text and re.search(r'[一-鿿]', text):
                self._add(virtual_file, 0, f"字段值出现 ...",
                          "4.11 省略号 — 中文文本应使用 ……，不得使用 ...",
                          "将 ... 替换为 ……", "T0")

            # 检查英文逗号分隔中文
            if re.search(r'[一-鿿],[一-鿿]', text):
                self._add(virtual_file, 0, f"字段值出现英文逗号 , 分隔中文",
                          "4.4 逗号 — 中文文本中不应使用英文逗号 , 替代中文逗号 ，",
                          "将英文逗号 , 改为中文逗号 ，", "T0")

            # 检查英文分号
            if re.search(r'[一-鿿];[一-鿿]', text):
                self._add(virtual_file, 0, f"字段值出现英文分号 ; 分隔中文",
                          "4.6 分号 — 中文文本中不应使用英文分号 ; 替代中文分号 ；",
                          "将英文分号 ; 改为中文分号 ；", "T0")

            # 检查英文冒号
            if re.search(r'[一-鿿]:[一-鿿]', text):
                self._add(virtual_file, 0, f"字段值出现英文冒号 : 分隔中文",
                          "4.7 冒号 — 中文文本中不应使用英文冒号 : 替代中文冒号 ：",
                          "将英文冒号 : 改为中文冒号 ：", "T0")

            # 检查非言语动词后冒号接引号
            non_speech_patterns = [
                r'(抬头|低头|转身|回头|站起|坐下|走来|走去|微笑|笑|点头|摇头|叹气|叹息|咳嗽|挥手|指着|看向|望着|盯着|瞥|扫视|环顾|翻开|打开|关上|敲|拍|推|拉|扔|放|拿起|掏出|抽出|举起|放下|指了指|看了看|望了望|叹了|笑道|冷笑|苦笑|轻笑|淡笑|浅笑|莞尔|嗤笑)："',
            ]
            for pattern in non_speech_patterns:
                if re.search(pattern, text):
                    self._add(virtual_file, 0, f"字段值出现非言语动词后冒号接引号",
                              "4.7 冒号 + 4.8 引号 — 非言语提示动词后不应使用冒号引出对话，应使用逗号",
                              "将冒号改为逗号", "T0")
                    break

            # 检查中文括号配对
            left_p = text.count("（")
            right_p = text.count("）")
            if left_p != right_p:
                self._add(virtual_file, 0, f"字段值中左括号（ {left_p} 个，右括号） {right_p} 个",
                          "4.9 括号 — 中文括号左右数量不匹配",
                          "补齐缺失的括号", "T0")

            # 检查书名号配对
            left_b = text.count("《")
            right_b = text.count("》")
            if left_b != right_b:
                self._add(virtual_file, 0, f"字段值中左书名号《 {left_b} 个，右书名号》 {right_b} 个",
                          "4.15 书名号 — 书名号左右数量不匹配",
                          "补齐缺失的书名号", "T0")

            # 检查中文引号配对
            left_q = text.count("“")
            right_q = text.count("”")
            if left_q != right_q:
                self._add(virtual_file, 0, f"字段值中左引号\" {left_q} 个，右引号\" {right_q} 个",
                          "4.8 引号 — 中文双引号左右数量不匹配",
                          "补齐缺失的引号", "T0")

    # ─── 主入口 ──────────────────────────────────────────

    def check_file(self, filepath):
        """对单个文件执行所有检查"""
        ext = filepath.suffix.lower()
        rel_path = filepath.relative_to(PROJECT_ROOT)

        if ext == ".json":
            self.check_json_file(str(filepath))
            return

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                lines = f.readlines()
        except UnicodeDecodeError:
            # 尝试其他编码
            try:
                with open(filepath, "r", encoding="gbk") as f:
                    lines = f.readlines()
            except Exception:
                return

        self.check_sentence_end(str(filepath), lines)
        self.check_sentence_internal(str(filepath), lines)
        self.check_quote_pairing(str(filepath), lines)
        self.check_punctuation_form(str(filepath), lines)

    def scan_all(self):
        """扫描全项目"""
        for root, dirs, files in os.walk(PROJECT_ROOT):
            # 排除目录
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

            for fname in files:
                if fname in EXCLUDE_FILES:
                    continue
                if not (fname.endswith(".md") or fname.endswith(".json")):
                    continue

                filepath = Path(root) / fname
                self.check_file(filepath)
                self.file_count += 1

    def report(self):
        """生成审查报告"""
        print("=" * 80)
        print("  GB/T 15834—2011 一级国标标点审查报告")
        print("=" * 80)
        print(f"\n审查文件数：{self.file_count}")
        print(f"违规条目数：{self.violation_count}")
        if self.file_count > 0:
            print(f"违规文件数：{len(self.violations)}")

        if self.violation_count == 0:
            print("\n未发现国标违规项。")
            return

        print("\n" + "=" * 80)
        print("  详细违规列表")
        print("=" * 80)

        # 按文件路径排序
        for filepath in sorted(self.violations.keys()):
            items = self.violations[filepath]
            print(f"\n{'─' * 80}")
            print(f"文件：{filepath}")
            print(f"违规数：{len(items)}")
            print(f"{'─' * 80}")

            for idx, item in enumerate(items, 1):
                severity_label = item["severity"]
                print(f"\n  [{severity_label}] #{idx}")
                print(f"  行号：{item['line']}" if item['line'] > 0 else "  位置：全文")
                print(f"  原文：{item['original'][:120]}")
                print(f"  违反：{item['clause']}")
                print(f"  建议：{item['suggestion']}")

        # 统计
        print(f"\n{'=' * 80}")
        print("  违规统计")
        print(f"{'=' * 80}")

        severity_counts = defaultdict(int)
        clause_counts = defaultdict(int)
        for items in self.violations.values():
            for item in items:
                severity_counts[item["severity"]] += 1
                clause_counts[item["clause"]] += 1

        print("\n按严重等级：")
        for sev in ["T0", "T1", "T2", "T3"]:
            if severity_counts[sev]:
                print(f"  {sev}（{SEVERITY[sev][:20]}...）：{severity_counts[sev]} 条")

        print("\n按违反条款：")
        for clause, count in sorted(clause_counts.items(), key=lambda x: -x[1]):
            print(f"  {clause}：{count} 条")

        return self.violations


def main():
    checker = GBT15834Checker()
    print("正在扫描全项目 MD+JSON 文件...")
    checker.scan_all()
    checker.report()

    # 返回退出码：有 T0 违规时返回 1
    has_t0 = any(
        item["severity"] == "T0"
        for items in checker.violations.values()
        for item in items
    )
    sys.exit(1 if has_t0 else 0)


if __name__ == "__main__":
    main()
