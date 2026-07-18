/**
 * 管线三：PNG 导出
 * ================
 * 角色卡三件套 + 底图 + 世界书 → SillyTavern chara_card_v2 PNG
 *
 * 前置：管线一（导出关系网）+ 管线二（导出世界书）
 * 用法：npx tsx 创作者文件/导出文件/导出角色卡.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { chdirProjectRoot, ensureUtf8, readFileUtf8 } from '../共享代码/utils';
import { embedCharaPng } from '../共享代码/png-embed';
import { WorldBookAssignments, CharacterCard } from '../共享代码/types';

ensureUtf8();
chdirProjectRoot(__dirname);
const PROJECT_ROOT = process.cwd();

// ⚠️ 这是【导出分配】——控制 PNG 导出时每张卡嵌入哪本世界书。
// 与【构建分配】(导出世界书.ts 的 WORLDBOOK_BUILD) 是两条独立管线。
const PNG_EXPORT_ASSIGN: WorldBookAssignments = {
  '狩灵 全角色': ['新宿站', '协会1科', '四色音 · 闪耀舞台'],
  '狩灵 四色音': ['心音', '花音', '弦音', '铃音'],
  '狩灵 晨昏事务所': ['贝尔金', '贝拉', '弗洛伦', '菲利普'],
  '狩灵 沃拉瑟斯': ['菲利普 · 钢翼', '沃拉瑟斯'],
  '狩灵 花坂家': ['薰', '千乐', '百合子', '花坂家宴'],
  '狩灵 来生事务所': ['爱', '星流', '雨', '天'],
  '狩灵 追猎': ['慎', '劫', '烬'],
};

const TAGS = ['狩灵', '大世界', '世界观', '现代', '超自然', '角色扮演', '战斗', 'sfw'];
const WB_DIR = '创作者文件/导出文件/世界书';
const EXPORT_DIR = '导出角色卡';
const BASE_PNG_DIR = '底图';

function loadWorldbooks(): Record<string, { name?: string; entries: unknown[] }> {
  const cache: Record<string, { name?: string; entries: unknown[] }> = {};
  for (const wbName of Object.keys(PNG_EXPORT_ASSIGN)) {
    const wbPath = path.join(WB_DIR, `${wbName}.json`);
    if (fs.existsSync(wbPath)) cache[wbName] = JSON.parse(readFileUtf8(wbPath));
  }
  // 基础世界书
  const basePath = path.join(WB_DIR, '狩灵.json');
  if (fs.existsSync(basePath)) cache['狩灵'] = JSON.parse(readFileUtf8(basePath));
  return cache;
}

function assignWorldbook(cardName: string, charName: string): string {
  let fallback = '狩灵';
  for (const [wbName, names] of Object.entries(PNG_EXPORT_ASSIGN) as Array<[string, string[]]>) {
    if (names.includes(cardName)) return wbName;
    if (fallback === '狩灵' && names.includes(charName)) fallback = wbName;
  }
  return fallback;
}

function buildCard(
  cardName: string, descStr: string, firstMesRn: string, introRn: string,
  wbName: string, wbEntries: unknown[], createDate: string
): CharacterCard {
  return {
    name: `狩灵 · ${cardName}`,
    description: descStr, personality: '', scenario: '',
    first_mes: firstMesRn, mes_example: '', creatorcomment: introRn,
    avatar: 'none', chat: `狩灵 · ${cardName} - ${createDate}`,
    talkativeness: '0.5', fav: false, tags: TAGS,
    spec: 'chara_card_v2', spec_version: '2.0', create_date: createDate,
    data: {
      name: `狩灵 · ${cardName}`, description: descStr,
      personality: '', scenario: '', first_mes: firstMesRn,
      mes_example: '', creator_notes: introRn,
      system_prompt: '', post_history_instructions: '', tags: TAGS,
      creator: '千乐', character_version: '', alternate_greetings: [],
      extensions: { talkativeness: '0.5', fav: false, world: wbName,
        depth_prompt: { prompt: '', depth: 4, role: 'system' } },
      character_book: { name: wbName, entries: wbEntries },
    },
  };
}

function main(): void {
  const wbCache = loadWorldbooks();

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const createDate = `${pad(now.getMonth()+1)}/${pad(now.getDate())}/${now.getFullYear()} @${pad(now.getHours())}h ${pad(now.getMinutes())}m ${pad(now.getSeconds())}s ${String(now.getMilliseconds()).padStart(3,'0')}ms`;

  const exported: Array<[string, string, number]> = [];
  const missing: Array<[string, string[]]> = [];
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.endsWith('_zh.json')) continue;

      const cardName = path.basename(entry.name, '.json');
      const dirPath = path.dirname(full);
      let data: Record<string, unknown>;
      try { data = JSON.parse(readFileUtf8(full)); } catch { continue; }

      const charName = (data.char_name as string) || cardName;
      const wbName = assignWorldbook(cardName, charName);

      const opening = path.join(dirPath, `${cardName}开场白.md`);
      const intro = path.join(dirPath, `${cardName}简介.md`);
      const basePng = path.join(BASE_PNG_DIR, `${cardName}.png`);

      if (!(fs.existsSync(opening) && fs.existsSync(intro) && fs.existsSync(basePng))) {
        const miss: string[] = [];
        if (!fs.existsSync(basePng)) miss.push('底图');
        if (!fs.existsSync(opening)) miss.push('开场白');
        if (!fs.existsSync(intro)) miss.push('简介');
        missing.push([cardName, miss]);
        continue;
      }

      // 输入换行先归一为 LF 再统一转 CRLF，兼容任意来源换行格式
      const descStr = JSON.stringify(data, null, 2).replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n');
      const firstMesRn = readFileUtf8(opening).trim().replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n');
      const introRn = readFileUtf8(intro).trim().replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n');

      const card = buildCard(cardName, descStr, firstMesRn, introRn, wbName, wbCache[wbName].entries, createDate);
      embedCharaPng(basePng, Buffer.from(JSON.stringify(card), 'utf-8'), path.join(EXPORT_DIR, `${cardName}.png`));
      exported.push([cardName, wbName, wbCache[wbName].entries.length]);
    }
  }

  walk('角色卡');

  console.log(`导出完成：${exported.length} 张`);
  for (const [cardName, wbName, e] of exported) {
    console.log(`  ✓ ${cardName.padEnd(20)} → ${wbName} (${e} entries)`);
  }
  if (missing.length > 0) {
    console.log(`\n缺失 ${missing.length} 张：`);
    for (const [name, miss] of missing) {
      console.log(`  ✗ ${name}: 缺 ${miss.join(', ')}`);
    }
  }
}

main();
