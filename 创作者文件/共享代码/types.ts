// ── 共享类型定义 ──

/** 违反条目 */
export interface Violation {
  file: string;
  line: number;
  symbol: string;
  original: string;
  suggestion: string;
  confidence: string;
  reason: string;
  note?: string;
  field?: string;
  test?: string;
  severity?: string;
  clause?: string;
}

/** 句子片段 */
export interface Sentence {
  text: string;
  start: number;
  end: number;
}

/** 引号区间 [start, end] */
export type QuoteRange = [number, number];

/** 八段 Token 预算区间 */
export interface BudgetRange {
  lo: number;
  hi: number;
}

/** 世界书分配表：世界书名 → card_name 列表 */
export interface WorldBookAssignments {
  [wbName: string]: string[];
}

/** SillyTavern chara_card_v2 角色卡 */
export interface CharacterCard {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creatorcomment: string;
  avatar: string;
  chat: string;
  talkativeness: string;
  fav: boolean;
  tags: string[];
  spec: string;
  spec_version: string;
  create_date: string;
  data: CharacterCardData;
}

export interface CharacterCardData {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  tags: string[];
  creator: string;
  character_version: string;
  alternate_greetings: string[];
  extensions: {
    talkativeness: string;
    fav: boolean;
    world: string;
    depth_prompt: {
      prompt: string;
      depth: number;
      role: string;
    };
  };
  character_book?: {
    name: string;
    entries: unknown[];
  };
}

/** 专有名词映射条目 */
export interface ProperNounEntry {
  full: string;
  mode: '子串' | '独立词';
}
