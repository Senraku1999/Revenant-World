export const meta = {
  name: 'quick-check',
  description: '增量审查\u65306基于 git diff 的变更文件快速检查\u65288自动脚本 + 标点 + ControlBoundary\u65289\u652923 agent 以内\u6529230 秒以内',
  phases: [
    { title: '扫描', detail: 'git diff 确定变更范围 + 运行自动检查脚本' },
    { title: '审查', detail: '变更文件标点与 CB 并行审查' },
    { title: '汇总', detail: '输出增量审查结果' },
  ],
}

phase('扫描')

const scanResult = await agent(`
你是一次性扫描器\u12290按顺序执行以下操作\u65292不要跳过任何一步\u65306

**第1步\u65306获取变更文件列表**
依次运行以下命令\u65288注意\u65306Windows 环境\u65292git bash 可用\u65289\u65306
  git diff --name-only HEAD
  git diff --name-only
合并去重两个命令的输出\u12290

**第2步\u65306运行自动检查脚本**
运行以下命令\u65306
  npx tsx "创作者文件/审查文件/自动检查.ts" > .claude/quick_check_output.txt 2>&1

**第3步\u65306读取自动检查结果**
用 Read 工具读取 .claude/quick_check_output.txt 的内容\u12290
提取其中的失败项和警告项\u65288跳过 PASS 行\u65289\u65292归纳为 3-5 句摘要\u12290

**第4步\u65306清理临时文件**
运行\u65306rm -f .claude/quick_check_output.txt

**输出格式\u65288严格遵循\u65292不要添加额外解释\u65289\u65306**
===CHANGED_FILES===
\u65288变更文件路径\u65292每行一个\u65307若没有任何变更\u65292仅写 NONE\u65289
===AUTO_CHECK===
\u65288自动检查摘要\u12290全部通过写 ALL_PASSED\u65292有问题则列出问题类型和涉及的文件名\u65289
===FILE_COUNT===
\u65288数字\u65289
`, {label: 'scan', phase: '扫描'})

const hasChanges = !scanResult.includes('===CHANGED_FILES===\nNONE') &&
                   !scanResult.includes('===CHANGED_FILES===\n\n') &&
                   !scanResult.includes('CHANGED_FILES===\nNONE')

log(hasChanges ? '检测到变更文件\u65292启动标点与 CB 并行审查\u12290' : '无文件变更\u65292仅输出自动检查结果\u12290')

phase('审查')

const reviewTargets = scanResult

const [punctResult, cbResult] = await Promise.all([
  agent(`
你是标点审查专员\u12290仅审查以下扫描结果中列出的 MD 文件\u65288*简介.md 和 *开场白.md\u65289\u12290

${reviewTargets}

## 硬规则\u65288逐字扫描\u65289

1. 引号必须是英文直双引号 ""\u65288U+0022\u65289\u65292禁止中文卷曲引号 \u8220\u8221\u65288U+201C/U+201D\u65289
2. \u8212\u8212 仅限对话引号内\u65292叙述中禁止
3. \u8230\u8230 仅限对话引号内\u65292叙述中禁止
4. 无英文省略号 ...
5. 无 Markdown 装饰符\u65288* _ ~\u65289
6. 无星号包裹动作

## 重要
- 变更文件列表中没有 MD 文件 \u8594 输出"无 MD 文件变更\u65292跳过"
- 只报告违规\u65292零问题输出"标点零问题"
- GB/T 15834 合法的冒号/分号不要误报

输出格式\u65306\u12304文件名\u12305\u8594 问题类型 \u8594 具体位置 \u8594 T0/T1/T2
  `, {label: 'punct-check', phase: '审查'}),

  agent(`
你是 ControlBoundary 审查专员\u12290仅审查以下扫描结果中列出的 MD 文件\u65288*开场白.md 和 *简介.md\u65289\u12290

${reviewTargets}

## 审查规则

核心\u65306允许试探发问\u65292禁止明确设定玩家身份\u12289目的或关系\u12290
标准\u65306只要没有明确说明玩家的具体身份\u12289目的或关系\u65292就不算违规\u12290

## 判定速查

**T0 明确违规\u65306**
- "你是 + 职业/身份"\u65288如"你是刚入职的狩灵""你是个新人"\u65289
- "你来这里是为了 + 目的"\u65288如"你来这里是为了杀我"\u65289
- "你的任务是 + 任务"\u65288如"你的任务是调查失踪案"\u65289
- "你是我的 + 关系"\u65288如"你是我的搭档"\u65289
- 陈述句设定玩家状态\u65288如"你是协会派来的"\u65289

**不违规\u65288不要误报\u65289\u65306**
- 疑问句试探\u65288"你找哪位\u65311""来委托的\u65311""你是协会的人\u65311"\u65289
- 开放邀请\u65288"有什么想问的\u65292直接说吧\u12290"\u65289

**T1 模糊越界\u65306** 暗示但未明说\u65288"看你这样子\u65292刚入行没多久吧\u65311"\u65289

**T2 问题循环\u65306** 连续 ≥ 3 个独立发问句

## 重要
- 变更文件列表中没有 MD 文件 \u8594 输出"无 MD 文件变更\u65292跳过"
- 零问题输出"CB 零问题"

输出格式\u65306\u12304文件名\u12305\u8594 违规类型\u65288身份/目的/关系/问题循环\u65289\u8594 具体位置 \u8594 T0/T1/T2
  `, {label: 'cb-check', phase: '审查'}),
])

log('标点和 CB 审查完成\u12290')

phase('汇总')

const summary = await agent(`
你是审查汇总员\u12290整合以下增量审查结果\u65292按 T0 \u8594 T1 \u8594 T2 分级输出简洁报告\u12290

## 扫描结果
${reviewTargets}

## 标点审查
${punctResult}

## ControlBoundary 审查
${cbResult}

## 输出要求
1. 一句话总评\u65288"全部通过 ✓" 或 "发现 N 个问题"\u65289
2. 按 T0 / T1 / T2 排列\u65292每项一行\u65292标注来源\u65288脚本/标点/CB\u65289
3. 零问题类别写"零问题"
4. 整体不超过 30 行
5. 不要输出审查规则原文
`, {label: 'summary', phase: '汇总'})

return { report: summary }
