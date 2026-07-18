// ── 文件遍历与发现 ──

import * as fs from 'fs';
import * as path from 'path';
import { normalizePath } from './utils';

/** 默认排除目录（新增排除项时同步一级/二级/自动检查的共用引用） */
export const EXCLUDE_DIRS = new Set(['.git', '.claude', 'node_modules', '.obsidian']);

/** 递归遍历目录，返回 .md 和 .json 文件绝对路径 */
export function findMdJsonFiles(rootDirs: string[], excludeDirs: Set<string> = EXCLUDE_DIRS): string[] {
  const files: string[] = [];
  for (const root of rootDirs) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) continue;
    walkSync(root, files, excludeDirs);
  }
  return files;
}

/** 递归遍历目录 */
function walkSync(dir: string, results: string[], excludeDirs: Set<string>): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (excludeDirs.has(entry.name)) continue;
      walkSync(fullPath, results, excludeDirs);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === '.md' || ext === '.json') {
        results.push(fullPath);
      }
    }
  }
}

/** 查找角色卡 JSON 文件（排除事件卡/世界观卡/关系网/世界书/_zh） */
export function findCharacterCardJsonFiles(projectRoot: string): string[] {
  const cardDir = path.join(projectRoot, '角色卡');
  if (!fs.existsSync(cardDir)) return [];

  const results: string[] = [];
  walkFiltered(cardDir, results, (fullPath) => {
    const base = path.basename(fullPath);
    if (!base.endsWith('.json') || base.endsWith('_zh.json')) return false;
    const norm = normalizePath(path.dirname(fullPath));
    if (norm.includes('事件卡') || norm.includes('世界观卡') || norm.includes('关系网') || norm.includes('世界书')) return false;
    // 仅角色卡子目录
    const validDirs = ['协会狩灵角色卡', '事务所狩灵角色卡', '游魂角色卡', '罪灵角色卡', '锈钟角色卡', '工坊狩灵角色卡', '四色音角色卡'];
    return validDirs.some(d => norm.includes(d));
  });
  return results;
}

/** 查找指定后缀的角色卡 MD 文件 */
function findMdBySuffix(projectRoot: string, suffix: string): string[] {
  const cardDir = path.join(projectRoot, '角色卡');
  const results: string[] = [];
  walkFiltered(cardDir, results, (fullPath) => {
    if (!fullPath.endsWith(suffix)) return false;
    const norm = normalizePath(path.dirname(fullPath));
    if (norm.includes('事件卡') || norm.includes('世界观卡') || norm.includes('异常角色卡')) return false;
    return true;
  });
  return results;
}

export const findIntroMdFiles = (root: string) => findMdBySuffix(root, '简介.md');
export const findOpeningMdFiles = (root: string) => findMdBySuffix(root, '开场白.md');

/** 带过滤条件的递归遍历 */
function walkFiltered(dir: string, results: string[], filter: (fullPath: string) => boolean): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walkFiltered(fullPath, results, filter);
    } else if (entry.isFile()) {
      if (filter(fullPath)) {
        results.push(fullPath);
      }
    }
  }
}

/** 为角色卡查找配套文件（开场白、简介、底图） */
export function findCardFiles(cardJsonPath: string): {
  opening: string | null;
  intro: string | null;
  basePng: string | null;
} {
  const dir = path.dirname(cardJsonPath);
  const cardName = path.basename(cardJsonPath, '.json');
  const projectRoot = path.resolve(dir, '..', '..', '..');

  const opening = path.join(dir, `${cardName}开场白.md`);
  const intro = path.join(dir, `${cardName}简介.md`);
  const basePng = path.join(projectRoot, '底图', `${cardName}.png`);

  return {
    opening: fs.existsSync(opening) ? opening : null,
    intro: fs.existsSync(intro) ? intro : null,
    basePng: fs.existsSync(basePng) ? basePng : null,
  };
}

/** 查找所有 JSON 文件（全项目递归） */
export function findAllJsonFiles(projectRoot: string): string[] {
  const results: string[] = [];
  walkFiltered(projectRoot, results, (fullPath) => fullPath.endsWith('.json'));
  return results;
}

/** 查找所有以指定后缀结尾的 JSON 文件 */
export function findJsonFiles(dir: string, excludePatterns: string[] = []): string[] {
  const results: string[] = [];
  walkFiltered(dir, results, (fullPath) => {
    if (!fullPath.endsWith('.json')) return false;
    const norm = normalizePath(fullPath);
    return !excludePatterns.some(p => norm.includes(p));
  });
  return results;
}

/** 查找目录下的所有子目录 */
export function findSubdirectories(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && !EXCLUDE_DIRS.has(entry.name)) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}
