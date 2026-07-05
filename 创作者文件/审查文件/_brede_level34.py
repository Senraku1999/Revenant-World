import sys
sys.stdout = sys.stderr = open('brede_level34_output.txt', 'w', encoding='utf-8')
import re
import os

BASE = r"D:\File\AiJunkyard\dzmm\狩灵世界观\游魂角色卡\布雷德"

files = {
    '开场白': os.path.join(BASE, '布雷德开场白.md'),
    '简介': os.path.join(BASE, '布雷德简介.md'),
    '中文JSON': os.path.join(BASE, '布雷德_zh.json'),
    '英文JSON': os.path.join(BASE, '布雷德.json'),
}

print("=" * 80)
print("  三级审查：逐字标点扫描")
print("=" * 80)

for label, path in files.items():
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    lines = content.split('\n')

    issues = []

    for i, line in enumerate(lines, 1):
        # 1. 检查非 "" 引号（单引号、其他双引号字符）
        # 合法的：中文双引号 ""（U+201C, U+201D）
        illegal_quotes = []
        # Check for 单引号
        if "'" in line or "'" in line or "'" in line:
            illegal_quotes.append(f"单引号")
        # Check for other double-quote variants (not the standard "")
        # We look for " which is not part of JSON structure in MD files
        if label in ('开场白', '简介'):
            # In MD, any " (U+0022) is suspicious
            if '"' in line:
                illegal_quotes.append(f'英文直双引号 \\"')

        if illegal_quotes:
            issues.append(f"  [L{i}] 非法引号: {', '.join(illegal_quotes)} | {line.strip()[:60]}")

        # 2. 检查叙述中的 ……（仅在 MD 文件中）
        if label in ('开场白', '简介'):
            if '……' in line:
                # 排除在 "" 内的
                outside_quotes = re.sub(r'“[^”]*”', '', line)
                if '……' in outside_quotes:
                    issues.append(f"  [L{i}] 叙述中有省略号 …… | {line.strip()[:60]}")

        # 3. 检查 ... (英文省略号)
        if '...' in line:
            issues.append(f"  [L{i}] 英文省略号 ... | {line.strip()[:60]}")

        # 4. 检查 Markdown 装饰符
        for md_char in ['**', '__', '~~', '==']:
            if md_char in line:
                issues.append(f"  [L{i}] Markdown 装饰符 {md_char} | {line.strip()[:60]}")

        # 5. 检查星号包裹动作 *动作*
        if re.search(r'(?<!\*)\*[^*\n]+\*(?!\*)', line) and label in ('开场白', '简介'):
            # But exclude JSON where * doesn't matter
            issues.append(f"  [L{i}] 星号包裹 | {line.strip()[:60]}")

    if issues:
        print(f"\n--- {label} ---")
        for iss in issues:
            print(iss)
    else:
        print(f"\n--- {label}: 零问题 ---")

print("\n" + "=" * 80)
print("  四级审查：碎片短句扫描（≤5字独立句）")
print("=" * 80)

# Only scan MD files for fragment sentences
for label in ['开场白', '简介']:
    path = files[label]
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split by Chinese sentence-ending punctuation to find standalone sentences
    # Remove JSON-like content, dialogue quotes
    # Find all sentences: split by 。！？
    sentences = re.split(r'(?<=[。！？])', content)

    fragments = []
    for sent in sentences:
        sent = sent.strip()
        if not sent:
            continue
        # Count Chinese chars + Chinese punctuation (non-space, non-newline)
        # For fragment detection: count CJK chars and Chinese punctuation
        cjk_count = len(re.findall(r'[一-鿿　-〿＀-￯]', sent))
        # Also count ASCII alphanumeric that's part of the text
        # Basically count all non-space, non-newline characters
        text_chars = re.sub(r'\s', '', sent)
        char_count = len(text_chars)

        if char_count <= 5:
            fragments.append((char_count, sent[:80]))

    if fragments:
        print(f"\n--- {label} ---")
        for count, sent in fragments:
            print(f"  [{count}字] {sent}")
    else:
        print(f"\n--- {label}: 零碎片短句 ---")

print("\n完成。")
