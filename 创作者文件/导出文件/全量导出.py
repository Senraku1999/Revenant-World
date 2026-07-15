"""
狩灵世界观 · 全量角色卡导出
==============================
遍历 角色卡/ 下所有子目录，将每个有完整文件（JSON + 开场白 + 简介 + 底图）的
卡打包为 SillyTavern chara_card_v2 PNG。

用法：python 全量导出.py
输出：导出角色卡/{卡名}.png（覆盖已有同名文件）
"""

import json, os, sys, struct, base64, zlib
from datetime import datetime

# Windows 终端兼容
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(PROJECT_ROOT)

# ── 世界书分配表（card_name 优先，必须与文件名逐字一致）──
ASSIGN = {
    '狩灵 全角色': ['新宿站', '协会1科', '四色音 · 闪耀舞台'],
    '狩灵 四色音': ['心音', '花音', '弦音', '铃音'],
    '狩灵 晨昏事务所': ['贝尔金', '贝拉', '弗洛伦', '菲利普'],
    '狩灵 沃拉瑟斯': ['菲利普 · 钢翼', '沃拉瑟斯'],
    '狩灵 花坂家': ['薰', '千乐', '百合子', '花坂家宴'],
    '狩灵 来生事务所': ['爱', '星流', '雨', '天'],
    '狩灵 追猎': ['慎', '劫', '烬'],
}

# ── 固定字段 ──
TAGS = ["狩灵", "大世界", "世界观", "现代", "超自然", "角色扮演", "战斗", "sfw"]
WB_DIR = '创作者文件/导出文件/成品世界书'
EXPORT_DIR = '导出角色卡'
BASE_PNG_DIR = '底图'

# ── 加载世界书 ──
def load_worldbooks():
    wb_cache = {}
    wb_names = ['狩灵', '狩灵 全角色', '狩灵 四色音', '狩灵 晨昏事务所',
                '狩灵 沃拉瑟斯', '狩灵 花坂家', '狩灵 来生事务所', '狩灵 追猎']
    for wb_name in wb_names:
        path = os.path.join(WB_DIR, f'{wb_name}.json')
        with open(path, 'r', encoding='utf-8') as f:
            wb_cache[wb_name] = json.load(f)
    return wb_cache

# ── 分配世界书 ──
def assign_worldbook(card_name, char_name):
    """card_name 优先匹配，char_name 做 fallback"""
    for wb_name, names in ASSIGN.items():
        if card_name in names:
            return wb_name
    for wb_name, names in ASSIGN.items():
        if char_name in names:
            return wb_name
    return '狩灵'

# ── PNG 嵌入 ──
def embed_chara_png(base_png_path, compact_json_bytes, output_path):
    with open(base_png_path, 'rb') as f:
        png_data = f.read()

    # 剥离已有 chara tEXt chunk
    chunks = []
    pos = 8
    while pos < len(png_data):
        if pos + 8 > len(png_data):
            break
        length = struct.unpack('>I', png_data[pos:pos+4])[0]
        chunk_type = png_data[pos+4:pos+8]
        chunk_data = png_data[pos+8:pos+8+length]
        crc = png_data[pos+8+length:pos+12+length]
        if chunk_type == b'tEXt':
            null_pos = chunk_data.find(b'\x00')
            if null_pos != -1 and chunk_data[:null_pos].decode('latin-1') == 'chara':
                pos += 12 + length
                continue
        chunks.append((length, chunk_type, chunk_data, crc))
        pos += 12 + length
        if chunk_type == b'IEND':
            break

    # 重建 PNG，在 IEND 前插入 chara chunk
    result = b'\x89PNG\r\n\x1a\n'
    for length, chunk_type, chunk_data, crc in chunks:
        if chunk_type == b'IEND':
            chara_b64 = base64.b64encode(compact_json_bytes)
            tEXt_data = b'chara\x00' + chara_b64
            tEXt_len = len(tEXt_data)
            tEXt_crc = struct.pack('>I', zlib.crc32(b'tEXt' + tEXt_data) & 0xFFFFFFFF)
            result += struct.pack('>I', tEXt_len) + b'tEXt' + tEXt_data + tEXt_crc
        result += struct.pack('>I', length) + chunk_type + chunk_data + crc

    with open(output_path, 'wb') as f:
        f.write(result)
    return len(result)

# ── 构建角色卡 JSON ──
def build_card(card_name, desc_str, first_mes_rn, intro_rn, wb_name, wb_entries, create_date):
    return {
        "name": f"狩灵 · {card_name}",
        "description": desc_str,
        "personality": "", "scenario": "",
        "first_mes": first_mes_rn,
        "mes_example": "",
        "creatorcomment": intro_rn,
        "avatar": "none",
        "chat": f"狩灵 · {card_name} - {create_date}",
        "talkativeness": "0.5", "fav": False,
        "tags": TAGS,
        "spec": "chara_card_v2", "spec_version": "2.0",
        "create_date": create_date,
        "data": {
            "name": f"狩灵 · {card_name}",
            "description": desc_str,
            "personality": "", "scenario": "",
            "first_mes": first_mes_rn,
            "mes_example": "",
            "creator_notes": intro_rn,
            "system_prompt": "", "post_history_instructions": "",
            "tags": TAGS,
            "creator": "千乐",
            "character_version": "",
            "alternate_greetings": [],
            "extensions": {
                "talkativeness": "0.5", "fav": False,
                "world": wb_name,
                "depth_prompt": {"prompt": "", "depth": 4, "role": "system"}
            },
            "character_book": {
                "name": wb_name,
                "entries": wb_entries
            }
        }
    }

