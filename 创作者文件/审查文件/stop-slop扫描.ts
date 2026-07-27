/**
 * AI 写作痕迹 (stop-slop) 全项目扫描脚本
 * 13 类检测模式，T0/T1/T2 三级
 */
import * as fs from 'fs';
import * as path from 'path';

// ── 配置 ──
const TARGET_DIR = path.resolve(__dirname, '..', '..', '角色卡');
const EXCLUDE_DIRS = ['小说化内容'];

// ── 检测规则 ──
interface Rule {
  code: string;
  name: string;
  tier: 'T0' | 'T1' | 'T2';
  patterns: RegExp[];
  description: string;
}

const RULES: Rule[] = [
  // T0
  {
    code: 'A', name: '副词堆砌', tier: 'T0',
    patterns: [/缓缓|轻轻|渐渐|深深|微微|淡淡|静静|默默|悄悄|慢慢|隐隐/g],
    description: '>=3处/文件则命中',
  },
  {
    code: 'B', name: '二元对立句式', tier: 'T0',
    patterns: [/不是.{1,40}而是/g, /没有.{1,40}只有/g, /并非.{1,40}而是/g],
    description: '"不是X，而是Y""没有X，只有Y""并非X，而是Y"',
  },
  {
    code: 'C', name: '模糊宣告句', tier: 'T0',
    patterns: [/没有人知道/g, /没人知道/g, /时间会证明/g, /命运早已注定/g, /命运注定/g, /谁也不知道/g, /无人知晓/g],
    description: '"没有人知道X""时间会证明Y""命运早已注定"',
  },
  {
    code: 'D', name: '虚假施动', tier: 'T0',
    patterns: [/空气凝固/g, /沉默.{1,20}(蔓延|扩散|流淌)/g, /时间(仿佛|好像|似乎).{1,10}(停止|凝固)/g, /气氛.{1,10}(凝固|沉重|压抑)/g, /(悲伤|恐惧|紧张|不安).{1,10}(蔓延|扩散|弥漫|笼罩)/g],
    description: '非生命体拟人化："空气凝固""沉默蔓延"等',
  },
  // T1
  {
    code: 'E', name: '形容词堆叠', tier: 'T1',
    patterns: [/(?:的)(?:.{1,5}的){2,}/g],
    description: '连续>=3个"的"修饰（间接检测）',
  },
  {
    code: 'F', name: '被动过度', tier: 'T1',
    patterns: [/被/g],
    description: '单段内>=3处"被"字',
  },
  {
    code: 'G', name: 'Wh-句式泛滥', tier: 'T1',
    patterns: [/当.{1,30}时.{1,20}[，,]/g, /随着.{1,30}[，,]/g, /在.{1,30}中.{1,20}[，,]/g],
    description: '"当X时，Y""随着X，Y""在X中，Y"',
  },
  {
    code: 'H', name: '三段式列举', tier: 'T1',
    patterns: [/[，,]?\s*(?:三者|三个|三种|三样|三重)/g],
    description: '"A、B、C，三者"句式',
  },
  {
    code: 'I', name: '过度概括', tier: 'T1',
    patterns: [/从不/g, /永远(?!站|地下|的|者)/g, /所有.{0,10}[人都]/g, /任何.{0,5}[事人]/g, /每一次/g, /从来/g, /绝对不/g, /毫无/g],
    description: '"从不""永远""所有""任何""每一次"等绝对化措辞',
  },
  // T2
  {
    code: 'J', name: '句式单调', tier: 'T2',
    patterns: [], // 需要句子边界分析，手工检测
    description: '连续>=5句以同一主语开头（需手工检测）',
  },
  {
    code: 'K', name: '"那种X"公式', tier: 'T2',
    patterns: [/那种.{1,30}的/g, /那种.{1,20}[，,]/g],
    description: '"那种让人Y的X""那种说不出的Z"',
  },
  {
    code: 'L', name: '通用措辞', tier: 'T2',
    patterns: [/莫名的/g, /难以言喻的/g, /不可思议的/g, /某种.{1,10}[的感气]/g, /某种/g, /说不出的/g, /难以名状的/g, /不可名状的/g],
    description: '"莫名的""难以言喻的""不可思议的""某种"',
  },
  {
    code: 'M', name: 'AI腔比喻', tier: 'T2',
    patterns: [/如.{1,10}般/g, /像.{1,15}一样/g, /仿佛.{1,15}一般/g],
    description: '"如活物般""如银蛇般""像一滴水融进河流"',
  },
];

