#!/usr/bin/env python3
"""Extract key fields from all character files for logic consistency review."""
import json
import os
import re
import glob

BASE = r"D:\File\AiJunkyard\dzmm\狩灵世界观"

def read_file(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except:
        return None

def extract_json_fields(jpath):
    """Extract key fields from a JSON character card."""
    content = read_file(jpath)
    if not content:
        return None
    try:
        j = json.loads(content)
    except:
        return {"_error": "JSON parse failed", "_path": jpath}

    data = {}
    data['file'] = os.path.basename(jpath)
    data['char_name'] = j.get('char_name','')
    data['char_fullname'] = j.get('char_fullname','')
    data['char_alias'] = j.get('char_alias','')
    data['char_identity'] = j.get('char_identity','')
    data['char_rank'] = j.get('char_rank','')
    data['char_faction'] = j.get('char_faction','')
    data['char_status'] = j.get('char_status','')

    persona = j.get('char_persona', {})
    data['gender'] = persona.get('gender','')
    data['age'] = persona.get('age', '')
    data['height'] = persona.get('appearance',{}).get('height','')
    data['weight'] = persona.get('appearance',{}).get('weight','')
    data['weapon_json'] = persona.get('appearance',{}).get('weapon','')

    # core traits
    pers = j.get('char_personality', {})
    data['core_traits'] = pers.get('core_traits','')
    data['strengths'] = pers.get('strengths','')
    data['flaws'] = pers.get('flaws','')
    data['quirks'] = pers.get('quirks','')

    # background
    bg = j.get('char_background', {})
    data['origin'] = bg.get('origin','')
    data['current_mission'] = bg.get('current_mission','')

    # description
    desc = j.get('char_description', {})
    data['overview'] = desc.get('overview','')
    data['combat_style'] = desc.get('combat_style','')

    # basic abilities
    ba = j.get('char_basic_abilities', {})
    data['ba_lingli'] = ba.get('灵力','')
    data['ba_lingshi'] = ba.get('灵视','')
    data['ba_shenti'] = ba.get('身体素质','')

    # special abilities
    sa = j.get('char_special_abilities', {})
    data['sa_keys'] = list(sa.keys()) if sa else []
    data['sa_has_circuit'] = any(k.startswith('灵力回路-') for k in (sa or {}))
    data['sa_has_noncircuit'] = any(not k.startswith('灵力回路-') for k in (sa or {}))

    # relationships
    rels = j.get('char_relationships', {})
    data['rel_keys'] = list(rels.keys()) if rels else []

    # dialogue examples
    dials = j.get('char_dialogue_examples', [])
    data['dialogue_count'] = len(dials)

    return data

def extract_md_intro_fields(mdpath):
    """Extract key info from intro MD."""
    content = read_file(mdpath)
    if not content:
        return None
    lines = content.split('\n')
    data = {}

    # Find first non-empty line after initial blank
    started = False
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        if not started:
            # First line with content should be header or the "一般称呼" line
            started = True
        # Check for 一般称呼
        m = re.match(r'^一、一般称呼[：:]?\s*(.*)', stripped)
        if m:
            data['一般称呼'] = m.group(1).strip()
        m = re.match(r'^二、基础信息[：:]?\s*(.*)', stripped)
        if m:
            data['基础信息行'] = m.group(1).strip()
        m = re.match(r'^三、基础能力[：:]?\s*(.*)', stripped)
        if m:
            data['基础能力行'] = m.group(1).strip()
        m = re.match(r'^四、特殊能力[：:]?\s*(.*)', stripped)
        if m:
            data['特殊能力行'] = m.group(1).strip()
        m = re.match(r'^五、综合评估[：:]?\s*(.*)', stripped)
        if m:
            data['综合评估行'] = m.group(1).strip()

    # Rating extraction - look for 评级 in the whole text
    rating_matches = re.findall(r'评级[：:]\s*([^\n]+)', content)
    if rating_matches:
        data['评级MD'] = rating_matches[0].strip()

    # Evaluator
    eval_matches = re.findall(r'评估方[：:]\s*([^\n]+)', content)
    if eval_matches:
        data['评估方MD'] = eval_matches[0].strip()

    return data

def extract_opening_token_info(mdpath):
    """Extract basic info from opening MD."""
    content = read_file(mdpath)
    if not content:
        return None
    data = {}
    data['char_count'] = len(content)
    # Rough token estimation (Chinese chars ~1.5 tokens, English words ~1.3 tokens)
    data['content_preview'] = content[:200] if content else ''

    # Check for ControlBoundary issues - look for patterns like "你是"
    data['has_you_are_pattern'] = bool(re.search(r'你是(一个|名|位)', content))
    data['has_user_action'] = bool(re.search(r'\*[^*]+\*', content))  # markdown action wrapping

    # Check for forbidden punctuation in narration
    # Count line types
    data['line_count'] = len(content.split('\n')) if content else 0

    return data

# Collect all JSON files
all_json = []
for root, dirs, files in os.walk(BASE):
    for f in files:
        if f.endswith('.json'):
            all_json.append(os.path.join(root, f))

print(f"Found {len(all_json)} JSON files")
print("="*80)

# Extract all JSON data
all_data = []
for jpath in sorted(all_json):
    # Skip non-character JSON (world cards, event cards, etc.)
    relpath = os.path.relpath(jpath, BASE)
    char_dirs = ['协会狩灵角色卡','事务所狩灵角色卡','工坊狩灵角色卡','游魂角色卡','罪灵角色卡','锈钟角色卡']
    if not any(d in relpath for d in char_dirs):
        print(f"SKIP (non-character): {relpath}")
        continue
    data = extract_json_fields(jpath)
    if data:
        data['_relpath'] = relpath
        all_data.append(data)
        if '_error' in data:
            print(f"ERROR: {relpath} - {data['_error']}")

print(f"\nExtracted {len(all_data)} character JSON files\n")

# === TABLE 1: Basic Info Aggregation ===
print("="*80)
print("TABLE 1: 基础信息聚合 (姓名/身份/评级/从属/状态)")
print("="*80)
print(f"{'角色':<10} {'身份':<6} {'评级':<20} {'从属':<30} {'状态':<12} {'性别':<6} {'年龄':<6} {'身高':<8} {'体重':<8}")
print("-"*100)
for d in sorted(all_data, key=lambda x: (x['char_identity'], x.get('char_rank',''))):
    print(f"{d['char_name']:<10} {d['char_identity']:<6} {d['char_rank']:<20} {d['char_faction']:<30} {d['char_status']:<12} {d['gender']:<6} {d.get('age',''):<6} {d.get('height',''):<8} {d.get('weight',''):<8}")

# === TABLE 2: Basic Abilities Aggregation ===
print("\n" + "="*80)
print("TABLE 2: 基础能力聚合")
print("="*80)
print(f"{'角色':<10} {'身份':<6} {'灵力':<40} {'灵视':<40} {'身体素质':<30}")
print("-"*120)
for d in sorted(all_data, key=lambda x: x['char_name']):
    print(f"{d['char_name']:<10} {d['char_identity']:<6} {d['ba_lingli'][:38]:<40} {d['ba_lingshi'][:38]:<40} {d['ba_shenti'][:28]:<30}")

# === TABLE 3: Special Abilities Aggregation ===
print("\n" + "="*80)
print("TABLE 3: 特殊能力聚合")
print("="*80)
print(f"{'角色':<10} {'身份':<6} {'SA key数量':<10} {'有回路':<8} {'有非回路':<10} {'SA keys'}")
print("-"*120)
for d in sorted(all_data, key=lambda x: x['char_name']):
    print(f"{d['char_name']:<10} {d['char_identity']:<6} {len(d['sa_keys']):<10} {str(d['sa_has_circuit']):<8} {str(d['sa_has_noncircuit']):<10} {d['sa_keys']}")

# === TABLE 4: Weapon Info ===
print("\n" + "="*80)
print("TABLE 4: 武器信息聚合")
print("="*80)
for d in sorted(all_data, key=lambda x: x['char_name']):
    wp = d.get('weapon_json','')
    print(f"{d['char_name']:<10}: {wp[:150]}")

# === TABLE 5: Relationships (keys only) ===
print("\n" + "="*80)
print("TABLE 5: 关系聚合 (Key列表)")
print("="*80)
for d in sorted(all_data, key=lambda x: x['char_name']):
    print(f"{d['char_name']:<10} [{d['char_identity']}]: {d['rel_keys']}")

# === TABLE 6: Evaluator / 评估方 ===
print("\n" + "="*80)
print("TABLE 6: 评估方聚合 (从简介MD提取)")
print("="*80)
print(f"{'角色':<10} {'身份':<6} {'从属':<30} {'评估方(MD)':<30} {'评级(MD)':<20} {'一般称呼':<10}")
print("-"*100)
for d in sorted(all_data, key=lambda x: x['char_name']):
    name = d['char_name']
    # Find corresponding MD file
    relpath = d.get('_relpath','')
    mddir = os.path.dirname(os.path.join(BASE, relpath))
    md_name = f"{name}简介.md"
    mdpath = os.path.join(mddir, md_name)
    mddata = extract_md_intro_fields(mdpath) if os.path.exists(mdpath) else {}
    print(f"{name:<10} {d['char_identity']:<6} {d['char_faction']:<30} {mddata.get('评估方MD','N/A'):<30} {mddata.get('评级MD','N/A'):<20} {mddata.get('一般称呼','N/A'):<10}")

# === TABLE 7: Cross-character relationship analysis ===
print("\n" + "="*80)
print("TABLE 7: 跨角色关系双向检查")
print("="*80)
# Build name -> rels mapping
name_to_rels = {}
for d in all_data:
    name_to_rels[d['char_name']] = d['rel_keys']

# Check common relationship pairs
# 花坂三兄妹: 花坂 千乐, 花坂 葵, 花坂 薰
siblings = ['千乐', '葵', '薰']
for i, a in enumerate(siblings):
    for b in siblings[i+1:]:
        a_has_b = b in name_to_rels.get(a, [])
        b_has_a = a in name_to_rels.get(b, [])
        status = "OK" if (a_has_b and b_has_a) else "MISSING"
        if status != "OK":
            status += f" ({a}→{b}:{a_has_b}, {b}→{a}:{b_has_a})"
        print(f"花坂兄弟 {a}↔{b}: {status}")

# 晨昏事务所: 贝尔金, 贝拉, 静流, 千乐, 弗洛伦, 水镜, 菲利普·钢翼
chenhun = ['贝尔金', '贝拉', '静流', '千乐', '弗洛伦', '水镜', '菲利普 · 钢翼']
for i, a in enumerate(chenhun):
    for b in chenhun[i+1:]:
        a_bname = b.split(' · ')[0] if ' · ' in b else b
        b_aname = a.split(' · ')[0] if ' · ' in a else a
        a_has_b = a_bname in name_to_rels.get(a, [])
        b_has_a = b_aname in name_to_rels.get(b, [])
        if not (a_has_b and b_has_a):
            print(f"晨昏 {a}↔{b}: MISSING ({a}→{b}:{a_has_b}, {b}→{a}:{b_has_a})")

# 烬-劫-慎 三角
triangle = ['烬', '劫', '慎']
for i, a in enumerate(triangle):
    for b in triangle[i+1:]:
        a_has_b = b in name_to_rels.get(a, [])
        b_has_a = a in name_to_rels.get(b, [])
        status = "OK" if (a_has_b and b_has_a) else "MISSING"
        if status != "OK":
            status += f" ({a}→{b}:{a_has_b}, {b}→{a}:{b_has_a})"
        print(f"三角 {a}↔{b}: {status}")

# === TABLE 8: Identity/Rank format check ===
print("\n" + "="*80)
print("TABLE 8: char_identity + char_rank 枚举值检查")
print("="*80)
valid_ids = {'狩灵', '游魂', '罪灵', '异常'}
valid_ranks = {'1阶','2阶','3阶','4阶','5阶','None','传闻级','怪谈级','梦魇级','灾厄级','终焉级'}
# Also check for 色彩阶 variants
for d in all_data:
    id_ok = d['char_identity'] in valid_ids
    # Check rank
    rank = d['char_rank']
    # 色彩阶-* is also valid
    is_color = rank.startswith('色彩阶-') if rank else False
    rank_ok = rank in valid_ranks or is_color
    if not id_ok or not rank_ok:
        print(f"ISSUE: {d['char_name']}: identity={d['char_identity']}({'OK' if id_ok else 'INVALID'}), rank={rank}({'OK' if rank_ok else 'INVALID'})")

# Also check for identity-specific rank rules
for d in all_data:
    rank = d['char_rank']
    identity = d['char_identity']
    if identity == '游魂' and rank != 'None':
        print(f"WARN: 游魂 {d['char_name']} rank={rank}, expected None")
    if identity == '狩灵' and rank not in {'1阶','2阶','3阶','4阶','5阶'} and not rank.startswith('色彩阶-'):
        print(f"WARN: 狩灵 {d['char_name']} rank={rank}, expected 1-5阶 or 色彩阶-*")

print("\n\n=== EXTRACTION COMPLETE ===")
