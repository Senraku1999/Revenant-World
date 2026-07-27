// ── Token 计数封装（js-tiktoken cl100k_base）──

import { Violation, BudgetRange } from './types';
import { findCharacterCardJsonFiles, findOpeningMdFiles } from './file-scanner';
import * as fs from 'fs';
import * as path from 'path';

type TiktokenEncoder = { encode: (text: string) => number[] };
let _encoding: TiktokenEncoder | null = null;

/** 懒加载 cl100k_base 编码器 */
async function getEncoding(): Promise<TiktokenEncoder> {
  if (!_encoding) {
    const { getEncoding: tkGetEncoding } = await import('js-tiktoken');
    _encoding = tkGetEncoding('cl100k_base') as TiktokenEncoder;
  }
  return _encoding;
}

/** 同步获取编码器（已初始化后可用） */
function getEncodingSync(): TiktokenEncoder {
  if (!_encoding) throw new Error('Token encoding not initialized. Call initTokenizer() first.');
  return _encoding;
}

/** 初始化分词器 */
export async function initTokenizer(): Promise<void> {
  await getEncoding();
}

/** 计算文本 token 数（计数前归一化：剥除 BOM，换行统一为 \r\n，与 ST 导出产物口径一致） */
export function countTokens(text: string): number {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n');
  return getEncodingSync().encode(normalized).length;
}

// ── 十段式预算（2026-07-28 中文 JSON 校准，cl100k_base）──

export const SEG_NAMES = ['外观', '武器', '概述', '性格', '经历', '基础能力', '特殊能力', '角色关系', '对话示例', '总计'];

// 角色关系不设段级预算（仅单条上限），故不在 BUDGET 中
// 十段分部预算（中文 cl100k_base，2026-07-31 调整为原值 +20% 适配中文编码效率）
export const BUDGET: Record<string, BudgetRange> = {
  '外观': { lo: 50, hi: 180 },
  '武器': { lo: 0, hi: 125 },
  '概述': { lo: 0, hi: 120 },
  '性格': { lo: 50, hi: 180 },
  '经历': { lo: 50, hi: 300 },
  '基础能力': { lo: 0, hi: 180 },
  '对话示例': { lo: 200, hi: 480 },
  '总计': { lo: 700, hi: 1500 },
};

// 武器哨兵值
export const WEAPON_NONE = '无。';
export const WEAPON_NONE_LIKE = /^\s*(none|无)\s*[.。]?\s*$/i;

// 关系单条上限（单键对象序列化成本，含键名）
export const REL_ENTRY_MAX = 180;

// 特殊能力单条上限（单键对象序列化成本，含键名）
export const SA_ENTRY_MAX = 180;

/**
 * 将 JSON 数据拆分为十段并返回各段 token + 总计（共 11 个值，顺序同 SEG_NAMES）。
 * 包装口径与 2026-07-17 基线一致：外观为扁平对象；武器/概述/战斗风格为单键对象；
 * 性格/经历/基础能力/特殊能力/角色关系为单字符键包装；对话示例为裸数组。
 */
export function segmentTokens(data: Record<string, unknown>): number[] {
  const persona = (data.char_persona || {}) as Record<string, unknown>;
  const appearance = (persona.appearance || {}) as Record<string, unknown>;
  const desc = (data.char_description || {}) as Record<string, unknown>;

  // ① 外观（含 features，不含武器）
  const seg1: Record<string, unknown> = {};
  for (const k of ['gender', 'age']) {
    if (persona[k] !== undefined) seg1[k] = persona[k];
  }
  for (const k of ['height', 'weight', 'hair', 'face', 'features', 'clothing']) {
    if (appearance[k] !== undefined) seg1[k] = appearance[k];
  }
  const t1 = countTokens(JSON.stringify(seg1));

  // ② 武器
  const t2 = countTokens(JSON.stringify({ weapon: appearance.weapon ?? '' }));

  // ③ 概述
  const t3 = countTokens(JSON.stringify({ overview: desc.overview ?? '' }));

  // ④ 性格
  const t4 = countTokens(JSON.stringify({ a: data.char_personality || {} }));

  // ⑤ 经历
  const t5 = countTokens(JSON.stringify({ a: { origin: desc.origin ?? '', current_mission: desc.current_mission ?? '' } }));

  // ⑥ 基础能力
  const t6 = countTokens(JSON.stringify({ a: data.char_basic_abilities || {} }));

  // ⑦ 特殊能力
  const t7 = countTokens(JSON.stringify({ a: data.char_special_abilities || {} }));

  // ⑧ 角色关系
  const t8 = countTokens(JSON.stringify({ a: data.char_relationships || {} }));

  // ⑨ 对话示例
  const t9 = countTokens(JSON.stringify(data.char_dialogue_examples || []));

  const total = t1 + t2 + t3 + t4 + t5 + t6 + t7 + t9; // 不含⑧角色关系
  return [t1, t2, t3, t4, t5, t6, t7, t8, t9, total];
}

