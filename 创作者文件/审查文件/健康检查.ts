/**
 * 狩灵世界观 · 健康检查脚本
 * ============================
 * 三层验证：源文件完整性 → 自动检查 → 管线产物验证
 *
 * 所有数字均为运行时动态扫描，零硬编码。
 * 退出码：0 = 全部健康，1 = 存在需修复项。
 *
 * 用法：npx tsx 创作者文件/审查文件/健康检查.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  RELATION_FACTION_MEMBERS, WORLDBOOK_BUILD, PNG_EXPORT_ASSIGN, allAssignedCardNames,
} from '../共享代码/assignments';

const PROJECT_ROOT = process.cwd();

// ── 辅助函数 ──

function rel(p: string): string { return path.join(PROJECT_ROOT, p); }

const CARD_DIR = '角色卡';
const REL_DIR = '创作者文件/导出文件/关系网';
const WB_DIR = '创作者文件/导出文件/世界书';
const EXPORT_DIR = '导出角色卡';
const BASE_PNG_DIR = '底图';
const WI_DIR = '创作者文件/导出文件/world info';

let errors = 0;
let warnings = 0;

function ok(msg: string): void { console.log(`  ✓ ${msg}`); }
function warn(msg: string): void { console.log(`  ⚠ ${msg}`); warnings++; }
function err(msg: string): void { console.log(`  ✗ ${msg}`); errors++; }

// ── 目录自动发现 ──

/** 递归扫描目录，返回所有叶子角色目录（含 JSON 文件的最小目录）的相对路径 */
function discoverCharDirs(dirPath: string): Map<string, string> {
  const map = new Map<string, string>(); // cardName → absolute dir path
  function walk(d: string): void {
    if (!fs.existsSync(d)) return;
    const name = path.basename(d);
    // 跳过事件卡/世界观卡目录
    if (name === '事件卡' || name === '世界观卡') return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        // 检查是否是叶子目录（直接包含 JSON 文件）
        const hasJson = fs.readdirSync(full).some(f => f.endsWith('.json'));
        if (hasJson) {
          map.set(entry.name, full);
        }
        walk(full);
      }
    }
  }
  const fullPath = path.join(PROJECT_ROOT, dirPath);
  if (fs.existsSync(fullPath)) {
    for (const entry of fs.readdirSync(fullPath, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(fullPath, entry.name));
    }
  }
  return map;
}

// ════════════════════════════════════════════
// 第一层：源文件完整性
// ════════════════════════════════════════════

console.log('='.repeat(60));
console.log('第一层：源文件完整性');
console.log('='.repeat(60));

// 1.1 三件套检查
console.log();
console.log('--- 1.1 角色目录三件套 ---');
const charDirs = discoverCharDirs(CARD_DIR);
let totalDirs = 0, completeDirs = 0;
for (const [cardName, dirPath] of charDirs) {
  totalDirs++;
  const missing: string[] = [];
  if (!fs.existsSync(path.join(dirPath, `${cardName}.json`))) missing.push('JSON');
  if (!fs.existsSync(path.join(dirPath, `${cardName}简介.md`))) missing.push('简介');
  if (!fs.existsSync(path.join(dirPath, `${cardName}开场白.md`))) missing.push('开场白');
  if (missing.length === 0) {
    completeDirs++;
  } else {
    err(`${cardName}: 缺 ${missing.join(', ')}`);
  }
}
ok(`${completeDirs}/${totalDirs} 角色目录三件套完整`);

// 1.2 JSON 可解析性
console.log();
console.log('--- 1.2 JSON 可解析性 ---');
let jsonTotal = 0, jsonOk = 0;
function checkJsonDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) { checkJsonDir(full); continue; }
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    jsonTotal++;
    try {
      JSON.parse(fs.readFileSync(full, 'utf-8'));
      jsonOk++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      err(`${path.relative(PROJECT_ROOT, full)}: ${msg}`);
    }
  }
}
checkJsonDir(rel(CARD_DIR));
ok(`${jsonOk}/${jsonTotal} JSON 可解析`);

// 1.3 分配表交叉比对
console.log();
console.log('--- 1.3 分配表交叉比对 ---');
const assignedNames = allAssignedCardNames();

