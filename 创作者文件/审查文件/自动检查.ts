/**
 * 狩灵世界观 · 角色卡自动审查脚本
 * =====================================
 * 覆盖项：JSON 语法 / Token 计数（十段式 + 开场白）/ Em dash 扫描 / 枚举值校验 /
 *         MD 标点违禁 / 评级一致性 / 一般称呼规则 / 空能力字段 /
 *         引号格式 / 术语简写 / 年龄边界 / 花坂全名 / 全名使用违规 /
 *         世界书内容新鲜度 / 世界书 keys 非空 / 中英文 JSON 结构一致性
 *
 * 用法：npx tsx 创作者文件/审查文件/自动检查.ts
 * 输出分组：JSON检查 / MD检查 / 交叉验证
 */

import * as fs from 'fs';
import * as path from 'path';
import { chdirProjectRoot, ensureUtf8, readFileUtf8, normalizePath } from '../共享代码/utils';
import { initTokenizer, checkTokenBudgets, checkOpeningTokenCounts } from '../共享代码/token-counter';
import { loadProperNounTable, VALID_IDENTITY, VALID_RANK, checkAbbreviation } from '../共享代码/standards';
import { findCharacterCardJsonFiles, findAllJsonFiles, EXCLUDE_DIRS } from '../共享代码/file-scanner';
import { QUOTE_STRIP } from '../共享代码/regex';

// ── 初始化 ──
ensureUtf8();
chdirProjectRoot(__dirname);
const PROJECT_ROOT = process.cwd();

const PROPER_NOUN_MAP = loadProperNounTable(PROJECT_ROOT);

// ── Em dash 与杂横线扫描 ──
// 单独 —（合法的 —— 成对不命中）与七种杂横线（现存量为零，防输入法/粘贴混入）
const STRAY_DASH_RE = /(?<!—)—(?!—)|[–―−－ー‐‑]/;

function scanEmDash(obj: unknown, prefix: string = ''): string[] {
  const hits: string[] = [];
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      hits.push(...scanEmDash(obj[i], `${prefix}[${i}]`));
    }
  } else if (obj !== null && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const np = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'string') {
        const isSituation = np.endsWith('.situation') || k === 'situation';
        if (isSituation) {
          if (v.includes('——') || v.includes('……')) {
            const ctx = v.substring(0, 80).replace(/\n/g, ' ');
            hits.push(`  ${np}: [叙述禁止] ${ctx}`);
          }
          const sm = v.match(STRAY_DASH_RE);
          if (sm) {
            hits.push(`  ${np}: [横线违禁 ${sm[0]}] ${v.substring(0, 80).replace(/\n/g, ' ')}`);
          }
        } else {
          const stripped = v.replace(QUOTE_STRIP, '');
          if (stripped.includes('——') || stripped.includes('……')) {
            const ctx = stripped.trim().substring(0, 80).replace(/\n/g, ' ');
            hits.push(`  ${np}: [引号外禁止] ${ctx}`);
          }
          const sm = stripped.match(STRAY_DASH_RE);
          if (sm) {
            hits.push(`  ${np}: [横线违禁 ${sm[0]}] ${stripped.trim().substring(0, 80).replace(/\n/g, ' ')}`);
          }
        }
      } else if (typeof v === 'object' || Array.isArray(v)) {
        hits.push(...scanEmDash(v, np));
      }
    }
  }
  return hits;
}

