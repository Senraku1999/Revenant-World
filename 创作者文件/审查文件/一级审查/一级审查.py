#!/usr/bin/env python3
"""
GB/T 15834—2011 一级国标标点审查脚本
仅检查国标原文规则，不涉及项目追加约束（""引号、——……仅限对话等）。

检查项目：
1. 句末点号（。？！）使用是否合规
2. 句内点号（，、；：）使用是否合规
3. 引号、括号、书名号配对是否完整
4. 标点符号位置和书写形式是否规范
5. 异形词扫描（GF 1001—2001）
6. 数字用法扫描（GB/T 15835，appearance + 基础信息区）
7. 非言语动词后冒号接引号检测
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
    "一级审查.py",
}

# 违反条目的严重等级
SEVERITY = {
    "T0": "阻断级 — 明确违反 GB/T 15834 强制性条款，必须修复",
    "T1": "高 — 大概率违反国标，需人工确认后修复",
    "T2": "中 — 疑似违规或格式不规范，建议修正",
    "T3": "低 — 最佳实践建议，非强制性",
}

# ─── 言语动词白名单 ─────────────────────────────────
# 发现 ：" 时，取 ： 前 1-6 字，检查是否以此表中词结尾。
# 白名单中的词可合法使用 ：" 引出对话。
SPEECH_VERBS = {
    # 单字
    '说', '道', '问', '喊', '叫', '答', '骂', '曰',
    '讲', '谈', '聊', '补', '接', '应', '叹', '念',
    # 双字组合
    '问道', '说道', '喊道', '叫道', '答道', '骂道', '笑道', '吼道',
    '回道', '嚷道', '答曰', '讲道', '叹道', '念道', '应道',
    # 多字言语动词
    '嘀咕', '嘟囔', '吩咐', '命令', '解释', '质问', '反驳', '补充',
    '追问', '反问', '宣布', '插嘴', '插话', '开口', '接话', '抢白',
}


def _is_speech_verb(word):
    """检查 word 或其任意后缀是否在言语动词白名单中。
    先剥离体标记（了/着/过），再匹配后缀。"""
    # 剥离体标记
    for particle in ['了', '着', '过']:
        if word.endswith(particle) and len(word) > 1:
            word = word[:-1]
            break
    for i in range(len(word)):
        if word[i:] in SPEECH_VERBS:
            return True
    return False


class GBT15834Checker:
    """GB/T 15834—2011 标点符号用法合规检查器"""

    def __init__(self):
        self.violations = defaultdict(list)
        self.file_count = 0
        self.violation_count = 0
        self.variant_dict = self._load_variant_forms()

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
        if stripped.startswith("```"):
            return False
        if re.match(r'^https?://', stripped):
            return False
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
        if stripped.startswith("|") and stripped.endswith("|") and stripped.count("|") >= 2 and "---" not in stripped:
            return True
        if re.match(r'^[\-\*]\s', stripped):
            return True
        if re.match(r'^#{1,6}\s', stripped):
            return True
        if stripped.startswith("---"):
            return True
        if stripped.startswith("> "):
            return True
        return False

    def _extract_chinese_sentences(self, text):
        """从文本中提取中文句子（去除英文部分）"""
        sentences = re.split(r'([。！？；：，])', text)
        return sentences

    # ─── 异形词加载 ─────────────────────────────────────

    def _load_variant_forms(self):
        """从 GF_1001_2001_异形词整理表.md 解析非推荐→推荐映射"""
        variant_path = Path(__file__).resolve().parent / "GF_1001_2001_异形词整理表.md"
        mapping = {}
        if not variant_path.is_file():
            return mapping

        with open(variant_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                # 跳过标题、引用、分隔线、空行
                if not line or line.startswith("#") or line.startswith(">") or line.startswith("---"):
                    continue
                # 解析 "推荐词形——非推荐词形1、非推荐词形2"
                if "——" not in line:
                    continue
                recommended, variants_str = line.split("——", 1)
                recommended = recommended.strip()
                # 非推荐侧可能有多个，用 、 分隔
                for variant in variants_str.split("、"):
                    variant = variant.strip()
                    if variant:
                        mapping[variant] = recommended
        return mapping

    # ─── 检查 1：句末点号 ────────────────────────────────

    def check_sentence_end(self, filepath, lines):
        """检查句末点号使用"""
        for i, line in enumerate(lines, 1):
            if self._is_code_or_table_line(line):
                continue
            if not self._is_chinese_line(line):
                continue

            stripped = line.strip()

            if re.search(r'[一-鿿㐀-䶿]\.[\s]*$', stripped):
                self._add(filepath, i, stripped,
                          "4.1 句号 — 中文陈述句末尾应使用 。，不得使用英文句号 .",
                          "将句末英文句号 . 改为中文句号 。", "T0")

            if re.search(r'！{4,}', stripped):
                self._add(filepath, i, stripped,
                          "4.3 叹号 — 叹号叠用最多三个，此处超过三个",
                          "减少叹号数量至三个以内", "T2")

            if re.search(r'？{4,}', stripped):
                self._add(filepath, i, stripped,
                          "4.2 问号 — 问号叠用最多三个，此处超过三个",
                          "减少问号数量至三个以内", "T2")

    # ─── 检查 2：句内点号 ────────────────────────────────

    def check_sentence_internal(self, filepath, lines):
        """检查句内点号使用"""
        for i, line in enumerate(lines, 1):
            if self._is_code_or_table_line(line):
                continue
            if not self._is_chinese_line(line):
                continue

            stripped = line.strip()

            # 英文逗号替代中文逗号
            if re.search(r'[一-鿿],[一-鿿]', stripped):
                self._add(filepath, i, stripped,
                          "4.4 逗号 — 中文文本中不应使用英文逗号 , 替代中文逗号 ，",
                          "将英文逗号 , 改为中文逗号 ，", "T0")

            # 英文分号替代中文分号
            if re.search(r'[一-鿿];[一-鿿]', stripped):
                self._add(filepath, i, stripped,
                          "4.6 分号 — 中文文本中不应使用英文分号 ; 替代中文分号 ；",
                          "将英文分号 ; 改为中文分号 ；", "T0")

            # 英文冒号替代中文冒号
            if re.search(r'[一-鿿]:[一-鿿]', stripped):
                self._add(filepath, i, stripped,
                          "4.7 冒号 — 中文文本中不应使用英文冒号 : 替代中文冒号 ：",
                          "将英文冒号 : 改为中文冒号 ：", "T0")

            # 非言语动词后冒号接引号 — 白名单反转检查
            for m in re.finditer(r'([一-鿿]{1,6})："', stripped):
                word_before = m.group(1)
                if not _is_speech_verb(word_before):
                    ctx = stripped[max(0, m.start()-6):m.end()+12]
                    self._add(filepath, i, stripped,
                              "4.7 冒号 + 4.8 引号 — 非言语动词后不应使用冒号引出对话，应使用逗号",
                              f"将「{word_before}：\"」改为「{word_before}，\"」(上下文: …{ctx}…)", "T0")
                    break  # 每行只报第一个

    # ─── 检查 3：引号配对 ───────────────────────────────

    def check_quote_pairing(self, filepath, lines):
        """检查引号、括号、书名号配对"""
        full_text = "\n".join(lines)

        left_quotes_cn = full_text.count("“")
        right_quotes_cn = full_text.count("”")
        if left_quotes_cn != right_quotes_cn:
            self._add(filepath, 0, f"全文左引号“ {left_quotes_cn} 个，右引号” {right_quotes_cn} 个",
                      "4.8 引号 — 中文双引号左右数量不匹配，存在未闭合引号",
                      f"检查全文，补齐缺失的 {'左' if left_quotes_cn < right_quotes_cn else '右'}引号", "T0")

        ascii_double_quotes = full_text.count('"')
        if ascii_double_quotes % 2 != 0:
            self._add(filepath, 0, f"全文英文直双引号 \" 共 {ascii_double_quotes} 个（奇数），存在未闭合",
                      "4.8 引号 — 引号数量为奇数，存在未闭合引号",
                      "检查全文，补齐缺失的引号", "T0")

        left_book = full_text.count("《")
        right_book = full_text.count("》")
        if left_book != right_book:
            self._add(filepath, 0, f"全文左书名号《 {left_book} 个，右书名号》 {right_book} 个",
                      "4.15 书名号 — 书名号左右数量不匹配",
                      "检查全文，补齐缺失的书名号", "T0")

        left_paren_cn = full_text.count("（")
        right_paren_cn = full_text.count("）")
        if left_paren_cn != right_paren_cn:
            self._add(filepath, 0, f"全文中左括号（ {left_paren_cn} 个，右括号） {right_paren_cn} 个",
                      "4.9 括号 — 中文括号左右数量不匹配",
                      "检查全文，补齐缺失的括号", "T0")

        left_sq = full_text.count("【")
        right_sq = full_text.count("】")
        if left_sq != right_sq:
            self._add(filepath, 0, f"全文左方头括号【 {left_sq} 个，右方头括号】 {right_sq} 个",
                      "4.9 括号 — 方头括号左右数量不匹配",
                      "检查全文，补齐缺失的括号", "T1")

        for i, line in enumerate(lines, 1):
            if not self._is_chinese_line(line):
                continue
            stripped = line.strip()
            if '‘' in stripped or '’' in stripped:
                self._add(filepath, i, stripped,
                          "4.8 引号 — 出现中文卷曲单引号 ''（U+2018/U+2019），中文文本中单引号应内嵌于双引号中",
                          "确认引号嵌套层级无误", "T2")

    # ─── 检查 4：标点书写形式 ────────────────────────────

    def check_punctuation_form(self, filepath, lines):
        """检查标点符号的书写形式和位置"""
        for i, line in enumerate(lines, 1):
            if self._is_code_or_table_line(line):
                continue
            if not self._is_chinese_line(line):
                continue

            stripped = line.strip()

            if re.search(r'[一-鿿]\.\.\.[一-鿿]', stripped):
                self._add(filepath, i, stripped,
                          "4.11 省略号 — 中文文本应使用 ……（两个字符位，六个点），不得使用 ...",
                          "将 ... 替换为 ……", "T0")

            if re.search(r'[一-鿿]\.\.\.[\s]*$', stripped):
                self._add(filepath, i, stripped,
                          "4.11 省略号 — 中文文本应使用 ……，不得使用 ...",
                          "将 ... 替换为 ……", "T0")

            if re.search(r'[一-鿿]\s*\.\.\.\s*[一-鿿]', stripped):
                self._add(filepath, i, stripped,
                          "4.11 省略号 — 中文文本中省略号应为 ……，不得使用三个英文句点 ...",
                          "将 ... 替换为 ……", "T0")

            if re.search(r'(?<!\.)\.\.(?!\.)', stripped) and not re.search(r'\.\.\.', stripped):
                if re.search(r'[一-鿿]', stripped):
                    self._add(filepath, i, stripped,
                              "4.11 省略号 — 中文文本中出现两个句点 ..，可能为省略号残缺",
                              "若为省略号，应使用 ……；若为其他用途，请确认", "T2")

            single_em_dashes = re.findall(r'(?<!—)—(?!—)', stripped)
            if single_em_dashes and re.search(r'[一-鿿]', stripped):
                for match in re.finditer(r'[一-鿿（）《》]—[一-鿿（）《》]', stripped):
                    self._add(filepath, i, stripped,
                              "4.10 破折号 — 中文文本中破折号应占两个字位置（——），单个 — 不符合国标",
                              "将单个 — 替换为 ——（两个 em dash 连续），或确认此处是否应为连接号", "T1")

            if re.search(r'—\s+—', stripped):
                self._add(filepath, i, stripped,
                          "5.1 标点位置 — 破折号占两个字位置，中间不得断开加空格",
                          "删除破折号中间的空格", "T0")

            if re.search(r'…\s+…', stripped):
                self._add(filepath, i, stripped,
                          "5.1 标点位置 — 省略号占两个字位置，中间不得断开加空格",
                          "删除省略号中间的空格", "T0")

            if re.match(r'^\s*[，、；：。？！]', stripped):
                self._add(filepath, i, stripped,
                          "5.1 标点位置 — 句内点号和句末点号不得出现在一行之首",
                          "将行首标点移至上一行末尾", "T0")

            if re.search(r'[“（《【]\s*$', stripped):
                self._add(filepath, i, stripped,
                          "5.1 标点位置 — 前引号/前括号/前书名号不得出现在一行之末",
                          "将行末前引号/前括号移至下一行开头", "T2")

            if '•' in stripped and re.search(r'[一-鿿]', stripped):
                if re.search(r'[一-鿿]•[一-鿿]', stripped):
                    self._add(filepath, i, stripped,
                              "4.14 间隔号 — 中文人名中的间隔号应为 ·（U+00B7），而非项目符号 •（U+2022）",
                              "将 • 改为 ·", "T1")

    # ─── 检查 5：异形词扫描 ────────────────────────────

    def check_variant_forms_md(self, filepath, lines):
        """对 MD 文件中文字符串进行异形词扫描"""
        if not self.variant_dict:
            return
        full_text = "\n".join(lines)
        for variant, recommended in self.variant_dict.items():
            if variant in full_text:
                # 找到所有出现位置
                for m in re.finditer(re.escape(variant), full_text):
                    pos = m.start()
                    ctx = full_text[max(0, pos-6):pos+len(variant)+6].replace("\n", " ")
                    # 计算行号
                    line_no = full_text[:pos].count("\n") + 1
                    self._add(filepath, line_no, f"…{ctx}…",
                              f"GF 1001—2001 异形词 —「{variant}」为非推荐词形，应使用「{recommended}」",
                              f"将「{variant}」替换为「{recommended}」", "T0")
                break  # 每种异形词只报一次

    def check_variant_forms_str(self, filepath, text):
        """对单个中文字符串进行异形词扫描"""
        if not self.variant_dict:
            return
        for variant, recommended in self.variant_dict.items():
            if variant in text:
                self._add(filepath, 0, f"字段值含「{variant}」",
                          f"GF 1001—2001 异形词 —「{variant}」为非推荐词形，应使用「{recommended}」",
                          f"将「{variant}」替换为「{recommended}」", "T0")

    # ─── 检查 6：数字用法扫描 ──────────────────────────

    def check_number_usage_md(self, filepath, lines):
        """MD 简介基础信息区数字用法检查"""
        in_basic_info = False
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            # 基础信息区以"基础信息"或"一、基础信息"开头
            if "基础信息" in stripped:
                in_basic_info = True
                continue
            if in_basic_info:
                # 遇到空行或下一个章节标题则退出
                if not stripped or stripped.startswith("#") or re.match(r'^[一二三四五六七八九十]、', stripped):
                    in_basic_info = False
                    continue
                # 检查身高/体重行的数字格式
                if re.search(r'(身高|体重|身高|体重)', stripped):
                    if not re.search(r'\d+\s*(cm|kg|m)', stripped):
                        self._add(filepath, i, stripped,
                                  "GB/T 15835 数字用法 — 基础信息区身高/体重应使用阿拉伯数字+英文单位",
                                  "使用阿拉伯数字+英文单位格式，如 166cm、50kg", "T0")

    def check_number_usage_json(self, filepath, data):
        """JSON appearance 字段数字用法检查"""
        app = data.get("char_persona", {}).get("appearance", {})
        for field in ["height", "weight"]:
            val = app.get(field, "")
            if val and not re.search(r'^\d+\s*(cm|kg|m)$', val):
                self._add(filepath, 0, f"appearance.{field}={val}",
                          "GB/T 15835 数字用法 — 身高/体重必须使用阿拉伯数字+英文单位",
                          f"改为如 166cm、50kg 格式，当前值: {val}", "T0")

    # ─── 检查 7：JSON 文件特殊处理 ──────────────────────

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

        # 数字用法：appearance 字段
        self.check_number_usage_json(str(filepath), data)

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

        for str_path, text in chinese_strings:
            virtual_file = f"{filepath}::{str_path}"

            # 异形词
            self.check_variant_forms_str(virtual_file, text)

            # 英文省略号
            if '...' in text and re.search(r'[一-鿿]', text):
                self._add(virtual_file, 0, f"字段值出现 ...",
                          "4.11 省略号 — 中文文本应使用 ……，不得使用 ...",
                          "将 ... 替换为 ……", "T0")

            # 英文逗号分隔中文
            if re.search(r'[一-鿿],[一-鿿]', text):
                self._add(virtual_file, 0, f"字段值出现英文逗号 , 分隔中文",
                          "4.4 逗号 — 中文文本中不应使用英文逗号 , 替代中文逗号 ，",
                          "将英文逗号 , 改为中文逗号 ，", "T0")

            # 英文分号
            if re.search(r'[一-鿿];[一-鿿]', text):
                self._add(virtual_file, 0, f"字段值出现英文分号 ; 分隔中文",
                          "4.6 分号 — 中文文本中不应使用英文分号 ; 替代中文分号 ；",
                          "将英文分号 ; 改为中文分号 ；", "T0")

            # 英文冒号
            if re.search(r'[一-鿿]:[一-鿿]', text):
                self._add(virtual_file, 0, f"字段值出现英文冒号 : 分隔中文",
                          "4.7 冒号 — 中文文本中不应使用英文冒号 : 替代中文冒号 ：",
                          "将英文冒号 : 改为中文冒号 ：", "T0")

            # 非言语动词后冒号接引号 — 白名单反转检查
            for m in re.finditer(r'([一-鿿]{1,6})："', text):
                word_before = m.group(1)
                if not _is_speech_verb(word_before):
                    ctx = text[max(0, m.start()-6):m.end()+12]
                    self._add(virtual_file, 0, f"字段值出现非言语动词后冒号接引号",
                              "4.7 冒号 + 4.8 引号 — 非言语动词后不应使用冒号引出对话，应使用逗号",
                              f"将「{word_before}：\"」改为「{word_before}，\"」(上下文: …{ctx}…)", "T0")
                    break

            # 中文括号配对
            left_p = text.count("（")
            right_p = text.count("）")
            if left_p != right_p:
                self._add(virtual_file, 0, f"字段值中左括号（ {left_p} 个，右括号） {right_p} 个",
                          "4.9 括号 — 中文括号左右数量不匹配",
                          "补齐缺失的括号", "T0")

            # 书名号配对
            left_b = text.count("《")
            right_b = text.count("》")
            if left_b != right_b:
                self._add(virtual_file, 0, f"字段值中左书名号《 {left_b} 个，右书名号》 {right_b} 个",
                          "4.15 书名号 — 书名号左右数量不匹配",
                          "补齐缺失的书名号", "T0")

            # 中文引号配对
            left_q = text.count("“")
            right_q = text.count("”")
            if left_q != right_q:
                self._add(virtual_file, 0, f"字段值中左引号“ {left_q} 个，右引号” {right_q} 个",
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
            try:
                with open(filepath, "r", encoding="gbk") as f:
                    lines = f.readlines()
            except Exception:
                return

        self.check_sentence_end(str(filepath), lines)
        self.check_sentence_internal(str(filepath), lines)
        self.check_quote_pairing(str(filepath), lines)
        self.check_punctuation_form(str(filepath), lines)
        self.check_variant_forms_md(str(filepath), lines)
        self.check_number_usage_md(str(filepath), lines)

    def scan_all(self):
        """仅扫描角色卡目录和 World Info（世界观条目）"""
        scan_roots = [
            PROJECT_ROOT / '角色卡',
            PROJECT_ROOT / '创作者文件' / '导出文件' / 'world info',
        ]
        for scan_root in scan_roots:
            if not scan_root.is_dir():
                continue
            for root, dirs, files in os.walk(scan_root):
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

    has_t0 = any(
        item["severity"] == "T0"
        for items in checker.violations.values()
        for item in items
    )
    sys.exit(1 if has_t0 else 0)


if __name__ == "__main__":
    main()