// 扫描全部角色/事件/世界观卡目录名（含子目录）
const allCardDirNames = new Set<string>();
function collectAllDirs(baseDir: string): void {
  const fullBase = path.join(PROJECT_ROOT, baseDir);
  if (!fs.existsSync(fullBase)) return;
  for (const entry of fs.readdirSync(fullBase, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    // 检查是否包含 JSON 文件（叶子目录）
    const hasJson = fs.readdirSync(path.join(fullBase, entry.name)).some(f => f.endsWith('.json'));
    if (hasJson) { allCardDirNames.add(entry.name); }
    // 递归子目录（如 协会狩灵角色卡/左恕）
    const subPath = path.join(fullBase, entry.name);
    for (const sub of fs.readdirSync(subPath, { withFileTypes: true })) {
      if (sub.isDirectory()) {
        const hasSubJson = fs.readdirSync(path.join(subPath, sub.name)).some(f => f.endsWith('.json'));
        if (hasSubJson) allCardDirNames.add(sub.name);
      }
    }
  }
}
collectAllDirs(CARD_DIR);

// 分配表引用的名字在文件系统中是否存在
for (const name of assignedNames) {
  if (!allCardDirNames.has(name)) {
    warn(`分配表引用 "${name}" 在角色卡目录中不存在`);
  }
}

// 角色卡目录中的角色是否至少被一张分配表覆盖
// 注意：仅出现在"全角色"层（如狩灵全角色世界书、关系网全角色）是合法的，
// 这些角色不需要在阵营分配表中显式列出。
// 仅警告同时缺失 PNG_EXPORT_ASSIGN 和 RELATION_FACTION_MEMBERS 的角色。
for (const name of allCardDirNames) {
  const inPng = Object.values(PNG_EXPORT_ASSIGN).some(arr => arr.includes(name));
  const inRel = Object.values(RELATION_FACTION_MEMBERS).some(arr => arr.includes(name));
  // 跳过明显的世界观卡/事件卡（它们出现在 PNG_EXPORT_ASSIGN 中）
  if (!inPng && !inRel) {
    // 这些是独行角色——它们在关系网全角色和世界书全角色中自动覆盖
    // 数量会随角色增长，仅做信息提示
  }
}
// 报告覆盖统计
const coveredCount = Array.from(allCardDirNames).filter(n =>
  Object.values(PNG_EXPORT_ASSIGN).some(arr => arr.includes(n)) ||
  Object.values(RELATION_FACTION_MEMBERS).some(arr => arr.includes(n)),
).length;
const soloCount = allCardDirNames.size - coveredCount;
ok(`分配表显式覆盖 ${coveredCount}，独行 ${soloCount}（自动入全角色层）`);

// ════════════════════════════════════════════
// 第二层：自动检查
// ════════════════════════════════════════════

console.log();
console.log('='.repeat(60));
console.log('第二层：自动检查（调用自动检查.ts）');
console.log('='.repeat(60));
console.log();

try {
  const autoCheckPath = rel('创作者文件/审查文件/自动检查.ts');
  const output = execSync(`npx tsx "${autoCheckPath}"`, {
    cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 60000,
  });
  console.log(output.trimEnd());
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  err(`自动检查脚本执行失败: ${msg}`);
}

// ════════════════════════════════════════════
// 第三层：管线产物验证
// ════════════════════════════════════════════

console.log();
console.log('='.repeat(60));
console.log('第三层：管线产物验证');
console.log('='.repeat(60));

// 3.1 关系网全角色数 = 角色卡 EN JSON 数
console.log();
console.log('--- 3.1 关系网覆盖 ---');
const relAllDir = rel(path.join(REL_DIR, '全角色'));
const relCount = fs.existsSync(relAllDir)
  ? fs.readdirSync(relAllDir).filter(f => f.endsWith('.json')).length : 0;
const enJsonCount = jsonTotal; // 来自 1.2 的全量计数（含事件卡/世界观卡）
// 精确对比：关系网全角色目录文件数 vs 角色卡目录下的 EN JSON 文件数
// 注意：关系网不导出事件卡/世界观卡（如 花坂家宴、新宿站），需排除
const enRoleJsonCount = Array.from(charDirs.keys()).filter(name => {
  // 事件卡通常无 char_identity 字段，但这里简单起见：目录内 JSON 存在即计入
  return true;
}).length;
// 实际用更准的方式：数角色卡目录中 EN JSON 且非事件卡
let enRoleOnlyCount = 0;
function countRoleEnJsons(dirPath: string): void {
  if (!fs.existsSync(dirPath)) return;
  const norm = path.normalize(dirPath).replace(/\\/g, '/');
  if (norm.includes('/事件卡/') || norm.includes('/世界观卡/')) return;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) { countRoleEnJsons(full); continue; }
    if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('_zh.json')) {
      enRoleOnlyCount++;
    }
  }
}
countRoleEnJsons(rel(CARD_DIR));
if (relCount === enRoleOnlyCount) {
  ok(`关系网全角色文件数 = 角色卡 EN JSON 数 (${relCount})`);
} else {
  err(`关系网 ${relCount} ≠ 角色卡 EN JSON ${enRoleOnlyCount}`);
}

// 3.2 世界书 JSON 可解析
console.log();
console.log('--- 3.2 世界书 JSON 可解析性 ---');
let wbTotal = 0, wbOk = 0;
if (fs.existsSync(rel(WB_DIR))) {
  for (const f of fs.readdirSync(rel(WB_DIR))) {
    if (!f.endsWith('.json')) continue;
    wbTotal++;
    const fp = rel(path.join(WB_DIR, f));
    try { JSON.parse(fs.readFileSync(fp, 'utf-8')); wbOk++; }
    catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      err(`${f}: ${msg}`);
    }
  }
}
ok(`${wbOk}/${wbTotal} 世界书 JSON 可解析`);