// ── JSON 结构检查 ──
function checkJsonStructure(): void {
  console.log('='.repeat(60));
  console.log('JSON 语法 + 结构校验');
  console.log('='.repeat(60));

  const jsonFiles = findAllJsonFiles(PROJECT_ROOT);
  const syntaxErrors: string[] = [];
  const enumErrors: string[] = [];
  const conventionWarnings: string[] = [];
  const emptyAbilities: string[] = [];
  const emDashHits: string[] = [];

  for (const f of jsonFiles) {
    const name = path.basename(f);
    const d = normalizePath(path.dirname(f));

    // 语法
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(readFileUtf8(f));
    } catch (e) {
      syntaxErrors.push(`  ${f}: ${e}`);
      continue;
    }

    // 跳过非角色卡（事件卡/世界观卡/异常实体/关系网/世界书）
    if (d.includes('事件卡') || d.includes('世界观卡') || d.includes('异常角色卡') || d.includes('关系网') || d.includes('世界书')) {
      continue;
    }

    // 枚举值
    if (data.char_identity && !VALID_IDENTITY.has(data.char_identity as string)) {
      enumErrors.push(`  ${name}: char_identity=${data.char_identity}`);
    }
    const rank = (data.char_rank as string) || '';
    if (rank && !VALID_RANK.has(rank) && !rank.startsWith('色彩阶-')) {
      enumErrors.push(`  ${name}: char_rank=${rank}`);
    }

    // 对话示例引号格式
    const dialogues = (data.char_dialogue_examples as Array<{ response?: string }>) || [];
    for (let i = 0; i < dialogues.length; i++) {
      const resp = dialogues[i]?.response || '';
      if (resp.includes('“') || resp.includes('”')) {
        conventionWarnings.push(`  ${name}: dialogue_examples[${i}] response 含中文卷曲引号`);
      }
    }

    // 术语简写检测
    conventionWarnings.push(...checkAbbreviation(data, '', PROPER_NOUN_MAP, name).map(v =>
      `  ${v.file}: ${v.field} "${v.original.replace(/\n/g, ' ').trim()}" → ${v.suggestion}`
    ));

    // 年龄边界
    const age = data.char_persona && (data.char_persona as Record<string, unknown>).age;
    if (age !== undefined && age !== null) {
      const ageInt = parseInt(String(age).trim(), 10);
      if (!isNaN(ageInt) && ageInt < 18) {
        conventionWarnings.push(`  ${name}: char_persona.age=${ageInt} < 18，请人工确认是觉醒年龄（可接受）还是从业年龄（须>=18）`);
      }
    }

    // 空 char_special_abilities
    if ('char_special_abilities' in data) {
      const sa = data.char_special_abilities;
      if (!sa || (typeof sa === 'object' && Object.keys(sa as object).length === 0)) {
        emptyAbilities.push(`  ${name}: EMPTY char_special_abilities (应省略整个字段)`);
      }
    }

    // Em dash 扫描
    const dashHits = scanEmDash(data);
    if (dashHits.length > 0) {
      emDashHits.push(`${name}:`);
      emDashHits.push(...dashHits);
    }
  }

  if (syntaxErrors.length > 0) {
    console.log('  [语法错误]');
    for (const e of syntaxErrors) console.log(e);
  } else {
    console.log(`  语法解析: ${jsonFiles.length} 文件全部通过`);
  }

  if (enumErrors.length > 0) {
    console.log('  [枚举值异常]');
    for (const e of enumErrors) console.log(e);
  } else {
    console.log('  枚举值: 全部合法');
  }

  if (conventionWarnings.length > 0) {
    console.log('  [术语/格式规范]');
    for (const w of conventionWarnings) console.log(w);
  }

  if (emptyAbilities.length > 0) {
    console.log('  [空 special_abilities]');
    for (const e of emptyAbilities) console.log(e);
  } else {
    console.log('  char_special_abilities: 无误留空 {}');
  }

  if (emDashHits.length > 0) {
    console.log('  [Em dash 违规]');
    for (const e of emDashHits) console.log(e);
  } else {
    console.log('  Em dash: 零命中');
  }
}

