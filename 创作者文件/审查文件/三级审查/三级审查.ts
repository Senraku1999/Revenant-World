/**
 * 三级标点审查 —— 三步法脚本
 * 对 角色卡/ 与 world info/ 的 MD+JSON 文件中每个 ，。；：！？执行合法性测试。
 * 机械可判定的直接输出结果，语义模糊的标记为待人工审查。
 *
 * 覆盖标点：，删去测试 / 。替换测试 / ；互换测试 / ：合法性判断 / ！？叙述违禁检测
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  readFileUtf8, extractSentences, findQuoteRanges, isInQuoteRange,
  findSentenceForPos, isMdTemplateLabel, normalizePath, extractChineseStrings
} from '../../共享代码/utils';
import { isSpeechVerb } from '../../共享代码/standards';
import { findMdJsonFiles } from '../../共享代码/file-scanner';
import {
  COMMA_G, PERIOD_G, SEMICOLON_G, COLON_G, EXCLAM_QUESTION_G,
  SUBJECT_STARTERS, CONSECUTIVE_VERB, CJK_CHAR,
  CONSECUTIVE_CONJ, TRANSITION_CONJ, IDENTITY_ENDING, ADVERBIAL_ENDING,
  PARALLEL_VERB, PARALLEL_VERB_START, PARALLEL_PAIR
} from '../../共享代码/regex';
import { assertDetectorIntegrity } from '../../共享代码/detector-guard';

interface Result {
  file: string;
  field: string;
  symbol: string;
  original: string;
  test: string;
  suggestion: string;
  confidence: string;
  reason: string;
  note: string;
  type?: string;
  msg?: string;
}

type FileGrouper = Record<string, {
  comma_del: number; comma_amb: number;
  period_chg: number; period_amb: number;
  semi: number; colon: number; exclam: number;
}>;

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// ── 文件遍历 ──
function findFiles(): string[] {
  const scanRoots = [
    path.join(PROJECT_ROOT, '角色卡'),
    path.join(PROJECT_ROOT, '创作者文件', '导出文件', 'world info'),
  ];
  return findMdJsonFiles(scanRoots);
}

// ── 逗号删去测试 ──
function commaDeleteTest(textBefore: string, textAfter: string, fullContext: string): [boolean | null, string, string] {
  const merged = textBefore.trimEnd() + textAfter.trimStart();

  // 规则 1：删后出现重复
  if (/(的的|了了|着着|在在|是是|和和)/.test(merged)) {
    return [false, '高', '删后出现词语重复'];
  }

  // 规则 2：单字副词
  if (textBefore.length >= 1 && '就便却也都还才又再'.includes(textBefore[textBefore.length - 1])) {
    return [false, '高', '逗号前为单字副词，删后粘连'];
  }

  // 规则 3：转折/递进连词
  if (TRANSITION_CONJ.test(textAfter.trimStart())) {
    return [false, '高', '逗号后为连词，删后语义不清'];
  }

  // 规则 4：多逗号列举序列
  if (fullContext.includes('、')) {
    const parts = fullContext.split('，');
    if (parts.length >= 3) {
      return [false, '中', '处于多逗号序列中，可能为列举分层'];
    }
  }

  // 规则 5：后句有显式主语
  if (SUBJECT_STARTERS.test(textAfter.trimStart())) {
    return [false, '中', '后句有显式主语，可能主语切换'];
  }

  // 规则 6：时间/地点状语
  if (ADVERBIAL_ENDING.test(textBefore.trimEnd().slice(-3))) {
    return [false, '中', '逗号前为时间/地点状语'];
  }

  // 规则 7：删后句子过长
  if (merged.length > 60 && !merged.includes('，') && !merged.includes('。')) {
    return [false, '低', '删后句子过长(>60字)'];
  }

  // 规则 8：并列动词短语
  if (PARALLEL_VERB.test(textBefore.trimEnd().slice(-2))) {
    if (PARALLEL_VERB_START.test(textAfter.trimStart())) {
      return [true, '中', '并列动词短语，同一主语'];
    }
  }

  // 规则 9：定语修饰
  if (textBefore.trimEnd().endsWith('的')) {
    return [true, '中', '定语修饰关系，删后更紧凑'];
  }

  return [null, '低', '需人工判断'];
}

// ── 句号替换测试 ──
function periodReplaceTest(
  textBefore: string, textAfter: string, isParagraphEnd: boolean
): [boolean | null, string, string] {
  if (isParagraphEnd) {
    return [false, '高', '硬止：段落末尾'];
  }

  if (/^\s*[！？!?]/.test(textAfter)) {
    return [false, '高', '硬止：后句为感叹/疑问'];
  }

  if (SUBJECT_STARTERS.test(textAfter.trimStart())) {
    return [null, '中', '后句代词开头，可能共享主语（待人工复核）'];
  }

  if (IDENTITY_ENDING.test(textBefore.trimEnd())) {
    return [true, '高', '前句为身份标签，后句为展开说明'];
  }

  if (CONSECUTIVE_VERB.test(textAfter.trimStart())) {
    return [true, '中', '后句无显式主语，可能共享主语'];
  }

  if (CONSECUTIVE_CONJ.test(textAfter.trimStart())) {
    return [true, '中', '后句为连贯动作/结果'];
  }

  return [null, '低', '需人工判断'];
}

// ── 分号互换测试 ──
function semicolonSwapTest(textBefore: string, textAfter: string): [boolean | null, string, string] {
  const before = textBefore.trim();
  const after = textAfter.trim();

  if (PARALLEL_PAIR.test(after)) {
    return [true, '高', '平行对举格式(X：…；Y：…)'];
  }

  if (Math.abs(before.length - after.length) < 5) {
    return [true, '中', '前后分句长度接近，可能并列'];
  }

  if (TRANSITION_CONJ.test(after)) {
    return [false, '高', '后句为转折/因果/顺序，非并列关系'];
  }

  return [null, '低', '需人工判断分句关系'];
}

// ── 冒号合法性判断 ──
function checkColonUsage(
  textBefore: string, textAfter: string, fullContext: string
): [boolean | null, string, string] {
  const before = textBefore.trim();
  const after = textAfter.trim();

  // 模式 1：引述
  if (after.startsWith('"')) {
    const m = before.match(/([一-鿿]{1,6})$/);
    if (m) {
      let word = m[1];
      for (const p of ['了', '着', '过']) {
        if (word.endsWith(p) && word.length > 1) { word = word.slice(0, -1); break; }
      }
      for (let i = 0; i < word.length; i++) {
        if (isSpeechVerb(word.slice(i))) {
          return [true, '引述', `言语动词「${m[1]}」+：`];
        }
      }
    }
    return [null, '未知', '非言语动词后 ："，非合法引述'];
  }

  // 模式 2：枚举
  if (after.substring(0, 30).includes('、')) {
    return [true, '枚举', '：后含顿号列举'];
  }

  // 模式 3：解释
  if (CJK_CHAR.test(before) && CJK_CHAR.test(after)) {
    if (after.length > 2 && !after.startsWith('"')) {
      return [true, '解释', '：前后均为中文，可能为解释说明'];
    }
  }

  return [null, '未知', '无法机械判定，待人工判断'];
}

// ── ！？叙述违禁检测 ──
function checkExclamQuestion(
  text: string, ranges: [number, number][], isResponseField: boolean
): Array<{ pos: number; char: string; isBad: boolean | null; confidence: string; reason: string }> {
  const results: Array<{ pos: number; char: string; isBad: boolean | null; confidence: string; reason: string }> = [];
  const re = new RegExp(EXCLAM_QUESTION_G.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const pos = m.index;
    const ch = m[0];
    const inQuote = isInQuoteRange(pos, ranges);

    if (inQuote) {
      if (isResponseField) {
        results.push({ pos, char: ch, isBad: null, confidence: '低', reason: '引号内！？，角色卡对话仅解锁 ——……' });
      } else {
        results.push({ pos, char: ch, isBad: null, confidence: '中', reason: '引号内！？，角色卡叙述中引号内不应使用' });
      }
    } else {
      results.push({ pos, char: ch, isBad: false, confidence: '高', reason: '引号外！？，角色卡叙述禁止' });
    }
  }
  return results;
}

// ── 共享标点检查（MD 和 JSON 复用）──
function checkPunctuation(
  text: string, relpath: string, fieldName: string,
  opts: { ambiguousComma?: boolean; mdContext?: string; isResponse?: boolean } = {}
): Result[] {
  const results: Result[] = [];
  const ranges = findQuoteRanges(text);
  const sentences = extractSentences(text);
  const { ambiguousComma = false, mdContext, isResponse = false } = opts;

  // 逗号
  let cm: RegExpExecArray | null;
  const cRe = new RegExp(COMMA_G.source, 'g');
  while ((cm = cRe.exec(text)) !== null) {
    const pos = cm.index;
    if (isInQuoteRange(pos, ranges)) continue;
    const sent = findSentenceForPos(sentences, pos);
    if (!sent) continue;
    const before = text.substring(sent.start, pos);
    const after = text.substring(pos + 1, sent.end);
    const [deletable, confidence, reason] = commaDeleteTest(before, after, text.substring(sent.start, sent.end));

    if (deletable === true) {
      results.push({ file: relpath, field: fieldName, symbol: '，',
        original: sent.text.trim(),
        test: `删去逗号："${before.trimEnd()}${after.trimStart()}"`,
        suggestion: '可删', confidence, reason, note: '' });
    } else if (ambiguousComma && deletable === null && confidence === '低') {
      results.push({ file: relpath, field: fieldName, symbol: '，',
        original: sent.text.trim(),
        test: `删去后："${before.trimEnd()}${after.trimStart()}"`,
        suggestion: '待人工判断', confidence, reason, note: '' });
    }
  }

  // 句号
  let pm: RegExpExecArray | null;
  const pRe = new RegExp(PERIOD_G.source, 'g');
  while ((pm = pRe.exec(text)) !== null) {
    const pos = pm.index;
    if (isInQuoteRange(pos, ranges)) continue;
    const sent = findSentenceForPos(sentences, pos);
    if (!sent) continue;

    let nextSent: { text: string } | null = null;
    let isParaEnd = false;
    if (mdContext) {
      for (const ns of sentences) {
        if (ns.start >= sent.end) { nextSent = ns; break; }
      }
      if (nextSent) {
        const between = mdContext.substring(sent.end, (nextSent as typeof sent).start);
        isParaEnd = between.includes('\n') && between.trim() === '';
      }
    } else {
      const nsText = text.substring(sent.end).trimStart();
      const nextEnd = text.indexOf('。', sent.end);
      nextSent = { text: nextEnd === -1 ? nsText : text.substring(sent.end, nextEnd).trim() };
      isParaEnd = pos === text.trimEnd().length - 1 || sent.end >= text.trimEnd().length;
    }
    if (!nextSent || !nextSent.text) continue;

    const textBefore = text.substring(sent.start, pos);
    const [shouldChange, confidence, reason] = periodReplaceTest(textBefore, nextSent.text, isParaEnd);

    if (shouldChange === true) {
      results.push({ file: relpath, field: fieldName, symbol: '。',
        original: `${sent.text.trim()} ${nextSent.text.trim()}`,
        test: `替换为逗号："${textBefore.trimEnd()}，${nextSent.text.trimStart()}"`,
        suggestion: '改逗号', confidence, reason, note: '' });
    } else if (shouldChange === null) {
      results.push({ file: relpath, field: fieldName, symbol: '。',
        original: `${sent.text.trim()} ${nextSent.text.trim()}`,
        test: `替换为逗号后："${textBefore.trimEnd()}，${nextSent.text.trimStart()}"`,
        suggestion: '待人工判断', confidence, reason, note: '' });
    }
  }

  // 分号
  let sm: RegExpExecArray | null;
  const sRe = new RegExp(SEMICOLON_G.source, 'g');
  while ((sm = sRe.exec(text)) !== null) {
    const pos = sm.index;
    if (isInQuoteRange(pos, ranges)) continue;
    const sent = findSentenceForPos(sentences, pos);
    if (!sent) continue;
    const left = text.substring(sent.start, pos);
    const right = text.substring(pos + 1, sent.end);
    const [isCorrect, confidence, reason] = semicolonSwapTest(left, right);
    if (isCorrect === false || isCorrect === null) {
      results.push({ file: relpath, field: fieldName, symbol: '；',
        original: sent.text.trim(),
        test: `互换后："${right.trim()}；${left.trim()}"`,
        suggestion: isCorrect === false ? '改为逗号或句号' : '待人工判断', confidence, reason, note: '' });
    }
  }

  // 冒号
  let colm: RegExpExecArray | null;
  const colRe = new RegExp(COLON_G.source, 'g');
  while ((colm = colRe.exec(text)) !== null) {
    const pos = colm.index;
    if (isInQuoteRange(pos, ranges)) continue;
    const sent = findSentenceForPos(sentences, pos);
    if (!sent) continue;
    const before = text.substring(sent.start, pos);
    const after = text.substring(pos + 1, sent.end);

    if (mdContext) {
      const lineStart = mdContext.lastIndexOf('\n', pos - 1) + 1;
      const lineEnd = mdContext.indexOf('\n', pos);
      const line = mdContext.substring(lineStart, lineEnd === -1 ? mdContext.length : lineEnd);
      if (isMdTemplateLabel(line)) continue;
    }

    const [isLegal, pattern, reason] = checkColonUsage(before, after, text.substring(sent.start, sent.end));
    if (isLegal === false || isLegal === null) {
      results.push({ file: relpath, field: fieldName, symbol: '：',
        original: sent.text.trim(),
        test: `：前「${before.trimEnd().slice(-10)}」后「${after.trimStart().slice(0, 20)}」`,
        suggestion: isLegal ? `合法-${pattern}` : '待人工判断',
        confidence: isLegal ? '高' : '低', reason, note: '' });
    }
  }

  // ！？
  for (const { pos, char, isBad, confidence, reason } of checkExclamQuestion(text, ranges, isResponse)) {
    const sent = findSentenceForPos(sentences, pos);
    const ctx = text.substring(Math.max(0, pos - 8), Math.min(text.length, pos + 9)).replace(/\n/g, ' ');
    results.push({ file: relpath, field: fieldName, symbol: char,
      original: sent ? sent.text.trim() : `…${ctx}…`,
      test: `出现 ${char}`,
      suggestion: isBad === false ? '违规' : '待人工判断', confidence, reason, note: '' });
  }

  return results;
}

// ── 处理 MD ──
function processMdFile(filepath: string, relpath: string): Result[] {
  let text: string;
  try { text = readFileUtf8(filepath); } catch (e) {
    return [{ file: relpath, field: '', symbol: '', original: '', test: '', suggestion: '', confidence: '', reason: '', note: '', type: 'ERROR', msg: String(e) }];
  }
  return checkPunctuation(text, relpath, '正文', { ambiguousComma: true, mdContext: text });
}

// ── 处理 JSON ──
function processJsonFile(filepath: string, relpath: string): Result[] {
  let data: Record<string, unknown>;
  try { data = JSON.parse(readFileUtf8(filepath)); } catch (e) {
    return [{ file: relpath, field: '', symbol: '', original: '', test: '', suggestion: '', confidence: '', reason: '', note: '', type: 'ERROR', msg: String(e) }];
  }
  const results: Result[] = [];
  for (const [fieldPath, text] of extractChineseStrings(data, '', 5)) {
    const isResponse = /char_dialogue_examples\[\d+\]\.response/.test(fieldPath);
    results.push(...checkPunctuation(text, relpath, fieldPath, { isResponse }));
  }
  return results;
}

// ── 主入口 ──
function main(): void {
  assertDetectorIntegrity();
  console.log('='.repeat(80));
  console.log('三级标点审查 · 三步法');
  console.log('='.repeat(80));

  const allFiles = findFiles();
  console.log(`\n找到 ${allFiles.length} 个文件`);

  const allResults: Result[] = [];
  let errorCount = 0;

  for (let i = 0; i < allFiles.length; i++) {
    const filepath = allFiles[i];
    const relpath = path.relative(PROJECT_ROOT, filepath);

    if ((i + 1) % 50 === 0) {
      console.log(`  进度: ${i + 1}/${allFiles.length} (${allResults.length} 项标记)`);
    }

    // 排除审查文件自身
    const rel = normalizePath(relpath);

    let results: Result[];
    if (filepath.endsWith('.json')) {
      results = processJsonFile(filepath, relpath);
    } else {
      results = processMdFile(filepath, relpath);
    }

    allResults.push(...results);
    if (results.length > 0 && results[0].type === 'ERROR') errorCount++;
  }

  console.log(`\n处理完成: ${allFiles.length} 文件, ${errorCount} 错误`);

  // 分类汇总
  const commaDeletable = allResults.filter(r => r.symbol === '，' && r.suggestion === '可删');
  const commaAmbiguous = allResults.filter(r => r.symbol === '，' && r.suggestion === '待人工判断');
  const periodChangeable = allResults.filter(r => r.symbol === '。' && r.suggestion === '改逗号');
  const periodAmbiguous = allResults.filter(r => r.symbol === '。' && r.suggestion === '待人工判断');
  const semicolonIssues = allResults.filter(r => r.symbol === '；');
  const colonIssues = allResults.filter(r => r.symbol === '：');
  const exclamIssues = allResults.filter(r => r.symbol === '！' || r.symbol === '？');

  console.log('\n─── 汇总 ───');
  console.log(`逗号可删 (高/中置信度): ${commaDeletable.length}`);
  console.log(`逗号待人工判断: ${commaAmbiguous.length}`);
  console.log(`句号应改逗号 (高/中置信度): ${periodChangeable.length}`);
  console.log(`句号待人工判断: ${periodAmbiguous.length}`);
  console.log(`分号问题项: ${semicolonIssues.length}`);
  console.log(`冒号问题项 (新增): ${colonIssues.length}`);
  console.log(`！？问题项 (新增): ${exclamIssues.length}`);
  console.log(`总计标记: ${allResults.length}`);

  // 输出详细结果
  const outputPath = path.join(PROJECT_ROOT, '创作者文件', '审查文件', '三级审查', '三级审查结果.txt');
  let out = '='.repeat(80) + '\n';
  out += '三级标点审查 · 三步法结果\n';
  out += '='.repeat(80) + '\n\n';

  const sections: Array<[string, Result[]]> = [
    ['─── 一、逗号可删（删去测试通过）───', commaDeletable],
    ['─── 二、句号应改逗号（替换测试通过）───', periodChangeable],
    ['─── 三、分号问题项（互换测试未通过）───', semicolonIssues],
    ['─── 四、冒号审查（新增）───', colonIssues],
    ['─── 五、！？叙述违禁检测（新增）───', exclamIssues],
    ['─── 六、逗号待人工判断（模糊项）───', commaAmbiguous],
    ['─── 七、句号待人工判断（模糊项）───', periodAmbiguous],
  ];

  for (const [sectionTitle, items] of sections) {
    out += `\n${sectionTitle} (${items.length} 项)\n\n`;
    for (const item of items) {
      out += `文件: ${item.file}\n`;
      out += `字段: ${item.field}\n`;
      out += `符号: ${item.symbol}\n`;
      out += `原句: ${item.original}\n`;
      out += `测试: ${item.test}\n`;
      out += `建议: ${item.suggestion} | 置信度: ${item.confidence} | 理由: ${item.reason}\n`;
      if (item.note) out += `备注: ${item.note}\n`;
      out += '---\n';
    }
  }

  // 按文件分组
  out += '\n\n─── 按文件分组统计 ───\n\n';
  const fileGroups: FileGrouper = {};
  for (const r of allResults) {
    const fname = r.file;
    if (!fileGroups[fname]) {
      fileGroups[fname] = { comma_del: 0, comma_amb: 0, period_chg: 0, period_amb: 0, semi: 0, colon: 0, exclam: 0 };
    }
    const g = fileGroups[fname];
    const sym = r.symbol;
    const sug = r.suggestion;
    if (sym === '，' && sug === '可删') g.comma_del++;
    else if (sym === '，' && sug === '待人工判断') g.comma_amb++;
    else if (sym === '。' && sug === '改逗号') g.period_chg++;
    else if (sym === '。' && sug === '待人工判断') g.period_amb++;
    else if (sym === '；') g.semi++;
    else if (sym === '：') g.colon++;
    else if (sym === '！' || sym === '？') g.exclam++;
  }

  for (const fname of Object.keys(fileGroups).sort()) {
    const g = fileGroups[fname];
    const total = g.comma_del + g.comma_amb + g.period_chg + g.period_amb + g.semi + g.colon + g.exclam;
    if (total > 0) {
      out += `${fname}: 逗可删${g.comma_del} 逗模糊${g.comma_amb} 句改逗${g.period_chg} 句模糊${g.period_amb} 分号${g.semi} 冒号${g.colon} 叹问${g.exclam} (共${total})\n`;
    }
  }

  fs.writeFileSync(outputPath, out, 'utf-8');
  console.log(`\n详细结果已输出到: ${outputPath}`);
}

main();
