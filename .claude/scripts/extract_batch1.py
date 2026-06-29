"""Extract 协会狩灵角色卡 period-to-comma candidates from section 二 only, excluding 开场白."""
import re
from collections import defaultdict

results_path = r"D:\File\AiJunkyard\dzmm\狩灵世界观\.claude\scripts\secondary_punct_results.txt"
output_path = r"D:\File\AiJunkyard\dzmm\狩灵世界观\.claude\scripts\batch1_candidates.txt"

with open(results_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Find section 二、句号应改逗号 — starts at a line with that marker, ends at next section (───)
section_start = None
section_end = None
for i, line in enumerate(lines):
    if "二、句号应改逗号" in line:
        section_start = i
    elif section_start is not None and i > section_start and line.startswith("───"):
        section_end = i
        break

if section_start is None:
    print("ERROR: Could not find section 二")
    exit(1)

print(f"Section 二 starts at line {section_start+1}, ends at line {section_end+1}")
section_lines = lines[section_start:section_end]

# Now extract entries from this section only
# Each entry: starts with "文件:", ends with "---"
entries = []
current = []
for line in section_lines:
    if line.startswith("文件:") and "协会狩灵角色卡" in line and "开场白" not in line:
        current = [line]
    elif current:
        current.append(line)
        if line.strip() == "---":
            entries.append("".join(current))
            current = []

print(f"Extracted {len(entries)} entries from section 二")

# Group by character
chars = defaultdict(list)
for c in entries:
    m = re.search(r"文件: 协会狩灵角色卡\\(.+?)\\(.+?)$", c, re.MULTILINE)
    if m:
        char_name = m.group(1)
        chars[char_name].append(c)

print(f"Unique characters: {len(chars)}")
for name in sorted(chars.keys()):
    print(f"  {name}: {len(chars[name])}")

# Write structured output
with open(output_path, "w", encoding="utf-8") as out:
    out.write("=" * 80 + "\n")
    out.write("协会狩灵角色卡 · 句号→逗号候选（排除开场白，仅section二）\n")
    out.write(f"共 {len(entries)} 条候选，{len(chars)} 个角色\n")
    out.write("=" * 80 + "\n\n")

    for idx, entry in enumerate(entries, 1):
        out.write(f"--- 候选 #{idx} ---\n")
        out.write(entry + "\n\n")

print(f"\nWritten to: {output_path}")
