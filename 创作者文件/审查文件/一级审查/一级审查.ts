/**
 * GB/T 15834—2011 一级国标标点审查脚本
 * 仅检查国标原文规则，不涉及项目追加约束（""引号、——……仅限对话等）。
 *
 * 检查项目：
 * 1. 句末点号（。？！）使用是否合规
 * 2. 句内点号（，、；：）使用是否合规
 * 3. 引号、括号、书名号配对是否完整
 * 4. 标点符号位置和书写形式是否规范
 * 5. 异形词扫描（GF 1001—2001）
 * 6. 数字用法扫描（GB/T 15835，appearance + 基础信息区）
 * 7. 非言语动词后冒号接引号检测
 */

import * as fs from 'fs';
import * as path from 'path';
import { isChineseLine, isCodeOrTableLine, readFileUtf8, extractChineseStrings } from '../../共享代码/utils';
import { isSpeechVerb, loadVariantForms } from '../../共享代码/standards';
import { findMdJsonFiles } from '../../共享代码/file-scanner';
import {
  CHINESE_PERIOD_END, ENGLISH_COMMA_ZH, ENGLISH_SEMICOLON_ZH, ENGLISH_COLON_ZH,
  EXCLAM_EXCESS, QUESTION_EXCESS, ELLIPSIS_DOTS, DOUBLE_DOT, SINGLE_EM_DASH,
  EM_DASH_SPACED, ELLIPSIS_SPACED, PUNCT_START_OF_LINE, QUOTE_END_OF_LINE,
  BULLET_AS_INTERPUNCT, NON_SPEECH_COLON_QUOTE, HEIGHT_WEIGHT_FIELDS, HEIGHT_WEIGHT_FORMAT,
  CJK_CHAR
} from '../../共享代码/regex';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

const EXCLUDE_DIRS = new Set(['.git', '.claude', '__pycache__', 'node_modules', '.obsidian']);
const EXCLUDE_FILES = new Set(['一级审查.ts']);

interface ViolationItem {
  line: number;
  original: string;
  clause: string;
  suggestion: string;
  severity: string;
}

class GBT15834Checker {
  violations: Map<string, ViolationItem[]> = new Map();
  fileCount = 0;
  violationCount = 0;
  variantDict: Map<string, string>;

  constructor() {
    this.variantDict = loadVariantForms(__dirname);
  }

  private add(filepath: string, lineNo: number, original: string, clause: string, suggestion: string, severity: string): void {
    if (!this.violations.has(filepath)) {
      this.violations.set(filepath, []);
    }
    this.violations.get(filepath)!.push({ line: lineNo, original: original.trim(), clause, suggestion, severity });
    this.violationCount++;
  }

  // ── 检查 1：句末点号 ──
  checkSentenceEnd(filepath: string, lines: string[]): void {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isCodeOrTableLine(line)) continue;
      if (!isChineseLine(line)) continue;

      const stripped = line.trim();

      if (CHINESE_PERIOD_END.test(stripped)) {
        this.add(filepath, i + 1, stripped,
          '4.1 句号 — 中文陈述句末尾应使用 。，不得使用英文句号 .',
          '将句末英文句号 . 改为中文句号 。', 'T0');
      }

      if (EXCLAM_EXCESS.test(stripped)) {
        this.add(filepath, i + 1, stripped,
          '4.3 叹号 — 叹号叠用最多三个，此处超过三个',
          '减少叹号数量至三个以内', 'T2');
      }

