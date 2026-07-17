// ── 核心工具函数 ──

import * as path from 'path';
import * as fs from 'fs';
import { Sentence, QuoteRange } from './types';
import { CJK_CHAR, MD_TEMPLATE_LABELS } from './regex';

/** 获取项目根目录（向上查找 CLAUDE.md 或 package.json） */
export function getProjectRoot(scriptDir: string): string {
  let dir = scriptDir;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'CLAUDE.md')) || fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return scriptDir; // fallback
}

/** 切换到项目根目录 */
export function chdirProjectRoot(scriptDir: string): void {
  process.chdir(getProjectRoot(scriptDir));
}

/** 设置 stdout 编码为 UTF-8 */
export function ensureUtf8(): void {
  if (process.stdout.setDefaultEncoding) {
    process.stdout.setDefaultEncoding('utf-8');
  }
}

/** 判断字符串是否主要为中文内容 */
export function isChineseLine(text: string): boolean {
  const stripped = text.trim();
  if (!stripped) return false;
  if (stripped.startsWith('```')) return false;
  if (/^https?:\/\//.test(stripped)) return false;
  if (!CJK_CHAR.test(stripped)) return false;
  return true;
}

/** 判断是否为代码块、表格行或纯结构标记 */
export function isCodeOrTableLine(text: string): boolean {
  const stripped = text.trim();
  if (!stripped) return true;
  if (stripped.startsWith('```')) return true;
  if (stripped.startsWith('|') && stripped.endsWith('|') && stripped.split('|').length >= 3 && !stripped.includes('---')) return true;
  if (/^[\-*]\s/.test(stripped)) return true;
  if (/^#{1,6}\s/.test(stripped)) return true;
  if (stripped.startsWith('---')) return true;
  if (stripped.startsWith('> ')) return true;
  return false;
}

/** 将文本按句子分割 */
export function extractSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  let currentStart = 0;
  for (let i = 0; i < text.length; i++) {
    if ('。！？!?\n'.includes(text[i])) {
      const sent = text.substring(currentStart, i + 1).trim();
      if (sent) {
        sentences.push({ text: sent, start: currentStart, end: i + 1 });
      }
      currentStart = i + 1;
    }
  }
  if (currentStart < text.length) {
    const sent = text.substring(currentStart).trim();
    if (sent) {
      sentences.push({ text: sent, start: currentStart, end: text.length });
    }
  }
  return sentences;
}

/** 预扫描全文，返回所有英文直双引号区间 */
export function findQuoteRanges(text: string): QuoteRange[] {
  const ranges: QuoteRange[] = [];
  let i = 0;
  while (i < text.length) {
    const pos = text.indexOf('"', i);
    if (pos === -1) break;
    const endPos = text.indexOf('"', pos + 1);
    if (endPos === -1) break;
    ranges.push([pos, endPos]);
    i = endPos + 1;
  }
  return ranges;
}

/** 检查位置是否在引号区间内 */
export function isInQuoteRange(pos: number, ranges: QuoteRange[]): boolean {
  for (const [start, end] of ranges) {
    if (start < pos && pos < end) return true;
  }
  return false;
}

/** 找到包含给定位置的句子 */
export function findSentenceForPos(sentences: Sentence[], pos: number): Sentence | null {
  for (const s of sentences) {
    if (s.start <= pos && pos < s.end) return s;
  }
  return null;
}

/** 判断一行是否为 MD 简介模板标签 */
export function isMdTemplateLabel(line: string): boolean {
  return MD_TEMPLATE_LABELS.test(line.trim());
}

/** 判断字符是否为 CJK 统一表意文字（码点比较，非字符串比较） */
export function isCjk(ch: string): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return code >= 0x4E00 && code <= 0x9FFF;
}

/** 读取文件，UTF-8 编码 */
export function readFileUtf8(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

/** 写入文件，UTF-8 编码 */
export function writeFileUtf8(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, 'utf-8');
}

/** 读取二进制文件 */
export function readFileBinary(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}

/** 写入二进制文件 */
export function writeFileBinary(filePath: string, data: Buffer): void {
  fs.writeFileSync(filePath, data);
}

/** 递归提取对象中所有中文字符串字段，minLength 过滤短字符串 */
export function extractChineseStrings(obj: unknown, prefix: string = '', minLength: number = 0): Array<[string, string]> {
  const results: Array<[string, string]> = [];
  if (typeof obj === 'string') {
    if (obj.length >= minLength && CJK_CHAR.test(obj)) {
      results.push([prefix, obj]);
    }
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      results.push(...extractChineseStrings(obj[i], `${prefix}[${i}]`, minLength));
    }
  } else if (obj !== null && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      results.push(...extractChineseStrings(value, fieldPath, minLength));
    }
  }
  return results;
}

/** 剥离引号内内容后的文本 */
export function stripQuotedContent(text: string): string {
  return text.replace(/"[\s\S]*?"/g, '');
}

/** 路径规范化（正斜杠） */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}
