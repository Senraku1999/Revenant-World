/**
 * Stop-Slop Scanner — 全项目 AI 写作痕迹检测
 * 覆盖 13 类模式，扫描角色卡 JSON/MD + World Info MD
 * 输出按阵营/等级/模式分组的结构化报告
 */
import * as fs from 'fs';
import * as path from 'path';

const BASE = process.cwd();
const CAMP_DIR = path.join(BASE, '角色卡');
const WORLD_INFO_DIR = path.join(BASE, '创作者文件/导出文件/world info');

// ─── 类型定义 ───
interface Hit {
  file: string;
  field: string;       // JSON field path or MD section
  context: string;     // matched text snippet (max 80 chars)
  pattern: string;     // e.g. "A-副词堆砌"
  level: 'T0' | 'T1' | 'T2';
}

interface FileResult {
  file: string;
  camp: string;
  character: string;
  fileType: string;
  hits: Hit[];
}

// ─── T0 模式 ───

// A: 副词堆砌 — 关键词列表，单文件 ≥3 处即命中
const ADVERB_PATTERNS = [
  '缓缓', '轻轻', '渐渐', '深深', '慢慢', '悄悄', '静静', '微微', '淡淡', '默默',
  '徐徐', '冉冉', '幽幽', '隐隐', '阵阵', '漫漫', '层层', '沉沉', '蒙蒙', '袅袅'
];
const ADVERB_REGEX = new RegExp(ADVERB_PATTERNS.join('|'), 'g');

// B: 二元对立句式
const BINARY_PATTERNS: { regex: RegExp; label: string }[] = [
  { regex: /不是.{0,30}而是/g, label: '不是…而是…' },
  { regex: /没有.{0,30}只有/g, label: '没有…只有…' },
  { regex: /rather\s+than/gi, label: 'rather than' },
  { regex: /\bnot\b.{1,20},?\s*\bbut\b/gi, label: 'not…but' },
];

// C: 模糊宣告句
const VAGUE_PATTERNS = [
  '没有人知道', '没人知道', '无人知晓', '谁也不', '谁都不',
  '时间会证明', '命运早已注定', '命运注定', '谁也说不清',
  '只有时间', '上天注定', '冥冥之中', '天意',
];

// D: 虚假施动（候选检测）— 放宽匹配距离，允许修饰语在主语前
const FALSE_AGENCY_PATTERNS = [
  // 空气/气氛 + 主动动词
  { regex: /空[气氛].{0,20}(?:凝固|冻结|沉[重闷]|压抑|变得|停止了|凝滞)/g, label: '空气/气氛拟人' },
  // 沉默/寂静/安静 + 蔓延/笼罩/弥漫
  { regex: /(?:沉默|寂静|安静|死寂).{0,20}(?:蔓延|笼罩|弥漫|扩散|降临|袭来|吞没|覆盖)/g, label: '沉默/寂静拟人' },
  // 气味 + 互不相让/碰撞/打架（放宽距离）
  { regex: /气味.{0,30}(?:互不相让|碰撞|打架|纠缠|交织|搏斗)/g, label: '气味拟人' },
  { regex: /(?:消毒水|焚香|铁锈|血腥|霉味|香水).{0,30}(?:互不相让|碰撞|打架|纠缠|交织)/g, label: '具体气味拟人' },
  // 时间 + 凝固/停止
  { regex: /时间.{0,15}(?:凝固|停滞|静止|冻结|停止了|仿佛停)/g, label: '时间拟人' },
  // 寒意 + 爬/蔓延/侵袭
  { regex: /寒意.{0,20}(?:爬|攀|蔓延|侵袭|渗入|钻入)/g, label: '寒意拟人' },
  // 恐惧 + 蔓延/扩散/抓住
  { regex: /恐惧.{0,20}(?:蔓延|扩散|笼罩|抓住|攥住|攫住)/g, label: '恐惧拟人' },
  // 黑暗/夜色/阴影 + 吞噬/笼罩/吞没
  { regex: /(?:黑暗|夜色|阴影|夜幕).{0,20}(?:吞噬|笼罩|吞没|覆盖|压下|逼近)/g, label: '黑暗/夜色拟人' },
  // 风/光/声 + 主动情感动词
  { regex: /(?:风|灯光|月光|声[音响]).{0,15}(?:低语|哭泣|叹息|咆哮|诉说|抚摸|亲吻)/g, label: '风/光/声拟人' },
  // 建筑/空间 + 沉默/注视/承受
  { regex: /(?:墙壁|地板|天花板|走廊|房间).{0,20}(?:沉默|注视|聆听|记住|承受|吞下)/g, label: '建筑拟人' },
  // 灵力/回路 + 自主行为
  { regex: /(?:灵力|回路|灵压).{0,15}(?:咆哮|怒吼|颤动|暴走|苏醒|沉睡)/g, label: '灵力拟人' },
];

