"""
狩灵世界观 · 角色卡自动审查脚本
=====================================
覆盖项：JSON 语法 / Token 计数 / Em dash 扫描 / 枚举值校验 /
        MD 标点违禁 / 评级一致性 / 一般称呼规则 / 空能力字段 /
        引号格式 / 术语简写 / 年龄边界

用法：python 审查脚本_自动检查.py
输出分组：JSON检查 / MD检查 / 交叉验证
"""

import json
import os
import re
import sys
from glob import glob

# Windows GBK 终端兼容
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# ── 配置 ──────────────────────────────────────────
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(PROJECT_ROOT)

VALID_IDENTITY = {"狩灵", "游魂", "罪灵", "异常"}
VALID_RANK = {"1阶", "2阶", "3阶", "4阶", "5阶", "None",
              "传闻级", "怪谈级", "梦魇级", "灾厄级", "终焉级"}

# ── 读取专有名词全称表 ──────────────────────────────
def load_proper_noun_table():
    """从 专有名词全称表.md 解析简称→(全称, 匹配模式)映射，供术语简写检测使用"""
    table_path = os.path.join(PROJECT_ROOT, "创作者文件", "专有名词全称表.md")
    mapping = {}  # forbidden_form -> (full_name, mode)
    if not os.path.isfile(table_path):
        return mapping

    with open(table_path, "r", encoding="utf-8") as f:
        in_table = False
        for line in f:
            line = line.strip()
            # 找到表格（含"禁止"和"强制"的表头行）
            if line.startswith("|") and "禁止" in line and "强制" in line:
                in_table = True
                continue
            if in_table:
                if not line.startswith("|"):
                    in_table = False
                    continue
                parts = [p.strip() for p in line.split("|")]
                if len(parts) >= 5 and parts[1] and parts[2]:
                    forbidden = parts[1]
                    full = parts[2]
                    mode = parts[3] if parts[3] else "子串"
                    # 跳过分隔行和表头
                    if forbidden in ("禁止的简称/变体", "------", "规则"):
                        continue
                    mapping[forbidden] = (full, mode)
    return mapping

PROPER_NOUN_MAP = load_proper_noun_table()