// ── MD 文件检查 ──
function checkMdFiles(): void {
  console.log();
  console.log('='.repeat(60));
  console.log('MD 简介/开场白 标点违禁扫描');
  console.log('='.repeat(60));

  const issuesByFile: Record<string, string[]> = {};

  function walkMd(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDE_DIRS.has(entry.name)) continue;
        results.push(...walkMd(fullPath));
      } else if (entry.isFile()) {
        const base = entry.name;
        if (base.endsWith('简介.md') || base.endsWith('开场白.md')) {
          results.push(fullPath);
        }
      }
    }
    return results;
  }

  const mdFiles = walkMd(PROJECT_ROOT);

  for (const f of mdFiles) {
    const name = path.basename(f);
    const content = readFileUtf8(f);
    const issues: string[] = [];

    // 单独 em dash（非 ——）
    const singleDashRe = /(?<!—)—(?!—)/g;
    let m: RegExpExecArray | null;
    while ((m = singleDashRe.exec(content)) !== null) {
      const pos = m.index;
      const ctx = content.substring(Math.max(0, pos - 8), Math.min(content.length, pos + 9)).replace(/\n/g, ' ');
      issues.push(`  —: ...${ctx}...`);
    }

    // En dash
    if (content.includes('–')) {
      issues.push('  含 en dash (–)');
    }

    // 英文省略号
    if (content.includes('...')) {
      const ellipsisRe = /\.\.\./g;
      while ((m = ellipsisRe.exec(content)) !== null) {
        const pos = m.index;
        const ctx = content.substring(Math.max(0, pos - 5), Math.min(content.length, pos + 8)).replace(/\n/g, ' ');
        issues.push(`  ...: ...${ctx}...`);
      }
    }

    // 卷曲引号（仅开场白）
    if (name.includes('开场白') && (content.includes('“') || content.includes('”'))) {
      issues.push('  含中文卷曲引号');
    }

    // Markdown 装饰符
    const mdDecoRe = /\*[^*\s][^*]*[^*\s]\*/g;
    while ((m = mdDecoRe.exec(content)) !== null) {
      const mt = m[0];
      if (mt !== '***') {
        issues.push(`  *...*: ${mt.substring(0, 50)}`);
      }
    }

    // —— 密度检查（仅开场白）
    if (name.includes('开场白')) {
      const dashTotal = (content.match(/——/g) || []).length;
      const textNoQuotes = content.replace(QUOTE_STRIP, '');
      const dashNarrative = (textNoQuotes.match(/——/g) || []).length;
      const dashDialogue = dashTotal - dashNarrative;
      if (dashTotal > 3) {
        issues.push(`  —— 总量 ${dashTotal} 组 (叙述 ${dashNarrative}/对话 ${dashDialogue})，超过 3 组上限，须逐条审查`);
      } else if (dashNarrative > 2) {
        issues.push(`  叙述中 —— ${dashNarrative} 组，偏多，建议审查是否可替换为逗号`);
      }
    }

    if (issues.length > 0) {
      issuesByFile[name] = issues;
    }
  }

  if (Object.keys(issuesByFile).length > 0) {
    for (const [fname, iss] of Object.entries(issuesByFile)) {
      console.log(`  ${fname}:`);
      for (const i of iss) console.log(i);
    }
  } else {
    console.log('  全部通过');
  }
}

// ── 交叉验证 ──
function crossValidate(): void {
  console.log();
  console.log('='.repeat(60));
  console.log('JSON <-> 简介 交叉验证');
  console.log('='.repeat(60));

  const ratingMismatches: string[] = [];
  const generalNameIssues: string[] = [];

  const cardRoot = path.join(PROJECT_ROOT, '角色卡');
  if (!fs.existsSync(cardRoot)) return;

  function walkCards(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const norm = normalizePath(fullPath);
        if (norm.includes('事件卡') || norm.includes('世界观卡') || norm.includes('关系网')) continue;
        walkCards(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('_zh.json')) {
        const charDir = path.dirname(fullPath);
        const cardName = path.basename(entry.name, '.json');
        const introFiles = fs.readdirSync(charDir).filter(fn => fn.endsWith('简介.md'));
        if (introFiles.length === 0) continue;

        const data = JSON.parse(readFileUtf8(fullPath));
        if (!data.char_rank) continue;

        const intro = readFileUtf8(path.join(charDir, introFiles[0]));

        // 评级一致性
        const jsonRank: string = data.char_rank;
        const m = intro.match(/评级：(.+)/);
        const introRank = m ? m[1].trim() : 'NOT FOUND';
        if (jsonRank !== introRank) {
          if (!(jsonRank === 'None' && introRank === '无')) {
            ratingMismatches.push(
              `  ${cardName.padEnd(12)} JSON=${jsonRank.padEnd(6)} 简介=${introRank}`
            );
          }
        }

        // 一般称呼（异常卡简介为「异常信息」段式，无一般称呼行，跳过）
        if (!normalizePath(charDir).includes('异常角色卡')) {
          const charName: string = data.char_name || '';
          const charAlias: string = data.char_alias || 'None';
          const mGen = intro.match(/一般称呼：(.+)/);
          const general = mGen ? mGen[1].trim() : '';
          let expected: string;
          if (!charAlias || charAlias === 'None' || charAlias === charName) {
            expected = charName;
          } else {
            expected = `${charName}、${charAlias}`;
          }
          if (general !== expected) {
            generalNameIssues.push(
              `  ${cardName.padEnd(12)} name=${charName} alias=${charAlias} expected='${expected}' actual='${general}'`
            );
          }
        }
      }
    }
  }

  walkCards(cardRoot);

  if (ratingMismatches.length > 0) {
    console.log('  [评级不一致]');
    for (const e of ratingMismatches) console.log(e);
  } else {
    console.log('  评级一致性: 全部匹配');
  }

  if (generalNameIssues.length > 0) {
    console.log('  [一般称呼异常]');
    for (const e of generalNameIssues) console.log(e);
  } else {
    console.log('  一般称呼: 全部符合规则');
  }
}