# ── 导出前校验 ──
def validate(wb_cache):
    """导出前自检，不通过则拒绝导出。防止全量/精简格式混入、条目数异常。"""
    errors = []

    # 1. 世界书 name 非空
    for wb_name, wb in wb_cache.items():
        if not wb.get('name'):
            errors.append(f'世界书 {wb_name}.json: 缺少顶层 name 字段')

    # 2. 条目数校验
    EXPECTED = {
        '狩灵': 8, '狩灵 全角色': 61, '狩灵 四色音': 12,
        '狩灵 晨昏事务所': 12, '狩灵 沃拉瑟斯': 13,
        '狩灵 花坂家': 11, '狩灵 来生事务所': 12, '狩灵 追猎': 11,
    }
    for wb_name, expected in EXPECTED.items():
        actual = len(wb_cache[wb_name]['entries'])
        if actual != expected:
            errors.append(f'世界书 {wb_name}.json: 条目数 {actual}，预期 {expected}')

    # 3. 关系网文件为精简格式（有 char_persona，无 char_basic_abilities 和 char_dialogue_examples）
    REL_DIR = '创作者文件/导出文件/角色关系网'
    for group in os.listdir(REL_DIR):
        group_dir = os.path.join(REL_DIR, group)
        if not os.path.isdir(group_dir):
            continue
        for fn in os.listdir(group_dir):
            if not fn.endswith('.json'):
                continue
            fpath = os.path.join(group_dir, fn)
            try:
                with open(fpath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            except Exception as e:
                errors.append(f'关系网 {group}/{fn}: JSON 解析失败 — {e}')
                continue
            has_persona = 'char_persona' in data
            has_dialogue = 'char_dialogue_examples' in data
            has_basic = 'char_basic_abilities' in data
            has_gender = 'char_gender' in data
            if has_persona and (has_dialogue or has_basic):
                errors.append(f'关系网 {group}/{fn}: 全量格式（含 dialogue/basic），应为精简格式')
            elif has_gender and not has_persona:
                errors.append(f'关系网 {group}/{fn}: 旧版扁平格式，需迁移为新精简格式')
            elif not has_persona and not has_gender:
                errors.append(f'关系网 {group}/{fn}: 无法识别格式')

    # 4. 关系网全角色目录包含全部角色卡（含阵营角色和散角色），数量校验
    all_dir = os.path.join(REL_DIR, '全角色')
    if os.path.isdir(all_dir):
        all_files = [fn for fn in os.listdir(all_dir) if fn.endswith('.json')]
        if len(all_files) < 50:  # 全角色应有 50+ 文件
            errors.append(f'关系网 全角色/: 仅 {len(all_files)} 文件，预期 50+')

    if errors:
        print(f'校验失败：{len(errors)} 项未通过')
        for e in errors:
            print(f'  ✗ {e}')
        sys.exit(1)
    print('校验通过 ✓')

# ── 主流程 ──
def main():
    wb_cache = load_worldbooks()
    validate(wb_cache)


    now = datetime.now()
    create_date = now.strftime("%m/%d/%Y @%Hh %Mm %Ss %f")[:-3] + "ms"

    exported, missing = [], []

    for root, dirs, files in os.walk('角色卡'):
        for fn in files:
            if not fn.endswith('.json') or fn.endswith('_zh.json'):
                continue
            fpath = os.path.join(root, fn)
            card_name = os.path.splitext(fn)[0]
            dir_path = os.path.dirname(fpath)

            # 读取 JSON（任意结构，不要求 char_name 字段）
            try:
                with open(fpath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            except Exception:
                continue

            char_name = data.get('char_name', card_name)
            wb_name = assign_worldbook(card_name, char_name)

            # 配套文件：card_name（文件名 stem），非 char_name
            opening = os.path.join(dir_path, f'{card_name}开场白.md')
            intro = os.path.join(dir_path, f'{card_name}简介.md')
            base_png = os.path.join(BASE_PNG_DIR, f'{card_name}.png')

            if not (os.path.exists(opening) and os.path.exists(intro) and os.path.exists(base_png)):
                miss = []
                if not os.path.exists(base_png): miss.append('底图')
                if not os.path.exists(opening): miss.append('开场白')
                if not os.path.exists(intro): miss.append('简介')
                missing.append((card_name, miss))
                continue

            with open(opening, 'r', encoding='utf-8') as f:
                first_mes = f.read().strip()
            with open(intro, 'r', encoding='utf-8') as f:
                intro_text = f.read().strip()

            desc_str = json.dumps(data, indent=2, ensure_ascii=False).replace('\n', '\r\n')
            first_mes_rn = first_mes.replace('\n', '\r\n')
            intro_rn = intro_text.replace('\n', '\r\n')

            card = build_card(card_name, desc_str, first_mes_rn, intro_rn,
                             wb_name, wb_cache[wb_name]['entries'], create_date)
            compact = json.dumps(card, separators=(',', ':'), ensure_ascii=False)

            out_path = os.path.join(EXPORT_DIR, f'{card_name}.png')
            embed_chara_png(base_png, compact.encode('utf-8'), out_path)
            exported.append((card_name, wb_name, len(wb_cache[wb_name]['entries'])))

    # ── 报告 ──
    print(f"导出完成：{len(exported)} 张")
    for card_name, wb_name, e in exported:
        print(f"  ✓ {card_name:20s} → {wb_name} ({e} entries)")
    if missing:
        print(f"\n缺失 {len(missing)} 张：")
        for name, miss in missing:
            print(f"  ✗ {name}: 缺 {', '.join(miss)}")

if __name__ == '__main__':
    main()