/** 扫描角色卡 JSON Token 预算（段级区间 + 双态哨兵 + 关系单条上限） */
export async function checkTokenBudgets(): Promise<Violation[]> {
  await initTokenizer();
  const violations: Violation[] = [];
  const projectRoot = process.cwd();
  const jsonFiles = findCharacterCardJsonFiles(projectRoot);

  for (const f of jsonFiles) {
    const data = JSON.parse(fs.readFileSync(f, 'utf-8'));
    const vals = segmentTokens(data);
    const name = path.basename(f);

    // 段级区间
    for (let i = 0; i < SEG_NAMES.length; i++) {
      const seg = SEG_NAMES[i];
      const val = vals[i];
      const budget = BUDGET[seg];
      if (!budget) continue;

      if (val < budget.lo) {
        violations.push({
          file: name,
          line: 0,
          symbol: 'Token偏低',
          original: `${seg}: ${val}`,
          suggestion: `偏低 ${val} (下限${budget.lo})`,
          confidence: '高',
          reason: `${seg} token 低于预算下限`,
        });
      } else if (val > budget.hi) {
        violations.push({
          file: name,
          line: 0,
          symbol: 'Token超标',
          original: `${seg}: ${val}`,
          suggestion: `超标 ${val} (上限${budget.hi})`,
          confidence: '高',
          reason: `${seg} token 超出预算上限`,
        });
      }
    }

    // 武器哨兵：形似哨兵但写法不精确的值视为格式错误
    const appearance = (data.char_persona?.appearance || {}) as Record<string, unknown>;
    const weapon = String(appearance.weapon ?? '');
    if (WEAPON_NONE_LIKE.test(weapon) && weapon !== WEAPON_NONE) {
      violations.push({
        file: name, line: 0, symbol: '哨兵格式',
        original: `weapon: ${weapon}`,
        suggestion: `应精确为 ${WEAPON_NONE}`,
        confidence: '高', reason: '无实体武器哨兵值写法不精确',
      });
    }

    // 关系单条上限
    const rels = (data.char_relationships || {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(rels)) {
      const entry = countTokens(JSON.stringify({ [k]: v }));
      if (entry > REL_ENTRY_MAX) {
        violations.push({
          file: name, line: 0, symbol: 'Token超标',
          original: `关系[${k}]: ${entry}`,
          suggestion: `超标 ${entry} (单条上限${REL_ENTRY_MAX})`,
          confidence: '高', reason: '关系单条 token 超出上限',
        });
      }
    }

    // 特殊能力单条上限（多回路角色逐条检查）
    const sas = (data.char_special_abilities || {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(sas)) {
      const entry = countTokens(JSON.stringify({ [k]: v }));
      if (entry > SA_ENTRY_MAX) {
        violations.push({
          file: name, line: 0, symbol: 'Token超标',
          original: `特殊能力[${k}]: ${entry}`,
          suggestion: `超标 ${entry} (单条上限${SA_ENTRY_MAX})`,
          confidence: '高', reason: '特殊能力单条 token 超出上限',
        });
      }
    }
  }
  return violations;
}

/** 扫描开场白 Token 数（区间 900-1100） */
export async function checkOpeningTokenCounts(): Promise<Violation[]> {
  await initTokenizer();
  const violations: Violation[] = [];
  const projectRoot = process.cwd();
  const openingFiles = findOpeningMdFiles(projectRoot);

  for (const f of openingFiles) {
    // 与导出管线同口径：导出时 .trim() 后嵌入，计数亦按 trim 后文本
    const content = fs.readFileSync(f, 'utf-8').trim();
    const tokens = countTokens(content);
    const name = path.basename(f);

    if (tokens > 1100) {
      violations.push({
        file: name,
        line: 0,
        symbol: 'Token OVER',
        original: `${tokens}`,
        suggestion: `开场白超过 1100 token: ${tokens}`,
        confidence: '高',
        reason: '开场白 Token 上限 1100',
      });
    } else if (tokens < 900) {
      violations.push({
        file: name,
        line: 0,
        symbol: 'Token UNDER',
        original: `${tokens}`,
        suggestion: `开场白低于 900 token: ${tokens}`,
        confidence: '高',
        reason: '开场白 Token 下限 900',
      });
    }
  }
  return violations;
}