// ── 花坂全名扫描 ──
function scanFlowerSlopeFullnames(): void {
  console.log();
  console.log('='.repeat(60));
  console.log('花坂家族 关系键全名扫描');
  console.log('='.repeat(60));

  const hits: string[] = [];
  const jsonFiles = findAllJsonFiles(PROJECT_ROOT);

  for (const f of jsonFiles) {
    const data = JSON.parse(readFileUtf8(f));
    const name = path.basename(f);
    const rels = (data.char_relationships || {}) as Record<string, unknown>;
    for (const key of Object.keys(rels)) {
      if (key.includes('花坂') && key.includes(' ')) {
        hits.push(`  ${name}: "${key}"`);
      }
    }
  }

  if (hits.length > 0) {
    console.log('  (注意: 枫/晴子为无角色卡NPC，以下如为父母引用属正常)');
    for (const h of hits) console.log(h);
  } else {
    console.log('  零命中');
  }
}

// ── 全角色全名扫描 ──
function scanFullnameViolations(): void {
  console.log();
  console.log('='.repeat(60));
  console.log('全名使用违规扫描');
  console.log('='.repeat(60));

  // 收集全名映射
  const fullnames: Record<string, string> = {};
  const jsonFiles = findAllJsonFiles(PROJECT_ROOT);

  for (const f of jsonFiles) {
    const d = normalizePath(path.dirname(f));
    if (d.includes('关系网') || d.includes('世界书')) continue;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(readFileUtf8(f));
    } catch { continue; }
    const cn = data.char_name as string;
    const cfn = data.char_fullname as string;
    if (cn && cfn && cfn.length >= 2 && cfn !== cn) {
      fullnames[cn] = cfn;
    }
  }

  // 扫描
  const scanTargets = [
    'char_background.origin',
    'char_background.current_mission',
    'char_description.overview',
    'char_description.combat_style',
  ];
  const violations: string[] = [];

  for (const f of jsonFiles) {
    const d = normalizePath(path.dirname(f));
    if (d.includes('关系网') || d.includes('世界书')) continue;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(readFileUtf8(f));
    } catch { continue; }

    const ownName = (data.char_name as string) || '';

    // 检查固定字段
    for (const target of scanTargets) {
      const parts = target.split('.');
      let val: unknown = data;
      try {
        for (const p of parts) {
          val = (val as Record<string, unknown>)[p];
        }
      } catch { val = ''; }
      if (typeof val !== 'string') continue;

      for (const [cn, cfn] of Object.entries(fullnames)) {
        if (cn === ownName) continue;
        if (val.includes(cfn)) {
          violations.push(`  ${ownName.padEnd(6)} ${target.padEnd(40)} 含全名 "${cfn}" 应为 "${cn}"`);
        }
      }
    }

    // 检查关系字段值
    const rels = (data.char_relationships || {}) as Record<string, unknown>;
    for (const [rkey, rval] of Object.entries(rels)) {
      if (typeof rval !== 'string') continue;
      for (const [cn, cfn] of Object.entries(fullnames)) {
        if (cn === ownName || cn === rkey) continue;
        if (rval.includes(cfn)) {
          violations.push(`  ${ownName.padEnd(6)} char_relationships.${rkey.padEnd(12)} 含全名 "${cfn}" 应为 "${cn}"`);
        }
      }
    }
  }

  if (violations.length > 0) {
    for (const v of violations.sort()) console.log(v);
  } else {
    console.log('  零命中');
  }
}

