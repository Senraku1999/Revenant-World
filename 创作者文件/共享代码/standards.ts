// ── 国家标准数据加载与检查 ──

import * as path from 'path';
import * as fs from 'fs';
import { Violation, ProperNounEntry } from './types';
import { isCjk } from './utils';

// ── 言语动词白名单 ──
export const SPEECH_VERBS = new Set([
  // 单字
  '说', '道', '问', '喊', '叫', '答', '骂', '曰',
  '讲', '谈', '聊', '补', '接', '应', '叹', '念',
  // 双字组合
  '问道', '说道', '喊道', '叫道', '答道', '骂道', '笑道', '吼道',
  '回道', '嚷道', '答曰', '讲道', '叹道', '念道', '应道',
  // 多字言语动词
  '嘀咕', '嘟囔', '吩咐', '命令', '解释', '质问', '反驳', '补充',
  '追问', '反问', '宣布', '插嘴', '插话', '开口', '接话', '抢白',
]);

/** 检查词（或其后缀）是否在言语动词白名单中 */
export function isSpeechVerb(word: string): boolean {
  // 剥离体标记
  for (const particle of ['了', '着', '过']) {
    if (word.endsWith(particle) && word.length > 1) {
      word = word.slice(0, -1);
      break;
    }
  }
  for (let i = 0; i < word.length; i++) {
    if (SPEECH_VERBS.has(word.slice(i))) return true;
  }
  return false;
}

// ── 合法性枚举 ──
export const VALID_IDENTITY = new Set(['狩灵', '游魂', '罪灵', '恶灵', '恶魔', '妖怪', '扭曲', '普通人类']);
export const VALID_RANK = new Set([
  '1阶', '2阶', '3阶', '4阶', '5阶', 'None',
  '传闻级', '怪谈级', '梦魇级', '灾厄级', '终焉级',
]);

// ── 异形词加载 ──

/** 从 GF_1001_2001_异形词整理表.md 解析非推荐→推荐映射 */
export function loadVariantForms(scriptDir: string): Map<string, string> {
  const mapping = new Map<string, string>();
  const variantPath = path.join(scriptDir, 'GF_1001_2001_异形词整理表.md');
  if (!fs.existsSync(variantPath)) return mapping;

  const content = fs.readFileSync(variantPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('>') || trimmed.startsWith('---')) continue;
    if (!trimmed.includes('——')) continue;

    const [recommended, variantsStr] = trimmed.split('——', 2);
    const rec = recommended.trim();
    for (const variant of variantsStr.split('、')) {
      const v = variant.trim();
      if (v) mapping.set(v, rec);
    }
  }
  return mapping;
}

// ── 专有名词表加载 ──

/** 从 专有名词全称表.md 解析简称→(全称, 匹配模式)映射 */
export function loadProperNounTable(projectRoot: string): Map<string, ProperNounEntry> {
  const mapping = new Map<string, ProperNounEntry>();
  const tablePath = path.join(projectRoot, '创作者文件', '创作文件', '专有名词全称表.md');
  if (!fs.existsSync(tablePath)) return mapping;

  const content = fs.readFileSync(tablePath, 'utf-8');
  let inTable = false;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.includes('禁止') && trimmed.includes('强制')) {
      inTable = true;
      continue;
    }
    if (inTable) {
      if (!trimmed.startsWith('|')) { inTable = false; continue; }
      const parts = trimmed.split('|').map(s => s.trim());
      if (parts.length >= 5 && parts[1] && parts[2]) {
        const forbidden = parts[1];
        const full = parts[2];
        const modeRaw = parts[3] || '子串';
        const mode: '子串' | '独立词' = modeRaw === '独立词' ? '独立词' : '子串';
        if (forbidden === '禁止的简称/变体' || forbidden === '------' || forbidden === '规则') continue;
        mapping.set(forbidden, { full, mode });
      }
    }
  }
  return mapping;
}

// ── 术语缩写检测 ──

/** 递归检测字段值中的术语简写 */
export function checkAbbreviation(
  value: unknown,
  path: string,
  properNounMap: Map<string, ProperNounEntry>,
  charName: string
): Violation[] {
  const errs: Violation[] = [];
  if (typeof value === 'string') {
    for (const [forbidden, entry] of properNounMap) {
      if (!value.includes(forbidden)) continue;
      if (value.includes(entry.full)) continue;

      if (entry.mode === '独立词') {
        let hit = false;
        const escaped = forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(escaped, 'g');
        let m: RegExpExecArray | null;
        while ((m = re.exec(value)) !== null) {
          const start = m.index;
          const end = start + forbidden.length;
          const prevChar = start > 0 ? value[start - 1] : '';
          const nextChar = end < value.length ? value[end] : '';

          if (prevChar && isCjk(prevChar)) continue;
          if (nextChar && isCjk(nextChar)) continue;

          const ctx = value.substring(Math.max(0, start - 8), Math.min(value.length, end + 8));
          errs.push({
            file: charName,
            line: 0,
            symbol: '术语简写',
            original: `...${ctx}...`,
            suggestion: `"${forbidden}" 应为 "${entry.full}"`,
            confidence: '高',
            reason: `独立词模式，上下文匹配`,
            field: path,
          });
          hit = true;
        }
        if (!hit) continue;
      } else {
        // 子串模式
        const idx = value.indexOf(forbidden);
        const ctx = value.substring(Math.max(0, idx - 8), Math.min(value.length, idx + forbidden.length + 8));
        errs.push({
          file: charName,
          line: 0,
          symbol: '术语简写',
          original: `...${ctx}...`,
          suggestion: `"${forbidden}" 应为 "${entry.full}"`,
          confidence: '高',
          reason: '子串模式',
          field: path,
        });
      }
    }
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      errs.push(...checkAbbreviation(value[i], path ? `${path}[${i}]` : `[${i}]`, properNounMap, charName));
    }
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      errs.push(...checkAbbreviation(v, path ? `${path}.${k}` : k, properNounMap, charName));
    }
  }
  return errs;
}

// ── 评级格式化 ──

/** 评级纯中文格式转换（游魂 JSON "None" ↔ 简介 "无"） */
export function formatRankForIntro(jsonRank: string): string {
  if (jsonRank === 'None') return '无';
  return jsonRank;
}
