/**
 * 管线一：关系网同步
 * ================
 * 从角色卡 JSON 提取精简字段 → 写入 关系网/{全角色,阵营}/
 *
 * 用法：npx tsx 创作者文件/导出文件/导出关系网.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { chdirProjectRoot, ensureUtf8, readFileUtf8 } from '../共享代码/utils';

ensureUtf8();
chdirProjectRoot(__dirname);
const PROJECT_ROOT = process.cwd();

const REL_DIR = '创作者文件/导出文件/关系网';
const CARD_DIR = '角色卡';

// ── 构建分配：哪些角色归入哪个阵营目录 ──
const FACTION_MEMBERS: Record<string, string[]> = {
  '四色音':     ['心音', '花音', '弦音', '铃音'],
  '晨昏事务所': ['贝尔金', '贝拉', '弗洛伦', '菲利普'],
  '沃拉瑟斯':   ['贝尔金', '贝拉', '弗洛伦', '菲利普 · 钢翼', '沃拉瑟斯'],
  '花坂家':     ['薰', '千乐', '百合子'],
  '来生事务所': ['爱', '星流', '雨', '天'],
  '追猎':       ['慎', '劫', '烬'],
};

// ── 精简字段名列表 ──
const KEEP_FIELDS = [
  'char_name', 'char_fullname', 'char_alias',
  'char_identity', 'char_rank', 'char_faction', 'char_status',
  'char_persona', 'char_background',
  'char_special_abilities', 'char_relationships',
];

function stripToRelationFormat(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of KEEP_FIELDS) {
    if (key in data) out[key] = data[key];
  }
  return out;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function main(): void {
  const allDir = path.join(REL_DIR, '全角色');
  ensureDir(allDir);
  for (const faction of Object.keys(FACTION_MEMBERS)) {
    ensureDir(path.join(REL_DIR, faction));
  }

  let synced = 0;
  const skipped: string[] = [];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const norm = full.replace(/\\/g, '/');
        if (norm.includes('事件卡') || norm.includes('世界观卡')) continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('_zh.json')) {
        const cardName = path.basename(entry.name, '.json');
        let data: Record<string, unknown>;
        try { data = JSON.parse(readFileUtf8(full)); } catch { skipped.push(cardName); continue; }

        const stripped = stripToRelationFormat(data);
        const json = JSON.stringify(stripped, null, 2) + '\n';

        // 全角色目录（所有角色都写）
        fs.writeFileSync(path.join(allDir, `${cardName}.json`), json, 'utf-8');

        // 阵营目录（按构建分配表）
        for (const [faction, members] of Object.entries(FACTION_MEMBERS)) {
          if (members.includes(cardName)) {
            fs.writeFileSync(path.join(REL_DIR, faction, `${cardName}.json`), json, 'utf-8');
          }
        }

        synced++;
      }
    }
  }

  walk(CARD_DIR);

  console.log(`同步完成：${synced} 张`);
  if (skipped.length) console.log(`跳过 ${skipped.length}：${skipped.join(', ')}`);

  // 报告各目录文件数
  console.log();
  for (const d of fs.readdirSync(REL_DIR)) {
    const dp = path.join(REL_DIR, d);
    if (fs.statSync(dp).isDirectory()) {
      const count = fs.readdirSync(dp).filter(f => f.endsWith('.json')).length;
      console.log(`  ${d}: ${count}`);
    }
  }
}

main();