// ── 中英文 JSON 一致性 ──
function checkZhEnConsistency(): void {
  console.log();
  console.log('='.repeat(60));
  console.log('中英文 JSON 结构一致性');
  console.log('='.repeat(60));

  const issues: string[] = [];
  const jsonFiles = findAllJsonFiles(PROJECT_ROOT);

  // 收集全部角色名，用于判定关系键是否为确切人名的引用
  const knownNames = new Set<string>();
  for (const f of jsonFiles) {
    const d = normalizePath(path.dirname(f));
    if (f.endsWith('_zh.json') || d.includes('事件卡') || d.includes('世界观卡') || d.includes('关系网') || d.includes('世界书')) continue;
    try {
      const data = JSON.parse(readFileUtf8(f));
      if (data.char_name) knownNames.add(data.char_name);
      if (data.char_fullname) knownNames.add(data.char_fullname);
    } catch {}
  }

  for (const f of jsonFiles) {
    if (f.endsWith('_zh.json')) continue;
    const d = normalizePath(path.dirname(f));
    if (d.includes('事件卡') || d.includes('世界观卡') || d.includes('关系网') || d.includes('世界书')) continue;

    const zhF = f.replace('.json', '_zh.json');
    if (!fs.existsSync(zhF)) continue;

    const en = JSON.parse(readFileUtf8(f));
    const zh = JSON.parse(readFileUtf8(zhF));
    const char = en.char_name || path.basename(f);

    // 关系键：仅标记确切人名的键不对称，描述性标签允许各自语言
    const enRels = new Set(Object.keys(en.char_relationships || {}));
    const zhRels = new Set(Object.keys(zh.char_relationships || {}));
    const onlyEn = [...enRels].filter(k => !zhRels.has(k) && knownNames.has(k));
    const onlyZh = [...zhRels].filter(k => !enRels.has(k) && knownNames.has(k));
    if (onlyEn.length > 0) issues.push(`  ${char}: 关系键仅在英文: ${onlyEn}`);
    if (onlyZh.length > 0) issues.push(`  ${char}: 关系键仅在中文: ${onlyZh}`);

    // 特殊能力键
    const enAb = new Set(Object.keys(en.char_special_abilities || {}));
    const zhAb = new Set(Object.keys(zh.char_special_abilities || {}));
    const onlyEnAb = [...enAb].filter(k => !zhAb.has(k));
    const onlyZhAb = [...zhAb].filter(k => !enAb.has(k));
    if (onlyEnAb.length > 0) issues.push(`  ${char}: 特殊能力键仅在英文: ${onlyEnAb}`);
    if (onlyZhAb.length > 0) issues.push(`  ${char}: 特殊能力键仅在中文: ${onlyZhAb}`);

    // 对话示例数
    const enDi = (en.char_dialogue_examples || []).length;
    const zhDi = (zh.char_dialogue_examples || []).length;
    if (enDi !== zhDi) {
      issues.push(`  ${char}: 对话示例数不一致 en=${enDi} zh=${zhDi}`);
    }
  }

  if (issues.length > 0) {
    for (const i of issues) console.log(i);
  } else {
    console.log('  全部一致');
  }
}

