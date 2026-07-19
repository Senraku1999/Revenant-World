/**
 * 检测器字面量完整性哨兵
 * =========================
 * 全局字符替换操作不区分"该改的内容"与"不该改的检测器字面量"，
 * 曾在历史上误杀检测正则导致审查静默失效。
 *
 * 本模块将项目中所有检测用途的违禁字面量集中注册，
 * 每个字面量附带一个不受替换影响的基准验证方法（fromCharCode 构造样本）。
 * 脚本在 main() 开头调用 assertGuard()——任何注册项验证失败即当场报警。
 *
 * 新增检测字面量时在此注册；新增脚本时加一行 assertGuard() 即可。
 */

// 曲引号检测基准：用 fromCharCode 构造样本，替换工具扫不到
const LEFT_CURLY = String.fromCharCode(0x201C);
const RIGHT_CURLY = String.fromCharCode(0x201D);

interface GuardEntry {
  /** 保护对象描述（报错时定位） */
  label: string;
  /** 验证函数：返回 true 表示字面量未被破坏 */
  check: () => boolean;
}

const REGISTRY: GuardEntry[] = [
  {
    label: '自动检查.ts / 一级审查.ts — 曲引号字面量',
    check: () => '“'.includes(LEFT_CURLY) && '”'.includes(RIGHT_CURLY),
  },
  {
    label: 'regex.ts QUOTE_END_OF_LINE — 前引号字符类',
    check: () => {
      // 动态重载以获取当前内存中的最新值（应对 import 缓存）
      const { QUOTE_END_OF_LINE } = require('./regex');
      return QUOTE_END_OF_LINE.test(LEFT_CURLY);
    },
  },
];

export function assertDetectorIntegrity(): void {
  for (const entry of REGISTRY) {
    try {
      if (!entry.check()) {
        console.log(`⚠ 检测器哨兵报警：${entry.label} 的字面量已被破坏`);
        console.log('  全局字符替换可能误杀了检测正则。修复被破坏的脚本后再信任审查报告。');
      }
    } catch (e) {
      console.log(`⚠ 检测器哨兵异常：${entry.label} 验证执行失败 (${String(e)})`);
    }
  }
}
