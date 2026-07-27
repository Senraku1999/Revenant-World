/**
 * 分配表 · 统一定义
 * ================
 * 三条管线从本文件 import，避免分头维护导致漂移。
 * 三张表刻意不同——各自服务于不同的导出目的。
 *
 * 新增角色时，按规则同步更新对应分配表。
 */

// ── 管线一（导出关系网）：角色 → 阵营关系网副本 ──
// 同一角色可出现在多个阵营目录（如 菲利普 ∈ 晨昏事务所 + 沃拉瑟斯）
export const RELATION_FACTION_MEMBERS: Record<string, string[]> = {
  '四色音':     ['心音', '花音', '弦音', '铃音'],
  '晨昏事务所': ['贝尔金', '贝拉', '弗洛伦', '菲利普'],
  '沃拉瑟斯':   ['贝尔金', '贝拉', '弗洛伦', '菲利普 · 钢翼', '沃拉瑟斯'],
  '花坂家':     ['薰', '千乐', '百合子'],
  '来生事务所': ['爱', '星流', '雨', '天'],
  '追猎':       ['慎', '劫', '烬'],
};

// ── 管线二（导出世界书 · 构建分配）：角色 → 阵营世界书 ──
// 仅含该阵营世界书的专有角色条目（不含基础规则层通用条目）
export const WORLDBOOK_BUILD: Record<string, string[]> = {
  '四色音':     ['心音', '花音', '弦音', '铃音'],
  '晨昏事务所': ['贝尔金', '贝拉', '弗洛伦', '菲利普'],
  '沃拉瑟斯':   ['菲利普 · 钢翼', '沃拉瑟斯'],
  '花坂家':     ['薰', '千乐', '百合子'],
  '来生事务所': ['爱', '星流', '雨', '天'],
  '追猎':       ['慎', '劫', '烬'],
};

// ── 管线三（导出角色卡 · PNG 导出分配）：底图角色 → 嵌入的世界书 ──
// 键 = 世界书名，值 = 嵌入该书的所有角色/场景卡 card_name
export const PNG_EXPORT_ASSIGN: Record<string, string[]> = {
  '狩灵 全角色':       ['新宿站', '协会1科', '四色音 · 闪耀舞台'],
  '狩灵 四色音':       ['心音', '花音', '弦音', '铃音'],
  '狩灵 晨昏事务所':   ['贝尔金', '贝拉', '弗洛伦', '菲利普'],
  '狩灵 沃拉瑟斯':     ['菲利普 · 钢翼', '沃拉瑟斯'],
  '狩灵 花坂家':       ['薰', '千乐', '百合子', '花坂家宴'],
  '狩灵 来生事务所':   ['爱', '星流', '雨', '天'],
  '狩灵 追猎':         ['慎', '劫', '烬'],
};

// ── 辅助：从三张表中提取所有 card_name 的并集 ──
export function allAssignedCardNames(): Set<string> {
  const set = new Set<string>();
  for (const members of Object.values(RELATION_FACTION_MEMBERS)) {
    for (const name of members) set.add(name);
  }
  for (const members of Object.values(PNG_EXPORT_ASSIGN)) {
    for (const name of members) set.add(name);
  }
  return set;
}