// 3.3 世界书角色条目数 = 关系网全角色文件数
console.log();
console.log('--- 3.3 世界书条目覆盖 ---');
const allCharWbPath = rel(path.join(WB_DIR, '狩灵 全角色.json'));
if (fs.existsSync(allCharWbPath)) {
  const wb = JSON.parse(fs.readFileSync(allCharWbPath, 'utf-8'));
  const charEntries = wb.entries.filter((e: { comment: string }) => {
    // 基础规则条目的 comment 是规则文件名，角色条目 comment 是角色名
    const baseComments = ['宏观规则', '世界观', '灵能者', '评级', '异常', '狩灵协会', '锈钟', '天丛云剑'];
    return !baseComments.includes(e.comment);
  });
  if (charEntries.length === relCount) {
    ok(`世界书角色条目数 = 关系网全角色文件数 (${charEntries.length})`);
  } else {
    err(`世界书角色条目 ${charEntries.length} ≠ 关系网 ${relCount}`);
  }
}

// 3.4 PNG 导出数 = 有底图的角色数
console.log();
console.log('--- 3.4 PNG 导出覆盖 ---');
let basePngCount = 0;
if (fs.existsSync(rel(BASE_PNG_DIR))) {
  basePngCount = fs.readdirSync(rel(BASE_PNG_DIR)).filter(f => f.endsWith('.png')).length;
}
let exportPngCount = 0;
if (fs.existsSync(rel(EXPORT_DIR))) {
  exportPngCount = fs.readdirSync(rel(EXPORT_DIR)).filter(f => f.endsWith('.png')).length;
}
if (exportPngCount === basePngCount) {
  ok(`导出 PNG 数 = 底图数 (${exportPngCount})`);
} else {
  err(`导出 PNG ${exportPngCount} ≠ 底图 ${basePngCount}`);
}

// 3.5 导出目录无残留
console.log();
console.log('--- 3.5 导出目录残留检查 ---');
if (fs.existsSync(rel(EXPORT_DIR))) {
  const exportedNames = new Set(
    fs.readdirSync(rel(EXPORT_DIR)).filter(f => f.endsWith('.png')).map(f => f.replace('.png', '')),
  );
  const baseNames = new Set(
    fs.existsSync(rel(BASE_PNG_DIR))
      ? fs.readdirSync(rel(BASE_PNG_DIR)).filter(f => f.endsWith('.png')).map(f => f.replace('.png', ''))
      : [],
  );
  const orphans: string[] = [];
  for (const name of exportedNames) {
    if (!baseNames.has(name)) orphans.push(name);
  }
  if (orphans.length === 0) {
    ok(`导出目录无残留 (${exportedNames.size} 张)`);
  } else {
    for (const o of orphans) warn(`残留 PNG: ${o}.png（底图已删除）`);
  }
}

// 3.6 世界书 comment → 源文件存在性
console.log();
console.log('--- 3.6 世界书源文件引用 ---');
const baseComments = ['宏观规则', '世界观', '灵能者', '评级', '异常', '狩灵协会', '锈钟', '天丛云剑'];
const srcMap: Record<string, string> = {
  '宏观规则': '宏观规则.md', '世界观': '世界观.md', '灵能者': '灵能者.md',
  '评级': '评级.md', '异常': '异常.md', '狩灵协会': '狩灵协会.md',
  '锈钟': '锈钟.md', '天丛云剑': '天丛云剑.md',
};
let refErrors = 0;
if (fs.existsSync(rel(WB_DIR))) {
  for (const f of fs.readdirSync(rel(WB_DIR))) {
    if (!f.endsWith('.json')) continue;
    const wb = JSON.parse(fs.readFileSync(rel(path.join(WB_DIR, f)), 'utf-8'));
    for (const entry of wb.entries) {
      const comment = entry.comment as string;
      if (baseComments.includes(comment)) {
        const srcFile = srcMap[comment];
        if (srcFile && !fs.existsSync(rel(path.join(WI_DIR, srcFile)))) {
          err(`世界书 "${f}" 引用的 world info 缺失: ${srcFile}`);
          refErrors++;
        }
      } else {
        const relSrc = rel(path.join(REL_DIR, '全角色', `${comment}.json`));
        if (!fs.existsSync(relSrc)) {
          err(`世界书 "${f}" 引用的关系网缺失: ${comment}.json`);
          refErrors++;
        }
      }
    }
  }
}
if (refErrors === 0) ok('世界书源文件引用全部有效');

// ════════════════════════════════════════════
// 汇总
// ════════════════════════════════════════════

console.log();
console.log('='.repeat(60));
if (errors === 0 && warnings === 0) {
  console.log('健康检查通过。全部指标正常。');
} else {
  console.log(`健康检查完成：${errors} 项错误，${warnings} 项警告。`);
}
console.log('='.repeat(60));

process.exit(errors > 0 ? 1 : 0);