// ── 世界书内容与关系网一致性 ──
function checkWorldbookContentFreshness(): void {
  console.log();
  console.log('='.repeat(60));
  console.log('世界书内容与关系网一致性');
  console.log('='.repeat(60));

  const REL_ALL = '创作者文件/导出文件/关系网/全角色';
  const WB_DIR = '创作者文件/导出文件/世界书';
  const BASE_RULES = new Set(['宏观规则', '世界观', '灵能者', '评级', '异常', '狩灵协会', '锈钟', '天丛云剑']);
  let stale = 0;

  if (!fs.existsSync(WB_DIR)) return;

  for (const wbFn of fs.readdirSync(WB_DIR).sort()) {
    if (!wbFn.endsWith('.json')) continue;
    const wb = JSON.parse(readFileUtf8(path.join(WB_DIR, wbFn)));
    for (const e of (wb.entries || []) as Array<{ comment?: string; content?: string }>) {
      const comment = e.comment || '';
      if (BASE_RULES.has(comment)) {
        const srcPath = path.join('创作者文件/导出文件/world info', `${comment}.md`);
        if (fs.existsSync(srcPath) && e.content !== readFileUtf8(srcPath)) {
          console.log(`  ${wbFn}: 基础条目 "${comment}" 与 world info 源不同步`);
          stale++;
        }
        continue;
      }
      const relPath = path.join(REL_ALL, `${comment}.json`);
      if (!fs.existsSync(relPath)) continue;

      const relData = JSON.parse(readFileUtf8(relPath));
      const relStr = JSON.stringify(relData, null, 2);
      if (e.content !== relStr) {
        console.log(`  ${wbFn}: "${comment}" 与关系网不同步`);
        stale++;
      }
    }
  }
  if (stale === 0) {
    console.log('  全部同步');
  } else {
    console.log(`  ${stale} 条不同步，需重建世界书`);
  }
}

// ── 世界书 keys 非空检查 ──
function checkRelationKeys(): void {
  console.log();
  console.log('='.repeat(60));
  console.log('世界书 name 与 keys 检查');
  console.log('='.repeat(60));

  const empty: string[] = [];
  const WB_DIR = '创作者文件/导出文件/世界书';
  if (!fs.existsSync(WB_DIR)) return;

  for (const wbFn of fs.readdirSync(WB_DIR).sort()) {
    if (!wbFn.endsWith('.json')) continue;
    const wb = JSON.parse(readFileUtf8(path.join(WB_DIR, wbFn)));
    if (!wb.name || typeof wb.name !== 'string' || !wb.name.trim()) {
      empty.push(`  ${wbFn}: 顶层 name 缺失或为空`);
    }
    for (const e of (wb.entries || []) as Array<{ constant?: boolean; keys?: string[]; comment?: string; id?: number }>) {
      if (!e.constant && (!e.keys || e.keys.length === 0)) {
        empty.push(`  ${wbFn}: "${e.comment || '?'}" (id=${e.id}) keys 为空`);
      }
    }
  }

  if (empty.length > 0) {
    for (const e of empty) console.log(e);
  } else {
    console.log('  全部通过');
  }
}

// ── 主入口 ──
async function main(): Promise<void> {
  // 检测器自检：曲引号字面量若被全局替换误杀，当场报警（样本用 fromCharCode 构造，替换工具扫不到）
  if (!'“'.includes(String.fromCharCode(0x201C)) || !'”'.includes(String.fromCharCode(0x201D))) {
    console.log('⚠ 检测器自检失败：曲引号检测字面量已被替换损坏，修复 自动检查.ts 后再信任本报告');
  }

  await initTokenizer();

  // Token 计数
  console.log('='.repeat(60));
  console.log('JSON Token 计数（十段式 cl100k_base）');
  console.log('='.repeat(60));

  const tokenViolations = await checkTokenBudgets();
  if (tokenViolations.length > 0) {
    for (const v of tokenViolations) {
      console.log(`  ${v.file.padEnd(25)} ${v.original}`);
    }
  } else {
    console.log('  全部达标');
  }

  // 开场白 Token 计数
  console.log();
  console.log('='.repeat(60));
  console.log('开场白 Token 计数 (区间 900-1100)');
  console.log('='.repeat(60));

  const openingViolations = await checkOpeningTokenCounts();
  if (openingViolations.length > 0) {
    for (const v of openingViolations) {
      const label = v.symbol === 'Token OVER' ? 'OVER' : 'UNDER';
      console.log(`  ${label.padEnd(6)} ${v.file.padEnd(20)} ${v.original}`);
    }
  }

  // 其余检查
  checkJsonStructure();
  checkMdFiles();
  crossValidate();
  scanFlowerSlopeFullnames();
  scanFullnameViolations();
  checkWorldbookContentFreshness();
  checkRelationKeys();
  checkZhEnConsistency();

  console.log();
  console.log('='.repeat(60));
  console.log('自动检查完成。人工仅需确认离群值。');
}

main().catch(console.error);
