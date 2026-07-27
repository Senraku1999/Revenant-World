// ── 逻辑审查：全角色字段提取（JSON + 简介） ──
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname);
const CHAR_DIR = path.join(ROOT, '角色卡');

// 收集所有 JSON 文件（排除非角色卡目录）
const allJsonFiles: string[] = [];
function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.json')) allJsonFiles.push(full);
  }
}
walk(CHAR_DIR);

// 分类目录
const ROLE_CATEGORIES = ['事务所狩灵角色卡','协会狩灵角色卡','锈钟角色卡','罪灵角色卡','游魂角色卡','工坊狩灵角色卡','四色音角色卡','异常角色卡','世界观卡','事件卡'];

interface CharExtract {
  category: string;
  dir: string;
  name: string;
  // JSON
  char_name: string;
  char_fullname: string;
  char_alias: string;
  char_identity: string;
  char_rank: string;
  char_faction: string;
  char_status: string;
  gender: string;
  age: string;
  height: string;
  weight: string;
  hair: string;
  face: string;
  features: string;
  clothing: string;
  weapon: string;
  form: string; // 异常
  overview: string;
  origin: string;
  current_mission: string;
  core_traits: string;
  strengths: string;
  flaws: string;
  quirks: string;
  灵力: string;
  灵视: string;
  身体素质: string;
  special_ability_keys: string[];
  special_ability_values: string[];
  relationship_keys: string[];
  relationship_values: string[];
  dialogue_situations: string[];
  dialogue_responses: string[];

  // 简介提取
  intro_rank: string;
  intro_greeting: string;
  intro_evaluator: string;
  intro_name: string;
  intro_height: string;
  intro_weight: string;
  intro_hair: string;
  intro_face: string;
  intro_features: string;
  intro_clothing: string;
  intro_weapon: string;
  intro_combat_style: string;
  intro_sections: string[];

  // 开场白
  opening_token_count: number;

  has_intro: boolean;
  has_opening: boolean;
}

const results: CharExtract[] = [];

function extractJson(filePath: string): Partial<CharExtract> {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const j = JSON.parse(raw);
  // basic
  const ext: any = {};
  ext.char_name = j.char_name || '';
  ext.char_fullname = j.char_fullname || '';
  ext.char_alias = j.char_alias || '';
  ext.char_identity = j.char_identity || '';
  ext.char_rank = j.char_rank || '';
  ext.char_faction = j.char_faction || '';
  ext.char_status = j.char_status || '';

  const pa = j.char_persona || {};
  ext.gender = pa.gender || '';
  ext.age = String(pa.age ?? '');
  const ap = pa.appearance || {};
  ext.height = ap.height || '';
  ext.weight = ap.weight || '';
  ext.hair = ap.hair || '';
  ext.face = ap.face || '';
  ext.features = ap.features || '';
  ext.clothing = ap.clothing || '';
  ext.weapon = ap.weapon || '';
  ext.form = ap.form || '';

  const desc = j.char_description || {};
  ext.overview = desc.overview || '';
  ext.origin = desc.origin || '';
  ext.current_mission = desc.current_mission || '';

  const personality = j.char_personality || {};
  ext.core_traits = personality.core_traits || '';
  ext.strengths = personality.strengths || '';
  ext.flaws = personality.flaws || '';
  ext.quirks = personality.quirks || '';

  const basic = j.char_basic_abilities || {};
  ext.灵力 = basic['灵力'] || '';
  ext.灵视 = basic['灵视'] || '';
  ext.身体素质 = basic['身体素质'] || '';

  const sa = j.char_special_abilities;
  ext.special_ability_keys = sa ? Object.keys(sa) : [];
  ext.special_ability_values = sa ? Object.values(sa) : [];

  const rel = j.char_relationships || {};
  ext.relationship_keys = Object.keys(rel);
  ext.relationship_values = Object.values(rel).map((v: any) => String(v));

  const dia = j.char_dialogue_examples || [];
  ext.dialogue_situations = dia.map((d: any) => d.situation || '');
  ext.dialogue_responses = dia.map((d: any) => d.response || '');

  return ext;
}

