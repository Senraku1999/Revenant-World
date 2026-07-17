// ── Token 计数封装（js-tiktoken o200k_base）──

import { Violation, BudgetRange } from './types';
import { findCharacterCardJsonFiles, findOpeningMdFiles } from './file-scanner';
import * as fs from 'fs';
import * as path from 'path';

type TiktokenEncoder = { encode: (text: string) => number[] };
let _encoding: TiktokenEncoder | null = null;

/** 懒加载 o200k_base 编码器 */
async function getEncoding(): Promise<TiktokenEncoder> {
  if (!_encoding) {
    const { getEncoding: tkGetEncoding } = await import('js-tiktoken');
    _encoding = tkGetEncoding('o200k_base') as TiktokenEncoder;
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

/** 计算文本 token 数 */
export function countTokens(text: string): number {
  return getEncodingSync().encode(text).length;
}

// ── 八段式预算 ──

export const SEG_NAMES = ['外观', '概述', '性格', '经历', '基础能力', '特殊能力', '角色关系', '对话示例', '总计'];

export const BUDGET: Record<string, BudgetRange> = {
  '外观': { lo: 50, hi: 200 },
  '概述': { lo: 0, hi: 150 },
  '性格': { lo: 50, hi: 150 },
  '经历': { lo: 50, hi: 250 },
  '基础能力': { lo: 0, hi: 150 },
  '特殊能力': { lo: 0, hi: 150 },
  '角色关系': { lo: 0, hi: 300 },
  '对话示例': { lo: 150, hi: 350 },
  '总计': { lo: 550, hi: 1050 },
};

/** 将 JSON 数据拆分为八段并返回各段 token + 总计 */
export function segmentTokens(data: Record<string, unknown>): number[] {
  const persona = (data.char_persona || {}) as Record<string, unknown>;
  const appearance = (persona.appearance || {}) as Record<string, unknown>;

  // ① 外观
  const seg1: Record<string, unknown> = {};
  for (const k of ['gender', 'age']) {
    if (persona[k] !== undefined) seg1[k] = persona[k];
  }
  for (const k of ['height', 'weight', 'hair', 'face', 'clothing', 'weapon']) {
    if (appearance[k] !== undefined) seg1[k] = appearance[k];
  }
  const t1 = countTokens(JSON.stringify(seg1));

  // ② 概述
  const seg2 = { char_description: data.char_description || {} };
  const t2 = countTokens(JSON.stringify(seg2));

  // ③ 性格
  const seg3 = { char_personality: data.char_personality || {} };
  const t3 = countTokens(JSON.stringify(seg3));

  // ④ 经历
  const seg4 = { char_background: data.char_background || {} };
  const t4 = countTokens(JSON.stringify(seg4));

  // ⑤ 基础能力
  const seg5 = { char_basic_abilities: data.char_basic_abilities || {} };
  const t5 = countTokens(JSON.stringify(seg5));

  // ⑥ 特殊能力
  const seg6 = { char_special_abilities: data.char_special_abilities || {} };
  const t6 = countTokens(JSON.stringify(seg6));

  // ⑦ 角色关系
  const seg7 = { char_relationships: data.char_relationships || {} };
  const t7 = countTokens(JSON.stringify(seg7));

  // ⑧ 对话示例
  const seg8 = { char_dialogue_examples: data.char_dialogue_examples || [] };
  const t8 = countTokens(JSON.stringify(seg8));

  const total = t1 + t2 + t3 + t4 + t5 + t6 + t7 + t8;
  return [t1, t2, t3, t4, t5, t6, t7, t8, total];
}

/** 扫描角色卡 JSON Token 预算 */
export async function checkTokenBudgets(): Promise<Violation[]> {
  await initTokenizer();
  const violations: Violation[] = [];
  const projectRoot = process.cwd();
  const jsonFiles = findCharacterCardJsonFiles(projectRoot);

  for (const f of jsonFiles) {
    const data = JSON.parse(fs.readFileSync(f, 'utf-8'));
    const vals = segmentTokens(data);
    const name = path.basename(f);

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
  }
  return violations;
}

/** 扫描开场白 Token 数（区间 600-800） */
export async function checkOpeningTokenCounts(): Promise<Violation[]> {
  await initTokenizer();
  const violations: Violation[] = [];
  const projectRoot = process.cwd();
  const openingFiles = findOpeningMdFiles(projectRoot);

  for (const f of openingFiles) {
    const content = fs.readFileSync(f, 'utf-8');
    const tokens = countTokens(content);
    const name = path.basename(f);

    if (tokens > 800) {
      violations.push({
        file: name,
        line: 0,
        symbol: 'Token OVER',
        original: `${tokens}`,
        suggestion: `开场白超过 800 token: ${tokens}`,
        confidence: '高',
        reason: '开场白 Token 上限 800',
      });
    } else if (tokens < 600) {
      violations.push({
        file: name,
        line: 0,
        symbol: 'Token UNDER',
        original: `${tokens}`,
        suggestion: `开场白低于 600 token: ${tokens}`,
        confidence: '高',
        reason: '开场白 Token 下限 600',
      });
    }
  }
  return violations;
}
