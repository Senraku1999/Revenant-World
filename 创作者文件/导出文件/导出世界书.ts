/**
 * 管线二：世界书构建
 * ================
 * world info MD + 角色关系网 + 触发词表 → 成品世界书 JSON
 *
 * 用法：npx tsx 创作者文件/导出文件/build-worldbook.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { chdirProjectRoot, ensureUtf8, readFileUtf8 } from '../共享代码/utils';

ensureUtf8();
chdirProjectRoot(__dirname);
const PROJECT_ROOT = process.cwd();

const WI_DIR = '创作者文件/导出文件/world info';
const REL_DIR = '创作者文件/导出文件/关系网';
const WB_DIR = '创作者文件/导出文件/世界书';
const TAG_FILE = '创作者文件/导出文件/TAG池.md';

// ── 基础规则条目定义 ──
interface BaseEntry {
  id: number; comment: string; constant: boolean;
  insertion_order: number; depth: number; sourceFile: string;
}

const BASE_ENTRIES: BaseEntry[] = [
  { id: 0, comment: '宏观规则',   constant: true,  insertion_order: 100, depth: 4, sourceFile: '宏观规则.md' },
  { id: 8, comment: '世界观',     constant: true,  insertion_order: 99,  depth: 4, sourceFile: '世界观.md' },
  { id: 1, comment: '灵能者',     constant: true,  insertion_order: 98,  depth: 4, sourceFile: '灵能者.md' },
  { id: 3, comment: '评级',       constant: false, insertion_order: 97,  depth: 4, sourceFile: '评级.md' },
  { id: 2, comment: '异常',       constant: false, insertion_order: 96,  depth: 4, sourceFile: '异常.md' },
  { id: 4, comment: '狩灵协会',   constant: false, insertion_order: 95,  depth: 4, sourceFile: '狩灵协会.md' },
  { id: 6, comment: '锈钟',       constant: false, insertion_order: 94,  depth: 4, sourceFile: '锈钟.md' },
  { id: 7, comment: '天丛云剑',   constant: false, insertion_order: 93,  depth: 4, sourceFile: '天丛云剑.md' },
];

// ── 构建分配：角色 → 阵营世界书 ──
const WORLDBOOK_BUILD: Record<string, string[]> = {
  '四色音':     ['心音', '花音', '弦音', '铃音'],
  '晨昏事务所': ['贝尔金', '贝拉', '弗洛伦', '菲利普'],
  '沃拉瑟斯':   ['菲利普 · 钢翼', '沃拉瑟斯'],
  '花坂家':     ['薰', '千乐', '百合子'],
  '来生事务所': ['爱', '星流', '雨', '天'],
  '追猎':       ['慎', '劫', '烬'],
};

// ── 世界书条目类型 ──
interface WbEntry {
  id: number;
  keys: string[];
  secondary_keys: string[];
  comment: string;
  content: string;
  constant: boolean;
  selective: boolean;
  insertion_order: number;
  depth: number;
  position: number;
  use_regex: boolean;
  enabled: boolean;
  extensions: Record<string, never>;
}

// ── 加载基础规则 ──
function loadBaseEntries(tags: Record<string, string[]>): WbEntry[] {
  return BASE_ENTRIES.map((def, i) => ({
    id: def.id,
    keys: def.constant ? [] : (tags[def.comment] || [def.comment]),
    secondary_keys: [],
    comment: def.comment,
    content: readFileUtf8(path.join(WI_DIR, def.sourceFile)),
    constant: def.constant,
    selective: false,
    insertion_order: def.insertion_order,
    depth: def.depth,
    position: i,
    use_regex: false,
    enabled: true,
    extensions: {},
  }));
}

// ── 加载触发词表 ──
function loadTriggerWords(): Record<string, string[]> {
  const tags: Record<string, string[]> = {};
  if (!fs.existsSync(TAG_FILE)) return tags;
  const content = readFileUtf8(TAG_FILE);
  let currentFaction = '';

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // 阵营标题
    if (trimmed.startsWith('## ')) {
      currentFaction = trimmed.replace('## ', '').trim();
      continue;
    }
    // 表格行
    if (trimmed.startsWith('|') && trimmed.includes('；')) {
      const parts = trimmed.split('|').map(s => s.trim());
      if (parts.length >= 3 && parts[1] && parts[2]) {
        const name = parts[1];
        const tagStr = parts[2];
        const tagList = tagStr.split('；').map(t => t.trim()).filter(t => t);
        tags[name] = tagList;
      }
    }
  }
  return tags;
}

// ── 加载角色条目 ──
function loadCharacterEntries(names: string[], allRelDir: string, tags: Record<string, string[]>): WbEntry[] {
  const entries: WbEntry[] = [];
  let id = 200;

  for (const name of names) {
    const relPath = path.join(allRelDir, `${name}.json`);
    if (!fs.existsSync(relPath)) {
      console.log(`  ⚠ 缺失关系网文件: ${name}`);
      continue;
    }
    const data = JSON.parse(readFileUtf8(relPath));
    entries.push({
      id: id++,
      keys: tags[name] || [name],
      secondary_keys: [],
      comment: name,
      content: JSON.stringify(data, null, 2),
      constant: false,
      selective: false,
      insertion_order: 0,
      depth: 4,
      position: 0,
      use_regex: false,
      enabled: true,
      extensions: {},
    });
  }
  return entries;
}

// ── 写入世界书 ──
function writeWorldbook(wbName: string, base: WbEntry[], chars: WbEntry[]): void {
  if (!fs.existsSync(WB_DIR)) fs.mkdirSync(WB_DIR, { recursive: true });
  const all = [...base, ...chars];
  // 重排 position
  for (let i = 0; i < all.length; i++) all[i].position = i;
  const wb = { name: wbName, entries: all };
  fs.writeFileSync(path.join(WB_DIR, `${wbName}.json`), JSON.stringify(wb, null, 2), 'utf-8');
}

// ── 主入口 ──
function main(): void {
  const tags = loadTriggerWords();
  const base = loadBaseEntries(tags);
  const allRelDir = path.join(REL_DIR, '全角色');

  console.log(`基础规则: ${base.length} 条`);
  console.log(`触发词表: ${Object.keys(tags).length} 名角色`);
  console.log();

  // 狩灵.json — 仅基础规则
  writeWorldbook('狩灵', base, []);
  console.log(`  狩灵: ${base.length} 条`);

  // 狩灵 全角色 — 基础 + 全角色目录所有角色
  if (fs.existsSync(allRelDir)) {
    const allNames = fs.readdirSync(allRelDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
    const allChars = loadCharacterEntries(allNames, allRelDir, tags);
    writeWorldbook('狩灵 全角色', base, allChars);
    console.log(`  狩灵 全角色: ${base.length + allChars.length} 条`);
  }

  // 阵营世界书
  for (const [faction, members] of Object.entries(WORLDBOOK_BUILD)) {
    const chars = loadCharacterEntries(members, allRelDir, tags);
    writeWorldbook(`狩灵 ${faction}`, base, chars);
    console.log(`  狩灵 ${faction}: ${base.length + chars.length} 条`);
  }
}

main();