function extractIntro(filePath: string): Partial<CharExtract> {
  const content = fs.readFileSync(filePath, 'utf-8');
  // 提取档案头（第一行）
  const lines = content.split('\n');
  const header = lines[0]?.trim() || '';

  // 提取一般称呼：档案头之后空行之后的第一个非空行
  let greeting = '';
  let inContent = false;
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l && !inContent) continue;
    if (!l && inContent) break;
    inContent = true;
    greeting = l;
    break;
  }

  // 提取评级
  const rankMatch = content.match(/综合评级[：:]\s*(.+)/);
  const introRank = rankMatch ? rankMatch[1].trim() : '';

  // 评估方
  const evalMatch = content.match(/评估方[：:]\s*(.+)/);
  const evaluator = evalMatch ? evalMatch[1].trim() : '';

  // 姓名
  const nameMatch = content.match(/姓名[：:]\s*(.+)/);
  const introName = nameMatch ? nameMatch[1].trim() : '';

  // 身高
  const heightMatch = content.match(/身高[：:]\s*(.+)/);
  const introHeight = heightMatch ? heightMatch[1].trim() : '';

  // 体重
  const weightMatch = content.match(/体重[：:]\s*(.+)/);
  const introWeight = weightMatch ? weightMatch[1].trim() : '';

  // 头发
  const hairMatch = content.match(/头发[：:]\s*(.+)/);
  const introHair = hairMatch ? hairMatch[1].trim() : '';

  // 瞳色
  const faceMatch = content.match(/瞳色[：:]\s*(.+)/);
  const introFace = faceMatch ? faceMatch[1].trim() : '';

  // 特征
  const featMatch = content.match(/特征[：:]\s*(.+)/);
  const introFeatures = featMatch ? featMatch[1].trim() : '';

  // 着装
  const clothMatch = content.match(/着装[：:]\s*(.+)/);
  const introClothing = clothMatch ? clothMatch[1].trim() : '';

  // 武器
  const weapMatch = content.match(/武器[：:]\s*(.+)/);
  const introWeapon = weapMatch ? weapMatch[1].trim() : '';

  // 战斗风格
  const combatMatch = content.match(/战斗风格[：:]\s*(.+)/);
  const introCombat = combatMatch ? combatMatch[1].trim() : '';

  // 大项序号
  const sectionPattern = /^(一、|二、|三、|四、|五、)/gm;
  const sections: string[] = [];
  let m;
  while ((m = sectionPattern.exec(content)) !== null) {
    sections.push(m[1]);
  }

  return {
    intro_rank: introRank,
    intro_greeting: greeting,
    intro_evaluator: evaluator,
    intro_name: introName,
    intro_height: introHeight,
    intro_weight: introWeight,
    intro_hair: introHair,
    intro_face: introFace,
    intro_features: introFeatures,
    intro_clothing: introClothing,
    intro_weapon: introWeapon,
    intro_combat_style: introCombat,
    intro_sections: sections,
  };
}

function countTokens(text: string): number {
  // 用简单的词数估算（项目使用 tiktoken cl100k_base，此处用字符/2.5 粗略估算）
  // 实际审查时需要精确计数，此处用于初步筛选
  return Math.round(text.length / 2.5);
}

// 主循环
for (const file of allJsonFiles) {
  const relPath = path.relative(CHAR_DIR, file);
  const parts = relPath.split(path.sep);
  const category = parts[0];
  const dir = parts.length > 2 ? parts[1] : '';
  const name = path.basename(file, '.json');

  const jsonExtract = extractJson(file);

  // 找对应简介
  const introPath = path.join(path.dirname(file), name + '简介.md');
  const hasIntro = fs.existsSync(introPath);
  const introExtract = hasIntro ? extractIntro(introPath) : {};

  // 找对应开场白
  const openingPath = path.join(path.dirname(file), name + '开场白.md');
  const hasOpening = fs.existsSync(openingPath);
  let openingTokens = 0;
  if (hasOpening) {
    const opContent = fs.readFileSync(openingPath, 'utf-8');
    openingTokens = countTokens(opContent);
  }

  results.push({
    category, dir, name,
    ...jsonExtract,
    ...introExtract,
    opening_token_count: openingTokens,
    has_intro: hasIntro,
    has_opening: hasOpening,
  } as CharExtract);
}

// 输出聚合表
console.log('='.repeat(80));
console.log('【表1：基础信息聚合】char_name | fullname | alias | identity | rank | faction | status');
console.log('='.repeat(80));
for (const r of results) {
  console.log(`${r.category}/${r.dir} | ${r.char_name} | ${r.char_fullname} | ${r.char_alias} | ${r.char_identity} | ${r.char_rank} | ${r.char_faction} | ${r.char_status}`);
}

console.log('\n' + '='.repeat(80));
console.log('【表2：人格特质聚合】core_traits | strengths | flaws | quirks');
console.log('='.repeat(80));
for (const r of results) {
  console.log(`[${r.char_name}] core_traits: ${r.core_traits}`);
  console.log(`  strengths: ${r.strengths}`);
  console.log(`  flaws: ${r.flaws}`);
  console.log(`  quirks: ${r.quirks}`);
}