// ── 文件收集 ──
function collectFiles(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.includes(entry.name)) {
        results.push(...collectFiles(full, exts));
      }
    } else if (exts.some(e => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

// ── 扫描 ──
interface Hit {
  file: string;
  code: string;
  tier: string;
  field?: string;
  snippet?: string;
  line?: number;
}

function scanFile(filePath: string): Hit[] {
  const hits: Hit[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath);
  const basename = path.basename(filePath);

  // 只对中文文本字段扫描
  let textBlocks: { field: string; text: string; startLine: number }[] = [];

  if (ext === '.json') {
    try {
      const obj = JSON.parse(content);
      // 提取所有中文字段值
      function extractTexts(o: unknown, prefix: string, lineOffset: number): void {
        if (typeof o === 'string') {
          // 判断是否含中文
          if (/[一-鿿]/.test(o)) {
            textBlocks.push({ field: prefix, text: o, startLine: lineOffset });
          }
        } else if (Array.isArray(o)) {
          o.forEach((item, i) => {
            extractTexts(item, `${prefix}[${i}]`, lineOffset);
          });
        } else if (o !== null && typeof o === 'object') {
          for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
            extractTexts(v, prefix ? `${prefix}.${k}` : k, lineOffset);
          }
        }
      }
      extractTexts(obj, '', 1);
    } catch {
      // JSON parse error — scan raw content
      textBlocks.push({ field: 'raw', text: content, startLine: 1 });
    }
  } else {
    // .md files
    textBlocks.push({ field: 'body', text: content, startLine: 1 });
  }

  for (const block of textBlocks) {
    for (const rule of RULES) {
      for (const pattern of rule.patterns) {
        // Reset lastIndex for global regex
        pattern.lastIndex = 0;
        const matches: RegExpExecArray[] = [];
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(block.text)) !== null) {
          matches.push(m);
        }

        // A-副词堆砌需计数
        if (rule.code === 'A') {
          if (matches.length >= 3) {
            hits.push({
              file: filePath,
              code: 'A',
              tier: 'T0',
              field: block.field,
              snippet: `${matches.length}处副词堆砌: ${matches.map(m => m[0]).join(', ')}`,
            });
          }
        } else if (rule.code === 'F') {
          // F-被动过度：需按段计数，这里简化：文件总"被"数 >= 5 标记
          if (matches.length >= 5) {
            hits.push({
              file: filePath,
              code: 'F',
              tier: 'T1',
              field: block.field,
              snippet: `${matches.length}处"被"字`,
            });
          }
        } else if (rule.code === 'E') {
          // 形容词堆叠检测
          if (matches.length > 0) {
            hits.push({
              file: filePath,
              code: 'E',
              tier: 'T1',
              field: block.field,
              snippet: `${matches.length}处连续"的"堆叠: ${matches.slice(0, 3).map(m => m[0]).join(', ')}`,
            });
          }
        } else {
          // 其他直接命中
          for (const match of matches) {
            hits.push({
              file: filePath,
              code: rule.code,
              tier: rule.tier,
              field: block.field,
              snippet: match[0],
            });
          }
        }
      }
    }
  }

  return hits;
}

// ── 主流程 ──
const allFiles = collectFiles(TARGET_DIR, ['.json', '.md']);
console.log(`扫描文件总数: ${allFiles.length}`);

const allHits: Hit[] = [];
for (const file of allFiles) {
  const hits = scanFile(file);
  allHits.push(...hits);
}

// ── 按阵营分组 ──
function getFaction(filePath: string): string {
  const rel = path.relative(TARGET_DIR, filePath);
  const parts = rel.split(path.sep);
  if (parts.length > 0) return parts[0];
  return 'unknown';
}

const byFaction: Map<string, Hit[]> = new Map();
for (const hit of allHits) {
  const faction = getFaction(hit.file);
  if (!byFaction.has(faction)) byFaction.set(faction, []);
  byFaction.get(faction)!.push(hit);
}

// ── 输出 ──
console.log(`\n========== AI 写作痕迹扫描结果 ==========`);
console.log(`总命中数: ${allHits.length}\n`);

// 排序阵营名
const sortedFactions = [...byFaction.keys()].sort();
for (const faction of sortedFactions) {
  const hits = byFaction.get(faction)!;
  // 按 T0 → T1 → T2 排序
  const tierOrder = { T0: 0, T1: 1, T2: 2 };
  hits.sort((a, b) => tierOrder[a.tier as keyof typeof tierOrder] - tierOrder[b.tier as keyof typeof tierOrder]
    || a.code.localeCompare(b.code));

  console.log(`\n─── ${faction} (${hits.length}命中) ───`);

  // 去重合并同文件同类
  const grouped = new Map<string, Hit[]>();
  for (const hit of hits) {
    const key = `${hit.file}|${hit.code}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(hit);
  }

  for (const [key, groupHits] of grouped) {
    const first = groupHits[0];
    const shortFile = path.relative(TARGET_DIR, first.file);
    const snippets = [...new Set(groupHits.map(h => h.snippet))].filter(Boolean);
    const snippetStr = snippets.slice(0, 5).join(' / ');
    console.log(`  ${shortFile}`);
    console.log(`    -> ${first.code} ${first.tier} | ${first.field || '?'} | ${snippetStr}`);
  }
}

// T0/T1/T2 统计
const t0 = allHits.filter(h => h.tier === 'T0').length;
const t1 = allHits.filter(h => h.tier === 'T1').length;
const t2 = allHits.filter(h => h.tier === 'T2').length;
console.log(`\n========== 分级统计 ==========`);
console.log(`T0 (必须修复): ${t0}`);
console.log(`T1 (建议修复): ${t1}`);
console.log(`T2 (可选优化): ${t2}`);

// ── 按文件统计 (用于 J-句式单调 手工检测提示) ──
console.log(`\n========== 需手工检测项 ==========`);
console.log(`J-句式单调: 需人工逐角色检查连续5句以相同主语开头`);
