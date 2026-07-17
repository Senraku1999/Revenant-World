export const meta = {
  name: 'quick-check',
  description: '增量审查：基于 git diff 的变更文件快速检查（自动脚本 + 标点 + ControlBoundary），3 agent 以内，30 秒以内',
  phases: [
    { title: '扫描', detail: 'git diff 确定变更范围 + 运行自动检查脚本' },
    { title: '审查', detail: '变更文件标点与 CB 并行审查' },
    { title: '汇总', detail: '输出增量审查结果' },
  ],
}

phase('扫描')

const scanResult = await agent(`
你是一次性扫描器。按顺序执行以下操作，不要跳过任何一步：

**第1步：获取变更文件列表**
依次运行以下命令（注意：Windows 环境，git bash 可用）：
  git diff --name-only HEAD
  git diff --name-only
合并去重两个命令的输出。

**第2步：运行自动检查脚本**
运行以下命令：
  npx tsx "创作者文件/审查文件/自动检查.ts" > .claude/quick_check_output.txt 2>&1

**第3步：读取自动检查结果**
用 Read 工具读取 .claude/quick_check_output.txt 的内容。
提取其中的失败项和警告项（跳过 PASS 行），归纳为 3-5 句摘要。

**第4步：清理临时文件**
运行：rm -f .claude/quick_check_output.txt

**输出格式（严格遵循，不要添加额外解释）：**
===CHANGED_FILES===
（变更文件路径，每行一个；若没有任何变更，仅写 NONE）
===AUTO_CHECK===
（自动检查摘要。全部通过写 ALL_PASSED，有问题则列出问题类型和涉及的文件名）
===FILE_COUNT===
（数字）
`, {label: 'scan', phase: '扫描'})

const hasChanges = !scanResult.includes('===CHANGED_FILES===\nNONE') &&
                   !scanResult.includes('===CHANGED_FILES===\n\n') &&
                   !scanResult.includes('CHANGED_FILES===\nNONE')

log(hasChanges ? '检测到变更文件，启动标点与 CB 并行审查。' : '无文件变更，仅输出自动检查结果。')

phase('审查')

const reviewTargets = scanResult

const [punctResult, cbResult] = await Promise.all([
  agent(`
你是标点审查专员。仅审查以下扫描结果中列出的 MD 文件（*简介.md 和 *开场白.md）。

${reviewTargets}

## 硬规则（逐字扫描）

1. 引号必须是英文直双引号 ""（U+0022），禁止中文卷曲引号 ""
2. —— 仅限对话引号内，叙述中禁止
3. …… 仅限对话引号内，叙述中禁止
4. 无英文省略号 ...
5. 无 Markdown 装饰符（* _ ~）
6. 无星号包裹动作

## 重要
- 变更文件列表中没有 MD 文件 → 输出"无 MD 文件变更，跳过"
- 只报告违规，零问题输出"标点零问题"
- GB/T 15834 合法的冒号/分号不要误报

输出格式：【文件名】→ 问题类型 → 具体位置 → T0/T1/T2
  `, {label: 'punct-check', phase: '审查'}),

  agent(`
你是 ControlBoundary 审查专员。仅审查以下扫描结果中列出的 MD 文件（*开场白.md 和 *简介.md）。

${reviewTargets}

## 审查规则

核心：允许试探发问，禁止明确设定玩家身份、目的或关系。
标准：只要没有明确说明玩家的具体身份、目的或关系，就不算违规。

## 判定速查

**T0 明确违规：**
- "你是 + 职业/身份"（如"你是刚入职的狩灵""你是个新人"）
- "你来这里是为了 + 目的"（如"你来这里是为了杀我"）
- "你的任务是 + 任务"（如"你的任务是调查失踪案"）
- "你是我的 + 关系"（如"你是我的搭档"）
- 陈述句设定玩家状态（如"你是协会派来的"）

**不违规（不要误报）：**
- 疑问句试探（"你找哪位？""来委托的？""你是协会的人？"）
- 开放邀请（"有什么想问的，直接说吧。"）

**T1 模糊越界：** 暗示但未明说（"看你这样子，刚入行没多久吧？"）

**T2 问题循环：** 连续 ≥ 3 个独立发问句

## 重要
- 变更文件列表中没有 MD 文件 → 输出"无 MD 文件变更，跳过"
- 零问题输出"CB 零问题"

输出格式：【文件名】→ 违规类型（身份/目的/关系/问题循环）→ 具体位置 → T0/T1/T2
  `, {label: 'cb-check', phase: '审查'}),
])

log('标点和 CB 审查完成。')

phase('汇总')

const summary = await agent(`
你是审查汇总员。整合以下增量审查结果，按 T0 → T1 → T2 分级输出简洁报告。

## 扫描结果
${reviewTargets}

## 标点审查
${punctResult}

## ControlBoundary 审查
${cbResult}

## 输出要求
1. 一句话总评（"全部通过 ✓" 或 "发现 N 个问题"）
2. 按 T0 / T1 / T2 排列，每项一行，标注来源（脚本/标点/CB）
3. 零问题类别写"零问题"
4. 整体不超过 30 行
5. 不要输出审查规则原文
`, {label: 'summary', phase: '汇总'})

return { report: summary }