# ── Token 计数（四段式分部预算）────────────────────
def get_token_counts():
    try:
        import tiktoken
    except ImportError:
        import subprocess
        subprocess.run([sys.executable, "-m", "pip", "install", "tiktoken", "-q"])
        import tiktoken
    enc = tiktoken.get_encoding("cl100k_base")

    # 四段预算区间
    BUDGET = {
        "A": (300, 500),     # 外壳
        "BC": (0, 500),      # 能力+关系
        "D": (200, 400),     # 对话示例
        "total": (500, 1400), # 总计
    }

    def segment_tokens(data):
        """拆分 JSON 为 A / B / C / D 四段并返回各段 token"""
        seg_a = {k: data[k] for k in [
            "char_name", "char_fullname", "char_alias", "char_identity",
            "char_rank", "char_faction", "char_status", "char_persona",
            "char_description", "char_personality", "char_background"
        ] if k in data}
        ta = len(enc.encode(json.dumps(seg_a, ensure_ascii=False)))

        seg_b = {}
        if "char_basic_abilities" in data:
            seg_b["char_basic_abilities"] = data["char_basic_abilities"]
        if "char_special_abilities" in data:
            seg_b["char_special_abilities"] = data["char_special_abilities"]
        tb = len(enc.encode(json.dumps(seg_b, ensure_ascii=False)))

        seg_c = {"char_relationships": data.get("char_relationships", {})}
        tc = len(enc.encode(json.dumps(seg_c, ensure_ascii=False)))

        seg_d = {"char_dialogue_examples": data.get("char_dialogue_examples", [])}
        td = len(enc.encode(json.dumps(seg_d, ensure_ascii=False)))

        return ta, tb, tc, td

    print("=" * 60)
    print(f"JSON Token 计数（四段式: A{BUDGET['A']} BC{BUDGET['BC']} D{BUDGET['D']} 总{BUDGET['total']}）")
    print("=" * 60)

    violations = []
    for f in sorted(glob("**/*.json", recursive=True)):
        d = os.path.dirname(f)
        if "事件卡" in d or "世界观卡" in d or "角色关系网" in d:
            continue
        with open(f, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        ta, tb, tc, td = segment_tokens(data)
        bc = tb + tc
        total = ta + bc + td
        name = os.path.basename(f)

        for seg, val, (lo, hi) in [("A", ta, BUDGET["A"]), ("BC", bc, BUDGET["BC"]), ("D", td, BUDGET["D"]), ("总", total, BUDGET["total"])]:
            if val < lo:
                violations.append(f"  {name:<20s} {seg}段偏低 {val:4d} (下限{lo})")
            if val > hi:
                violations.append(f"  {name:<20s} {seg}段超标 {val:4d} (上限{hi})")

    if violations:
        for v in violations:
            print(v)
    else:
        print("  全部达标")

    print()
    print("=" * 60)
    print("开场白 Token 计数 (区间 900-1,100)")
    print("=" * 60)
    for f in sorted(glob("**/*开场白.md", recursive=True)):
        d = os.path.dirname(f)
        if "事件卡" in d or "世界观卡" in d:
            continue
        with open(f, "r", encoding="utf-8") as fh:
            content = fh.read()
        tokens = len(enc.encode(content))
        name = os.path.basename(f)
        if tokens > 1100:
            print(f"  OVER  {name:20s} {tokens:4d}")
        elif tokens < 900:
            print(f"  UNDER {name:20s} {tokens:4d}")


# ── JSON 结构检查 ─────────────────────────────────
def check_json_structure():
    print("=" * 60)
    print("JSON 语法 + 结构校验")
    print("=" * 60)

    json_files = sorted(glob("**/*.json", recursive=True))
    syntax_errors = []
    enum_errors = []
    convention_warnings = []
    empty_abilities = []
    em_dash_hits = []

    for f in json_files:
        name = os.path.basename(f)
        d = os.path.dirname(f)

        # 语法
        try:
            with open(f, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception as e:
            syntax_errors.append(f"  {f}: {e}")
            continue

        # 跳过事件卡/世界观卡/角色关系网（不同格式）
        if "事件卡" in d or "世界观卡" in d or "角色关系网" in d:
            continue

        # 枚举值
        if data.get("char_identity") not in VALID_IDENTITY:
            enum_errors.append(f"  {name}: char_identity={data.get('char_identity')}")
        rank = data.get("char_rank", "")
        if rank not in VALID_RANK and not rank.startswith("色彩阶-"):
            enum_errors.append(f"  {name}: char_rank={rank}")

        # 对话示例引号格式（response 中必须用英文直双引号 ""）
        for i, ex in enumerate(data.get("char_dialogue_examples", [])):
            resp = ex.get("response", "")
            if "“" in resp or "”" in resp:
                convention_warnings.append(f"  {name}: dialogue_examples[{i}] response 含中文卷曲引号")

        # 术语简写检测（基于 专有名词全称表.md）
        def check_abbr(value, path):
            errs = []
            if isinstance(value, str):
                for forbidden, (full, mode) in PROPER_NOUN_MAP.items():
                    if forbidden not in value:
                        continue
                    # 全称已出现则跳过
                    if full in value:
                        continue
                    # 独立词模式：前后不能有中文字符（避免"事务所"误伤"绯月事务所"）
                    if mode == "独立词":
                        hit = False
                        for m in re.finditer(re.escape(forbidden), value):
                            start, end = m.start(), m.end()
                            prev_char = value[start-1] if start > 0 else ''
                            next_char = value[end] if end < len(value) else ''
                            # 前/后字符为中文字符（CJK统一表意文字 U+4E00-U+9FFF）→ 属于复合词，跳过
                            if prev_char and '一' <= prev_char <= '鿿':
                                continue
                            if next_char and '一' <= next_char <= '鿿':
                                continue
                            # 前后均无中文字符 → 独立词，命中
                            ctx = value[max(0, start-8):end+8]
                            errs.append(f"  {name}: {path} \"{forbidden}\" 应为 \"{full}\" (上下文: ...{ctx}...)")
                            hit = True
                        if not hit:
                            continue
                    else:
                        # 子串模式：任何位置出现即命中
                        idx = value.find(forbidden)
                        ctx = value[max(0, idx-8):idx+len(forbidden)+8]
                        errs.append(f"  {name}: {path} \"{forbidden}\" 应为 \"{full}\" (上下文: ...{ctx}...)")
            elif isinstance(value, dict):
                for k, v in value.items():
                    errs.extend(check_abbr(v, f"{path}.{k}"))
            elif isinstance(value, list):
                for i, item in enumerate(value):
                    errs.extend(check_abbr(item, f"{path}[{i}]"))
            return errs

        for field in ["char_faction", "char_status"]:
            if field in data and isinstance(data[field], str):
                convention_warnings.extend(check_abbr(data[field], field))
        if "char_relationships" in data:
            convention_warnings.extend(check_abbr(data["char_relationships"], "char_relationships"))

        # 年龄边界（< 18 标记人工复核，区分觉醒年龄与从业年龄）
        age = data.get("char_persona", {}).get("age")
        if age is not None:
            try:
                age_int = int(str(age).strip())
                if age_int < 18:
                    convention_warnings.append(f"  {name}: char_persona.age={age_int} < 18，请人工确认是觉醒年龄（可接受）还是从业年龄（须>=18）")
            except ValueError:
                pass

        # 空 char_special_abilities
        if "char_special_abilities" in data:
            if data["char_special_abilities"] == {} or not data["char_special_abilities"]:
                empty_abilities.append(f"  {name}: EMPTY char_special_abilities (应省略整个字段)")

        # Em dash 扫描（检查叙述字段；对话示例中区分引号内外）
        def scan_em_dash(obj, prefix=""):
            hits = []
            if isinstance(obj, dict):
                for k, v in obj.items():
                    np = f"{prefix}.{k}" if prefix else k
                    if isinstance(v, (dict, list)):
                        hits.extend(scan_em_dash(v, np))
                    elif isinstance(v, str):
                        # char_dialogue_examples 中 situation 禁止 ——/……，response 仅检查引号外
                        if prefix.endswith(".situation") or k == "situation":
                            if "——" in v or "……" in v:
                                ctx = v[:80].replace("\n", " ")
                                hits.append(f"  {np}: [叙述禁止] {ctx}")
                        elif prefix.endswith(".response") or k == "response":
                            stripped = re.sub(r'"[\s\S]*?"', '', v)
                            if "——" in stripped or "……" in stripped:
                                ctx = stripped.strip()[:80].replace("\n", " ")
                                hits.append(f"  {np}: [引号外禁止] {ctx}")
                        else:
                            if "——" in v or "……" in v:
                                ctx = v[:80].replace("\n", " ")
                                hits.append(f"  {np}: [叙述禁止] {ctx}")
            elif isinstance(obj, list):
                for i, item in enumerate(obj):
                    hits.extend(scan_em_dash(item, f"{prefix}[{i}]"))
            return hits

        hits = scan_em_dash(data)
        if hits:
            em_dash_hits.append(f"{name}:")
            em_dash_hits.extend(hits)

    if syntax_errors:
        print("  [语法错误]")
        for e in syntax_errors:
            print(e)
    else:
        print(f"  语法解析: {len(json_files)} 文件全部通过")

    if enum_errors:
        print("  [枚举值异常]")
        for e in enum_errors:
            print(e)
    else:
        print("  枚举值: 全部合法")

    if convention_warnings:
        print("  [术语/格式规范]")
        for w in convention_warnings:
            print(w)

    if empty_abilities:
        print("  [空 special_abilities]")
        for e in empty_abilities:
            print(e)
    else:
        print("  char_special_abilities: 无误留空 {}")

    if em_dash_hits:
        print("  [Em dash 违规]")
        for e in em_dash_hits:
            print(e)
    else:
        print("  Em dash: 零命中")


# ── MD 文件检查 ────────────────────────────────────
def check_md_files():
    print()
    print("=" * 60)
    print("MD 简介/开场白 标点违禁扫描")
    print("=" * 60)

    md_files = sorted(glob("**/*简介.md", recursive=True)) + sorted(glob("**/*开场白.md", recursive=True))
    issues_by_file = {}

    for f in md_files:
        name = os.path.basename(f)
        with open(f, "r", encoding="utf-8") as fh:
            content = fh.read()
        issues = []

        # 单独 em dash（非 ——）
        for m in re.finditer(r"(?<!—)—(?!—)", content):
            pos = m.start()
            ctx = content[max(0, pos - 8):min(len(content), pos + 9)].replace("\n", " ")
            issues.append(f"  —: ...{ctx}...")

        # En dash
        if "–" in content:
            issues.append("  含 en dash (–)")

        # 英文省略号
        if "..." in content:
            for m in re.finditer(r"\.\.\.", content):
                pos = m.start()
                ctx = content[max(0, pos - 5):min(len(content), pos + 8)].replace("\n", " ")
                issues.append(f"  ...: ...{ctx}...")

        # 卷曲引号（仅开场白）
        if "开场白" in f and ("“" in content or "”" in content):
            issues.append("  含中文卷曲引号")

        # Markdown 装饰符
        for m in re.finditer(r"\*[^*\s][^*]*[^*\s]\*", content):
            mt = m.group()
            if mt != "***":
                issues.append(f"  *...*: {mt[:50]}")

        # —— 密度检查（仅开场白）
        if "开场白" in f:
            dash_total = content.count("——")
            # 粗略区分叙述/对话：去掉引号内容后计数
            text_no_quotes = re.sub(r'".*?"', '', content)
            dash_narrative = text_no_quotes.count("——")
            dash_dialogue = dash_total - dash_narrative
            if dash_total > 3:
                issues.append(f"  —— 总量 {dash_total} 组 (叙述 {dash_narrative}/对话 {dash_dialogue})，超过 3 组上限，须逐条审查")
            elif dash_narrative > 2:
                issues.append(f"  叙述中 —— {dash_narrative} 组，偏多，建议审查是否可替换为逗号")

        if issues:
            issues_by_file[name] = issues

    if issues_by_file:
        for fname, iss in issues_by_file.items():
            print(f"  {fname}:")
            for i in iss:
                print(i)
    else:
        print("  全部通过")


# ── 交叉验证 ──────────────────────────────────────
def cross_validate():
    print()
    print("=" * 60)
    print("JSON <-> 简介 交叉验证")
    print("=" * 60)

    rating_mismatches = []
    general_name_issues = []

    for folder in sorted(glob("*/")):
        # 跳过非角色卡目录
        if any(skip in folder for skip in ["事件卡", "世界观卡", "角色关系网"]):
            continue
        json_files = glob(os.path.join(folder, "*", "*.json"))
        for jf in json_files:
            char_dir = os.path.dirname(jf)
            intro_files = glob(os.path.join(char_dir, "*简介.md"))
            if not intro_files:
                continue
            with open(jf, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if "char_rank" not in data:
                continue
            with open(intro_files[0], "r", encoding="utf-8") as fh:
                intro = fh.read()

            # 评级一致性
            json_rank = data["char_rank"]
            m = re.search(r"评级：(.+)", intro)
            intro_rank = m.group(1).strip() if m else "NOT FOUND"
            if json_rank != intro_rank:
                # 游魂 JSON "None" <-> 简介 "无" 是规范设计，不报错
                if not (json_rank == "None" and intro_rank == "无"):
                    rating_mismatches.append(
                        f"  {os.path.basename(char_dir):12s} JSON={json_rank:6s} 简介={intro_rank}"
                    )

            # 一般称呼
            char_name = data.get("char_name", "")
            char_alias = data.get("char_alias", "None")
            m_gen = re.search(r"一般称呼：(.+)", intro)
            general = m_gen.group(1).strip() if m_gen else ""
            if char_alias == "None" or not char_alias:
                expected = char_name
            elif char_alias == char_name:
                expected = char_name
            else:
                expected = f"{char_name}、{char_alias}"
            if general != expected:
                general_name_issues.append(
                    f"  {os.path.basename(char_dir):12s} name={char_name} alias={char_alias} expected='{expected}' actual='{general}'"
                )

    if rating_mismatches:
        print("  [评级不一致]")
        for e in rating_mismatches:
            print(e)
    else:
        print("  评级一致性: 全部匹配")

    if general_name_issues:
        print("  [一般称呼异常]")
        for e in general_name_issues:
            print(e)
    else:
        print("  一般称呼: 全部符合规则")


# ── 花坂全名扫描 ──────────────────────────────────
def scan_flower_slope_fullnames():
    print()
    print("=" * 60)
    print("花坂家族 关系键全名扫描")
    print("=" * 60)
    hits = []
    for f in sorted(glob("**/*.json", recursive=True)):
        with open(f, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        name = os.path.basename(f)
        for key in data.get("char_relationships", {}):
            if "花坂" in key and " " in key:
                hits.append(f"  {name}: \"{key}\"")
    if hits:
        print("  (注意: 枫/晴子为无角色卡NPC，以下如为父母引用属正常)")
        for h in hits:
            print(h)
    else:
        print("  零命中")


# ── 主入口 ────────────────────────────────────────
if __name__ == "__main__":
    get_token_counts()
    check_json_structure()
    check_md_files()
    cross_validate()
    scan_flower_slope_fullnames()
    print()
    print("=" * 60)
    print("自动检查完成。人工仅需确认离群值。")