// ─── T1 模式 ───

// E: 形容词堆叠 — 连续 "的" 在短距离内（候选）
const ADJ_STACK_REGEX = /(?:.{0,5}的){3,}/g;

// F: 被动过度 — 单段 ≥3 处 "被"
const PASSIVE_REGEX = /被/g;

// G: Wh-句式
const WH_PATTERNS = [
  { regex: /当.{0,30}时[，,]/g, label: '当…时' },
  { regex: /当.{0,30}的时候/g, label: '当…的时候' },
  { regex: /随着.{0,30}[，,]/g, label: '随着…' },
  { regex: /在.{0,30}中[，,]/g, label: '在…中' },
  { regex: /在.{0,30}下[，,]/g, label: '在…下' },
];

// H: 三段式列举
const TRIAD_PATTERNS = [
  { regex: /[，,]\s*(?:三者|三个|三种|三类|三件|三样|三项|三条)/g, label: 'A、B、C，三者' },
  { regex: /(?:三者|三个|三种|三类|三件|三样|三项|三条)[都均皆]/g, label: '三者都…' },
];

// I: 过度概括（绝对化措辞）
const ABSOLUTE_PATTERNS = [
  '从不', '从未', '永远', '总是', '始终', '绝不', '绝无', '决不会',
  '所有', '任何', '每一次', '每次', '无论如何', '无一例外',
  '毫无', '丝毫不', '不论', '不管',
];

// ─── T2 模式 ───

// J: 句式单调 — 连续 ≥5 句同一主语（候选，极难自动化）

// K: "那种X"公式
const NAZHONG_REGEX = /那种.{0,20}(?:的|让人|说不出)/g;

// L: 通用措辞
const GENERIC_PATTERNS = [
  '莫名的', '难以言喻的', '不可思议的', '某种',
  '说不出的', '无可名状的', '难以名状的', '难以言说的',
  '不可名状的', '难以形容的',
];

// M: AI腔比喻
const AI_METAPHOR_PATTERNS = [
  /如.{1,6}般/g,
  /像.{1,10}(?:融进|融入|流进)/g,
  /仿佛.{1,6}般/g,
];

// ─── 工具函数 ───

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(BASE + '/', '');
}

function extractContext(text: string, pos: number, len: number = 60): string {
  const start = Math.max(0, pos - len / 2);
  const end = Math.min(text.length, pos + len / 2);
  let ctx = text.slice(start, end);
  if (start > 0) ctx = '…' + ctx;
  if (end < text.length) ctx = ctx + '…';
  return ctx.replace(/\n/g, '↵').trim();
}