      if (QUESTION_EXCESS.test(stripped)) {
        this.add(filepath, i + 1, stripped,
          '4.2 问号 — 问号叠用最多三个，此处超过三个',
          '减少问号数量至三个以内', 'T2');
      }
    }
  }

  // ── 检查 2：句内点号 ──
  checkSentenceInternal(filepath: string, lines: string[]): void {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isCodeOrTableLine(line)) continue;
      if (!isChineseLine(line)) continue;

      const stripped = line.trim();

      if (ENGLISH_COMMA_ZH.test(stripped)) {
        this.add(filepath, i + 1, stripped,
          '4.4 逗号 — 中文文本中不应使用英文逗号 , 替代中文逗号 ，',
          '将英文逗号 , 改为中文逗号 ，', 'T0');
      }

      if (ENGLISH_SEMICOLON_ZH.test(stripped)) {
        this.add(filepath, i + 1, stripped,
          '4.6 分号 — 中文文本中不应使用英文分号 ; 替代中文分号 ；',
          '将英文分号 ; 改为中文分号 ；', 'T0');
      }

      if (ENGLISH_COLON_ZH.test(stripped)) {
        this.add(filepath, i + 1, stripped,
          '4.7 冒号 — 中文文本中不应使用英文冒号 : 替代中文冒号 ：',
          '将英文冒号 : 改为中文冒号 ：', 'T0');
      }

      // 非言语动词后冒号接引号
      const nscqRe = new RegExp(NON_SPEECH_COLON_QUOTE.source, 'g');
      let m: RegExpExecArray | null;
      while ((m = nscqRe.exec(stripped)) !== null) {
        const wordBefore = m[1];
        if (!isSpeechVerb(wordBefore)) {
          const ctx = stripped.substring(Math.max(0, m.index - 6), Math.min(stripped.length, m.index + m[0].length + 12));
          this.add(filepath, i + 1, stripped,
            '4.7 冒号 + 4.8 引号 — 非言语动词后不应使用冒号引出对话，应使用逗号',
            `将「${wordBefore}："」改为「${wordBefore}，"」(上下文: …${ctx}…)`, 'T0');
          break; // 每行只报第一个
        }
      }
    }
  }

  // ── 检查 3：引号配对 ──
  checkQuotePairing(filepath: string, lines: string[]): void {
    const fullText = lines.join('\n');

    const leftQuotesCn = (fullText.match(/"/g) || []).length;
    const rightQuotesCn = (fullText.match(/"/g) || []).length;
    if (leftQuotesCn !== rightQuotesCn) {
      this.add(filepath, 0, `全文左引号" ${leftQuotesCn} 个，右引号" ${rightQuotesCn} 个`,
        '4.8 引号 — 中文双引号左右数量不匹配，存在未闭合引号',
        `检查全文，补齐缺失的 ${leftQuotesCn < rightQuotesCn ? '左' : '右'}引号`, 'T0');
    }

    const asciiDoubleQuotes = (fullText.match(/"/g) || []).length;
    if (asciiDoubleQuotes % 2 !== 0) {
      this.add(filepath, 0, `全文英文直双引号 " 共 ${asciiDoubleQuotes} 个（奇数），存在未闭合`,
        '4.8 引号 — 引号数量为奇数，存在未闭合引号',
        '检查全文，补齐缺失的引号', 'T0');
    }

    const leftBook = (fullText.match(/《/g) || []).length;
    const rightBook = (fullText.match(/》/g) || []).length;
    if (leftBook !== rightBook) {
      this.add(filepath, 0, `全文左书名号《 ${leftBook} 个，右书名号》 ${rightBook} 个`,
        '4.15 书名号 — 书名号左右数量不匹配',
        '检查全文，补齐缺失的书名号', 'T0');
    }

    const leftParenCn = (fullText.match(/（/g) || []).length;
    const rightParenCn = (fullText.match(/）/g) || []).length;
    if (leftParenCn !== rightParenCn) {
      this.add(filepath, 0, `全文中左括号（ ${leftParenCn} 个，右括号） ${rightParenCn} 个`,
        '4.9 括号 — 中文括号左右数量不匹配',
        '检查全文，补齐缺失的括号', 'T0');
    }

    const leftSq = (fullText.match(/【/g) || []).length;
    const rightSq = (fullText.match(/】/g) || []).length;
    if (leftSq !== rightSq) {
      this.add(filepath, 0, `全文左方头括号【 ${leftSq} 个，右方头括号】 ${rightSq} 个`,
        '4.9 括号 — 方头括号左右数量不匹配',
        '检查全文，补齐缺失的括号', 'T1');
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!isChineseLine(line)) continue;
      const stripped = line.trim();
      if (stripped.includes('‘') || stripped.includes('’')) {
        this.add(filepath, i + 1, stripped,
          '4.8 引号 — 出现中文卷曲单引号 ‘’（U+2018/U+2019），中文文本中单引号应内嵌于双引号中',
          '确认引号嵌套层级无误', 'T2');
      }
    }
  }

  // ── 检查 4：标点书写形式 ──
  checkPunctuationForm(filepath: string, lines: string[]): void {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isCodeOrTableLine(line)) continue;
      if (!isChineseLine(line)) continue;

      const stripped = line.trim();

      if (ELLIPSIS_DOTS.test(stripped)) {
        this.add(filepath, i + 1, stripped,
          '4.11 省略号 — 中文文本应使用 ……（两个字符位，六个点），不得使用 ...',
          '将 ... 替换为 ……', 'T0');
      }

      if (DOUBLE_DOT.test(stripped) && CJK_CHAR.test(stripped)) {
        this.add(filepath, i + 1, stripped,
          '4.11 省略号 — 中文文本中出现两个句点 ..，可能为省略号残缺',
          '若为省略号，应使用 ……；若为其他用途，请确认', 'T2');
      }

      const sidRe = new RegExp(SINGLE_EM_DASH.source, 'g');
      let m: RegExpExecArray | null;
      while ((m = sidRe.exec(stripped)) !== null) {
        if (CJK_CHAR.test(stripped)) {
          this.add(filepath, i + 1, stripped,
            '4.10 破折号 — 中文文本中破折号应占两个字位置（——），单个 — 不符合国标',
            '将单个 — 替换为 ——（两个 em dash 连续），或确认此处是否应为连接号', 'T1');
          break;
        }
      }

      if (EM_DASH_SPACED.test(stripped)) {
        this.add(filepath, i + 1, stripped,
          '5.1 标点位置 — 破折号占两个字位置，中间不得断开加空格',
          '删除破折号中间的空格', 'T0');
      }

      if (ELLIPSIS_SPACED.test(stripped)) {
        this.add(filepath, i + 1, stripped,
          '5.1 标点位置 — 省略号占两个字位置，中间不得断开加空格',
          '删除省略号中间的空格', 'T0');
      }

      if (PUNCT_START_OF_LINE.test(stripped)) {
        this.add(filepath, i + 1, stripped,
          '5.1 标点位置 — 句内点号和句末点号不得出现在一行之首',
          '将行首标点移至上一行末尾', 'T0');
      }

      if (QUOTE_END_OF_LINE.test(stripped)) {
        this.add(filepath, i + 1, stripped,
          '5.1 标点位置 — 前引号/前括号/前书名号不得出现在一行之末',
          '将行末前引号/前括号移至下一行开头', 'T2');
      }

      if (stripped.includes('•') && CJK_CHAR.test(stripped)) {
        if (BULLET_AS_INTERPUNCT.test(stripped)) {
          this.add(filepath, i + 1, stripped,
            '4.14 间隔号 — 中文人名中的间隔号应为 ·（U+00B7），而非项目符号 •（U+2022）',
            '将 • 改为 ·', 'T1');
        }
      }
    }
  }

  // ── 检查 5：异形词扫描 ──
  checkVariantFormsMd(filepath: string, lines: string[]): void {
    if (this.variantDict.size === 0) return;
    const fullText = lines.join('\n');
    for (const [variant, recommended] of this.variantDict) {
      if (fullText.includes(variant)) {
        const idx = fullText.indexOf(variant);
        const ctx = fullText.substring(Math.max(0, idx - 6), Math.min(fullText.length, idx + variant.length + 6)).replace(/\n/g, ' ');
        const lineNo = fullText.substring(0, idx).split('\n').length;
        this.add(filepath, lineNo, `…${ctx}…`,
          `GF 1001—2001 异形词 —「${variant}」为非推荐词形，应使用「${recommended}」`,
          `将「${variant}」替换为「${recommended}」`, 'T0');
        break; // 每种异形词只报一次
      }
    }
  }

  checkVariantFormsStr(filepath: string, text: string): void {
    if (this.variantDict.size === 0) return;
    for (const [variant, recommended] of this.variantDict) {
      if (text.includes(variant)) {
        this.add(filepath, 0, `字段值含「${variant}」`,
          `GF 1001—2001 异形词 —「${variant}」为非推荐词形，应使用「${recommended}」`,
          `将「${variant}」替换为「${recommended}」`, 'T0');
      }
    }
  }

  // ── 检查 6：数字用法 ──
  checkNumberUsageMd(filepath: string, lines: string[]): void {
    let inBasicInfo = false;
    for (let i = 0; i < lines.length; i++) {
      const stripped = lines[i].trim();
      if (stripped.includes('基础信息')) {
        inBasicInfo = true;
        continue;
      }
      if (inBasicInfo) {
        if (!stripped || stripped.startsWith('#') || /^[一二三四五六七八九十]、/.test(stripped)) {
          inBasicInfo = false;
          continue;
        }
        if (HEIGHT_WEIGHT_FIELDS.test(stripped)) {
          if (!HEIGHT_WEIGHT_FORMAT.test(stripped.split('：')[1] || '')) {
            this.add(filepath, i + 1, stripped,
              'GB/T 15835 数字用法 — 基础信息区身高/体重应使用阿拉伯数字+英文单位',
              '使用阿拉伯数字+英文单位格式，如 166cm、50kg', 'T0');
          }
        }
      }
    }
  }

  checkNumberUsageJson(filepath: string, data: Record<string, unknown>): void {
    const app = ((data.char_persona || {}) as Record<string, unknown>).appearance as Record<string, string> || {};
    for (const field of ['height', 'weight']) {
      const val = app[field] || '';
      if (val && !HEIGHT_WEIGHT_FORMAT.test(val)) {
        this.add(filepath, 0, `appearance.${field}=${val}`,
          'GB/T 15835 数字用法 — 身高/体重必须使用阿拉伯数字+英文单位',
          `改为如 166cm、50kg 格式，当前值: ${val}`, 'T0');
      }
    }
  }

  // ── JSON 文件特殊处理 ──
  checkJsonFile(filepath: string): void {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(readFileUtf8(filepath));
    } catch (e) {
      this.add(filepath, 0, `JSON 解析失败: ${e}`, '—', '修复 JSON 语法错误', 'T0');
      return;
    }

    this.checkNumberUsageJson(filepath, data);

    const chineseStrings = extractChineseStrings(data);

    for (const [strPath, text] of chineseStrings) {
      const virtualFile = `${filepath}::${strPath}`;

      this.checkVariantFormsStr(virtualFile, text);

      // 英文省略号
      if (text.includes('...') && CJK_CHAR.test(text)) {
        this.add(virtualFile, 0, '字段值出现 ...',
          '4.11 省略号 — 中文文本应使用 ……，不得使用 ...',
          '将 ... 替换为 ……', 'T0');
      }

      // 英文逗号分隔中文
      if (ENGLISH_COMMA_ZH.test(text)) {
        this.add(virtualFile, 0, '字段值出现英文逗号 , 分隔中文',
          '4.4 逗号 — 中文文本中不应使用英文逗号 , 替代中文逗号 ，',
          '将英文逗号 , 改为中文逗号 ，', 'T0');
      }

      // 英文分号
      if (ENGLISH_SEMICOLON_ZH.test(text)) {
        this.add(virtualFile, 0, '字段值出现英文分号 ; 分隔中文',
          '4.6 分号 — 中文文本中不应使用英文分号 ; 替代中文分号 ；',
          '将英文分号 ; 改为中文分号 ；', 'T0');
      }

      // 英文冒号
      if (ENGLISH_COLON_ZH.test(text)) {
        this.add(virtualFile, 0, '字段值出现英文冒号 : 分隔中文',
          '4.7 冒号 — 中文文本中不应使用英文冒号 : 替代中文冒号 ：',
          '将英文冒号 : 改为中文冒号 ：', 'T0');
      }

      // 非言语动词后冒号接引号
      const nscqRe = new RegExp(NON_SPEECH_COLON_QUOTE.source, 'g');
      let m: RegExpExecArray | null;
      while ((m = nscqRe.exec(text)) !== null) {
        const wordBefore = m[1];
        if (!isSpeechVerb(wordBefore)) {
          const ctx = text.substring(Math.max(0, m.index - 6), Math.min(text.length, m.index + m[0].length + 12));
          this.add(virtualFile, 0, '字段值出现非言语动词后冒号接引号',
            '4.7 冒号 + 4.8 引号 — 非言语动词后不应使用冒号引出对话，应使用逗号',
            `将「${wordBefore}："」改为「${wordBefore}，"」(上下文: …${ctx}…)`, 'T0');
          break;
        }
      }

      // 中文括号配对
      const leftP = (text.match(/（/g) || []).length;
      const rightP = (text.match(/）/g) || []).length;
      if (leftP !== rightP) {
        this.add(virtualFile, 0, `字段值中左括号（ ${leftP} 个，右括号） ${rightP} 个`,
          '4.9 括号 — 中文括号左右数量不匹配', '补齐缺失的括号', 'T0');
      }

      // 书名号配对
      const leftB = (text.match(/《/g) || []).length;
      const rightB = (text.match(/》/g) || []).length;
      if (leftB !== rightB) {
        this.add(virtualFile, 0, `字段值中左书名号《 ${leftB} 个，右书名号》 ${rightB} 个`,
          '4.15 书名号 — 书名号左右数量不匹配', '补齐缺失的书名号', 'T0');
      }

      // 中文引号配对
      const leftQ = (text.match(/"/g) || []).length;
      const rightQ = (text.match(/"/g) || []).length;
      if (leftQ !== rightQ) {
        this.add(virtualFile, 0, `字段值中左引号" ${leftQ} 个，右引号" ${rightQ} 个`,
          '4.8 引号 — 中文双引号左右数量不匹配', '补齐缺失的引号', 'T0');
      }
    }
  }

  // ── 主入口 ──
  checkFile(filepath: string): void {
    const ext = path.extname(filepath).toLowerCase();

    if (ext === '.json') {
      this.checkJsonFile(filepath);
      return;
    }

    let lines: string[];
    try {
      lines = readFileUtf8(filepath).split('\n');
    } catch {
      return;
    }

    this.checkSentenceEnd(filepath, lines);
    this.checkSentenceInternal(filepath, lines);
    this.checkQuotePairing(filepath, lines);
    this.checkPunctuationForm(filepath, lines);
    this.checkVariantFormsMd(filepath, lines);
    this.checkNumberUsageMd(filepath, lines);
  }

  scanAll(): void {
    const scanRoots = [
      path.join(PROJECT_ROOT, '角色卡'),
      path.join(PROJECT_ROOT, '创作者文件', '导出文件', 'world info'),
    ];

    for (const scanRoot of scanRoots) {
      if (!fs.existsSync(scanRoot)) continue;
      const files = findMdJsonFiles([scanRoot], EXCLUDE_DIRS);
      for (const f of files) {
        const name = path.basename(f);
        if (EXCLUDE_FILES.has(name)) continue;
        this.checkFile(f);
        this.fileCount++;
      }
    }
  }

  report(): Map<string, ViolationItem[]> {
    console.log('='.repeat(80));
    console.log('  GB/T 15834—2011 一级国标标点审查报告');
    console.log('='.repeat(80));
    console.log(`\n审查文件数：${this.fileCount}`);
    console.log(`违规条目数：${this.violationCount}`);
    if (this.fileCount > 0) {
      console.log(`违规文件数：${this.violations.size}`);
    }

    if (this.violationCount === 0) {
      console.log('\n未发现国标违规项。');
      return this.violations;
    }

    console.log('\n' + '='.repeat(80));
    console.log('  详细违规列表');
    console.log('='.repeat(80));

    for (const [filepath, items] of [...this.violations.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`文件：${filepath}`);
      console.log(`违规数：${items.length}`);
      console.log(`${'─'.repeat(80)}`);

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        console.log(`\n  [${item.severity}] #${idx + 1}`);
        console.log(`  ${item.line > 0 ? `行号：${item.line}` : '位置：全文'}`);
        console.log(`  原文：${item.original.substring(0, 120)}`);
        console.log(`  违反：${item.clause}`);
        console.log(`  建议：${item.suggestion}`);
      }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('  违规统计');
    console.log(`${'='.repeat(80)}`);

    const severityCounts: Record<string, number> = {};
    const clauseCounts: Record<string, number> = {};
    for (const items of this.violations.values()) {
      for (const item of items) {
        severityCounts[item.severity] = (severityCounts[item.severity] || 0) + 1;
        clauseCounts[item.clause] = (clauseCounts[item.clause] || 0) + 1;
      }
    }

    console.log('\n按严重等级：');
    for (const sev of ['T0', 'T1', 'T2', 'T3']) {
      if (severityCounts[sev]) {
        console.log(`  ${sev}：${severityCounts[sev]} 条`);
      }
    }

    console.log('\n按违反条款：');
    for (const [clause, count] of Object.entries(clauseCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${clause}：${count} 条`);
    }

    return this.violations;
  }
}

function main(): void {
  const checker = new GBT15834Checker();
  console.log('正在扫描全项目 MD+JSON 文件...');
  checker.scanAll();
  checker.report();

  const hasT0 = [...checker.violations.values()].some(items =>
    items.some(item => item.severity === 'T0')
  );
  process.exit(hasT0 ? 1 : 0);
}

main();