console.log('\n' + '='.repeat(80));
console.log('【表3：基础能力聚合】灵力 | 灵视 | 身体素质');
console.log('='.repeat(80));
for (const r of results) {
  if (r.灵力 || r.灵视 || r.身体素质) {
    console.log(`[${r.char_name}] 灵力: ${r.灵力}`);
    console.log(`  灵视: ${r.灵视}`);
    console.log(`  身体素质: ${r.身体素质}`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('【表4：特殊能力聚合】keys');
console.log('='.repeat(80));
for (const r of results) {
  if (r.special_ability_keys.length > 0) {
    console.log(`[${r.char_name}] keys: ${r.special_ability_keys.join(' | ')}`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('【表5：关系聚合】keys');
console.log('='.repeat(80));
for (const r of results) {
  if (r.relationship_keys.length > 0) {
    const keys = r.relationship_keys.map(k => `"${k}"`).join(', ');
    console.log(`[${r.char_name}] (${r.relationship_keys.length}) ${keys}`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('【表6：JSON vs 简介 基础字段比对】');
console.log('='.repeat(80));
for (const r of results) {
  if (!r.has_intro) {
    console.log(`[${r.char_name}] 无简介文件`);
    continue;
  }
  const diffs: string[] = [];
  if (r.intro_name && r.intro_name !== r.char_fullname) diffs.push(`全名: JSON="${r.char_fullname}" vs 简介="${r.intro_name}"`);
  if (r.intro_height && r.intro_height !== r.height) diffs.push(`身高: JSON="${r.height}" vs 简介="${r.intro_height}"`);
  if (r.intro_weight && r.intro_weight !== r.weight) diffs.push(`体重: JSON="${r.weight}" vs 简介="${r.intro_weight}"`);

  // 评级比对 - 简介评级与 JSON char_rank
  if (r.intro_rank) {
    const jsonRank = r.char_rank;
    // 标准化：移除可能的差异后缀
    const normIntro = r.intro_rank.replace(/^评级[：:]\s*/, '').trim();
    if (normIntro !== jsonRank && !normIntro.startsWith(jsonRank)) {
      // 游魂 "无" vs "无"
      if (!(jsonRank === '无' && (normIntro === '无' || normIntro === '暂无'))) {
        diffs.push(`评级: JSON="${jsonRank}" vs 简介="${normIntro}"`);
      }
    }
  }
  if (r.intro_greeting && !r.intro_greeting.startsWith('档案编号') && r.char_alias !== 'None') {
    // 一般称呼检查
  }

  if (diffs.length > 0) {
    console.log(`[${r.char_name}] 差异: ${diffs.join(' | ')}`);
  } else {
    // console.log(`[${r.char_name}] 基础字段一致`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('【表7：评估方聚合】身份+从属 → 评估方');
console.log('='.repeat(80));
for (const r of results) {
  if (r.has_intro && r.intro_evaluator) {
    console.log(`[${r.char_name}] identity=${r.char_identity} | faction=${r.char_faction} | status=${r.char_status} → 评估方="${r.intro_evaluator}"`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('【表8：简介大项序号】');
console.log('='.repeat(80));
for (const r of results) {
  if (r.has_intro && r.intro_sections.length > 0) {
    console.log(`[${r.char_name}] 大项: ${r.intro_sections.join(' → ')}`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('【表9：开场白 Token 估算】');
console.log('='.repeat(80));
for (const r of results) {
  if (r.has_opening) {
    const status = r.opening_token_count >= 900 && r.opening_token_count <= 1100 ? 'OK' : '超标';
    console.log(`[${r.char_name}] 开场白 ~${r.opening_token_count} tokens ${status}`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('【表10：对话示例摘要】');
console.log('='.repeat(80));
for (const r of results) {
  if (r.dialogue_situations.length > 0) {
    console.log(`[${r.char_name}] ${r.dialogue_situations.length} 条对话`);
    for (let i = 0; i < r.dialogue_situations.length; i++) {
      const sit = r.dialogue_situations[i].substring(0, 80);
      const respPreview = r.dialogue_responses[i]?.substring(0, 120) || '';
      console.log(`  [${i+1}] situation: ${sit}`);
      console.log(`      response: ${respPreview}`);
    }
  }
}

// 写入完整 JSON 到文件供后续分析
fs.writeFileSync(path.join(ROOT, '_extract_full.json'), JSON.stringify(results, null, 2), 'utf-8');
console.log('\n完整提取结果已写入 _extract_full.json');