function scanText(
  text: string, file: string, camp: string, character: string,
  fileType: string, field: string
): Hit[] {
  const hits: Hit[] = [];

  // ── T0-A: 副词堆砌 ──
  const advMatches = text.match(ADVERB_REGEX);
  if (advMatches && advMatches.length >= 3) {
    // Group by word
    const counts: Record<string, number> = {};
    for (const m of advMatches) counts[m] = (counts[m] || 0) + 1;
    const summary = Object.entries(counts).map(([k, v]) => `${k}(${v})`).join('、');
    hits.push({
      file, field,
      context: summary,
      pattern: 'A-副词堆砌',
      level: 'T0',
    });
  }

  // ── T0-B: 二元对立句式 ──
  for (const { regex, label } of BINARY_PATTERNS) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      hits.push({
        file, field,
        context: extractContext(text, m.index, 60),
        pattern: `B-二元对立(${label})`,
        level: 'T0',
      });
    }
  }

  // ── T0-C: 模糊宣告句 ──
  for (const pat of VAGUE_PATTERNS) {
    let idx = 0;
    while ((idx = text.indexOf(pat, idx)) !== -1) {
      hits.push({
        file, field,
        context: extractContext(text, idx, 50),
        pattern: `C-模糊宣告(${pat})`,
        level: 'T0',
      });
      idx += pat.length;
    }
  }

  // ── T0-D: 虚假施动 ──
  for (const { regex, label } of FALSE_AGENCY_PATTERNS) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      hits.push({
        file, field,
        context: extractContext(text, m.index, 60),
        pattern: `D-虚假施动(${label})`,
        level: 'T0',
      });
    }
  }

  // ── T1-E: 形容词堆叠 ──
  ADJ_STACK_REGEX.lastIndex = 0;
  let adjM: RegExpExecArray | null;
  while ((adjM = ADJ_STACK_REGEX.exec(text)) !== null) {
    hits.push({
      file, field,
      context: extractContext(text, adjM.index, 60),
      pattern: 'E-形容词堆叠(连续≥3个"的")',
      level: 'T1',
    });
  }

  // ── T1-F: 被动过度 ──
  // 按段落检测
  const paragraphs = text.split(/\n{2,}|(?<=[。！？.!?])\s*(?=\S)/);
  for (const para of paragraphs) {
    if (para.length < 20) continue;
    const beiCount = (para.match(PASSIVE_REGEX) || []).length;
    if (beiCount >= 3) {
      hits.push({
        file, field,
        context: extractContext(para, 0, 80) + ` [${beiCount}处"被"]`,
        pattern: 'F-被动过度',
        level: 'T1',
      });
    }
  }

  // ── T1-G: Wh-句式 ──
  for (const { regex, label } of WH_PATTERNS) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      hits.push({
        file, field,
        context: extractContext(text, m.index, 60),
        pattern: `G-Wh句式(${label})`,
        level: 'T1',
      });
    }
  }

  // ── T1-H: 三段式列举 ──
  for (const { regex, label } of TRIAD_PATTERNS) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      hits.push({
        file, field,
        context: extractContext(text, m.index, 50),
        pattern: `H-三段式列举(${label})`,
        level: 'T1',
      });
    }
  }

  // ── T1-I: 过度概括 ──
  for (const pat of ABSOLUTE_PATTERNS) {
    let idx = 0;
    let count = 0;
    while ((idx = text.indexOf(pat, idx)) !== -1) {
      count++;
      if (count >= 3) {
        hits.push({
          file, field,
          context: `"${pat}" 等≥3处绝对化措辞`,
          pattern: `I-过度概括(≥3处)`,
          level: 'T1',
        });
        break; // 一个文件每种模式只报一次
      }
      idx += pat.length;
    }
  }

  // ── T2-K: "那种X"公式 ──
  NAZHONG_REGEX.lastIndex = 0;
  let nzM: RegExpExecArray | null;
  while ((nzM = NAZHONG_REGEX.exec(text)) !== null) {
    hits.push({
      file, field,
      context: extractContext(text, nzM.index, 60),
      pattern: 'K-那种X公式',
      level: 'T2',
    });
  }

  // ── T2-L: 通用措辞 ──
  for (const pat of GENERIC_PATTERNS) {
    let idx = 0;
    while ((idx = text.indexOf(pat, idx)) !== -1) {
      hits.push({
        file, field,
        context: extractContext(text, idx, 50),
        pattern: `L-通用措辞(${pat})`,
        level: 'T2',
      });
      idx += pat.length;
    }
  }

  // ── T2-M: AI腔比喻 ──
  for (const regex of AI_METAPHOR_PATTERNS) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      hits.push({
        file, field,
        context: extractContext(text, m.index, 60),
        pattern: 'M-AI腔比喻',
        level: 'T2',
      });
    }
  }

  return hits;
}

// ─── JSON 文件扫描 ───
function scanJsonFile(filePath: string, camp: string, character: string): Hit[] {
  const allHits: Hit[] = [];
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch { return allHits; }

  let obj: any;
  try {
    obj = JSON.parse(raw);
  } catch { return allHits; }

  const fileType = filePath.endsWith('_zh.json') ? 'zh_json' : 'en_json';
  const relPath = normalizePath(filePath);

  function walk(node: any, prefix: string) {
    if (typeof node === 'string' && node.length > 5) {
      const hits = scanText(node, relPath, camp, character, fileType, prefix);
      allHits.push(...hits);
    } else if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${prefix}[${i}]`));
    } else if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        walk(node[key], prefix ? `${prefix}.${key}` : key);
      }
    }
  }
  walk(obj, '');
  return allHits;
}

// ─── MD 文件扫描 ───
function scanMdFile(filePath: string, camp: string, character: string): Hit[] {
  const allHits: Hit[] = [];
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch { return allHits; }

  const fileType = filePath.endsWith('开场白.md') ? 'opening' : 'intro';
  const relPath = normalizePath(filePath);

  // For MD files, scan the whole text with field = fileType
  const hits = scanText(raw, relPath, camp, character, fileType, fileType);
  allHits.push(...hits);
  return allHits;
}

// ─── 文件遍历 ───
function scanAll(): FileResult[] {
  const results: FileResult[] = [];

  // 角色卡目录
  if (fs.existsSync(CAMP_DIR)) {
    for (const campDir of fs.readdirSync(CAMP_DIR)) {
      const campPath = path.join(CAMP_DIR, campDir);
      if (!fs.statSync(campPath).isDirectory()) continue;

      for (const charDir of fs.readdirSync(campPath)) {
        const charPath = path.join(campPath, charDir);
        if (!fs.statSync(charPath).isDirectory()) continue;

        // 扫描所有 JSON 和 MD 文件
        for (const f of fs.readdirSync(charPath)) {
          const fp = path.join(charPath, f);
          if (!fs.statSync(fp).isFile()) continue;

          let hits: Hit[] = [];
          if (f.endsWith('.json')) {
            hits = scanJsonFile(fp, campDir, charDir);
          } else if (f.endsWith('.md')) {
            hits = scanMdFile(fp, campDir, charDir);
          }

          if (hits.length > 0) {
            results.push({
              file: normalizePath(fp),
              camp: campDir,
              character: charDir,
              fileType: f,
              hits,
            });
          }
        }
      }
    }
  }

  // World Info 目录
  if (fs.existsSync(WORLD_INFO_DIR)) {
    for (const f of fs.readdirSync(WORLD_INFO_DIR)) {
      if (!f.endsWith('.md')) continue;
      const fp = path.join(WORLD_INFO_DIR, f);
      const hits = scanMdFile(fp, 'WorldInfo', f.replace('.md', ''));
      if (hits.length > 0) {
        results.push({
          file: normalizePath(fp),
          camp: 'WorldInfo',
          character: f.replace('.md', ''),
          fileType: 'world_info',
          hits,
        });
      }
    }
  }

  return results;
}

// ─── 汇总输出 ───
function printReport(results: FileResult[]) {
  // 按阵营分组
  const byCamp: Record<string, FileResult[]> = {};
  for (const r of results) {
    (byCamp[r.camp] ??= []).push(r);
  }

  // 按等级分组
  const byLevel: Record<string, Hit[]> = { T0: [], T1: [], T2: [] };
  for (const r of results) {
    for (const h of r.hits) {
      byLevel[h.level].push(h);
    }
  }

  // 按模式分组
  const byPattern: Record<string, Hit[]> = {};
  for (const r of results) {
    for (const h of r.hits) {
      const pKey = h.pattern.split('(')[0]; // e.g. "A-副词堆砌"
      (byPattern[pKey] ??= []).push(h);
    }
  }

  // ── 输出 ──
  console.log('═══════════════════════════════════════════════');
  console.log('  狩灵世界观 Stop-Slop 审查报告');
  console.log('═══════════════════════════════════════════════\n');

  // 全局统计
  console.log('【全局统计】');
  console.log(`  扫描文件数: ${results.reduce((s, r) => s + 1, 0)}（${results.length} 个文件有命中）`);
  console.log(`  命中总数:   ${results.reduce((s, r) => s + r.hits.length, 0)}`);
  console.log(`  T0 (必须修复): ${byLevel.T0.length}`);
  console.log(`  T1 (建议修复): ${byLevel.T1.length}`);
  console.log(`  T2 (可选优化): ${byLevel.T2.length}`);
  console.log();

  // 模式分布
  console.log('【模式分布】');
  for (const [pattern, hits] of Object.entries(byPattern).sort()) {
    console.log(`  ${pattern}: ${hits.length}`);
  }
  console.log();

  // 按阵营输出
  const campOrder = [
    '协会狩灵角色卡', '事务所狩灵角色卡', '游魂角色卡', '罪灵角色卡',
    '锈钟角色卡', '工坊狩灵角色卡', '四色音角色卡', '异常角色卡',
    '事件卡', '世界观卡', 'WorldInfo'
  ];

  for (const campName of campOrder) {
    const campResults = byCamp[campName];
    if (!campResults || campResults.length === 0) {
      // Still print header for expected camps
      const knownCamps = campOrder.filter(c => c !== 'WorldInfo');
      if (campName === 'WorldInfo') {
        if (!campResults || campResults.length === 0) continue;
      } else if (!knownCamps.includes(campName)) continue;
      if (!campResults) continue;
    }

    console.log(`\n━━━ ${campName} ━━━`);

    for (const r of campResults) {
      const t0Hits = r.hits.filter(h => h.level === 'T0');
      const t1Hits = r.hits.filter(h => h.level === 'T1');
      const t2Hits = r.hits.filter(h => h.level === 'T2');

      console.log(`\n  ▸ ${r.character} (${r.fileType})`);

      const printLevel = (label: string, hits: Hit[]) => {
        if (hits.length === 0) return;
        console.log(`    ${label}:`);
        for (const h of hits) {
          console.log(`      [${h.pattern}] ${h.field}`);
          console.log(`        ${h.context}`);
        }
      };

      printLevel('T0 必须修复', t0Hits);
      printLevel('T1 建议修复', t1Hits);
      printLevel('T2 可选优化', t2Hits);
    }
  }

  // 高密度角色排行
  console.log('\n\n【高密度角色排行（Top 15）】');
  const charScores: { char: string; camp: string; total: number; t0: number; t1: number; t2: number }[] = [];
  const charMap: Record<string, { camp: string; total: number; t0: number; t1: number; t2: number }> = {};
  for (const r of results) {
    const key = `${r.camp}/${r.character}`;
    const entry = (charMap[key] ??= { camp: r.camp, total: 0, t0: 0, t1: 0, t2: 0 });
    for (const h of r.hits) {
      entry.total++;
      if (h.level === 'T0') entry.t0++;
      else if (h.level === 'T1') entry.t1++;
      else entry.t2++;
    }
  }
  const sorted = Object.entries(charMap)
    .map(([k, v]) => ({ char: k, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    console.log(`  ${i + 1}. ${s.char} — ${s.total} hits (T0:${s.t0} T1:${s.t1} T2:${s.t2})`);
  }

  // 修复优先级建议
  console.log('\n\n【修复优先级建议】');
  console.log('  1. 优先修复 T0 命中项，尤其是 B-二元对立 和 C-模糊宣告');
  console.log('  2. T1 中 F-被动过度 和 G-Wh句式 影响阅读节奏，建议次优先');
  console.log('  3. T2 可在例行维护中逐步优化');
  console.log('  4. 注意：D-虚假施动 和 E-形容词堆叠 为脚本候选检测，需人工复核');
  console.log('  5. J-句式单调 未纳入脚本，需另行人工审查');

  // 输出完整 JSON 到文件
  const jsonOutput = results.flatMap(r =>
    r.hits.map(h => ({
      camp: r.camp,
      character: r.character,
      fileType: r.fileType,
      file: r.file,
      field: h.field,
      context: h.context,
      pattern: h.pattern,
      level: h.level,
    }))
  );
  const outPath = path.join(BASE, 'stop-slop-results.json');
  fs.writeFileSync(outPath, JSON.stringify(jsonOutput, null, 2), 'utf-8');
  console.log(`\n\n详细结果已写入: ${outPath}`);
}

// ─── 主流程 ───
const results = scanAll();
printReport(results);

// 额外：输出未被脚本覆盖的模式的提醒
console.log('\n\n【未覆盖模式提醒】');
console.log('  J-句式单调: 需要人工逐段审查（连续≥5句同主语开头），脚本未覆盖');
console.log('  D-虚假施动: 脚本仅做常见模式候选检测，存在漏检，建议人工复核');
console.log('  E-形容词堆叠: 脚本仅检测连续≥3个"的"的候选模式，需人工复核');
