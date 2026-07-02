export const meta = {
  name: 'full-review',
  description: '狩灵世界观全量审查：自动脚本 → 标点+逻辑并行 → 学术五视角并行 → 汇总分级',
  phases: [
    { title: '自动脚本', detail: '运行自动检查脚本获取基线' },
    { title: '标点审查', detail: '逐字扫描所有 MD 文件标点合规性' },
    { title: '逻辑审查', detail: '聚合比对跨文件/跨角色一致性' },
    { title: '学术审查', detail: '五视角领域审查（人类学/地理/历史/叙事/心理）' },
    { title: '汇总', detail: '整合结果，T0/T1/T2 分级输出' },
    { title: '清理', detail: '清除中间产物，仅保留最终报告' },
  ],
}

phase('自动脚本')

const rules = {
  CLAUDE_MD: await agent('读取 CLAUDE.md 的标点规则和团队结构部分，仅输出规则摘要。', {label: 'read-claude-md'}),
  审查计划: await agent('读取 创作者文件/审查文件/其他审查/宏观审查计划.md 全文，仅输出六步流程和分级标准。', {label: 'read-review-plan'}),
  审查方法论: await agent('读取 创作者文件/审查文件/其他审查/宏观审查方法论.md 全文，仅输出聚合比对原则。', {label: 'read-methodology'}),
}

log(`规则文件已读取。CLAUDE.md 标点硬规则："" 唯一引号，—— …… 仅限对话内。其余遵循 GB/T 15834。`)

phase('标点审查')
phase('逻辑审查')

const [punctuationResult, logicResult] = await Promise.all([
  agent(`
你是标点审查专员。按以下规则扫描项目中所有 *简介.md 和 *开场白.md 文件：

## 硬规则（必须逐字检查）
1. 引号必须是英文直双引号 ""（U+0022），禁止中文卷曲引号 ""
2. —— 仅限对话引号内，叙述中禁止
3. …… 仅限对话引号内，叙述中禁止
4. 无英文省略号 ...
5. 无 Markdown 装饰符（* _ ~）
6. 无星号包裹动作（*text*）

## 注意事项
- 冒号 : 和分号 ; 在 GB/T 15834 下合法，不要误判
- 但非言语动词后冒号接对话（如 抬头："）是 GB/T 15834 违规，用逗号
- JSON 非对话字段中的 —（em dash U+2014）禁止

扫描全部文件后，按文件夹分批输出问题。格式：【文件名】→ 问题类型 → 具体位置 → 严重等级（T0/T1/T2）
零问题文件汇总一行即可。
  `, {label: 'punctuation-review', phase: '标点审查'}),

  agent(`
你是逻辑一致性审查员。按"先聚合再比对"原则检查项目逻辑一致性。

## 前置阅读
必须读取：创作者文件/审查文件/其他审查/宏观审查方法论.md、创作者文件/审查文件/其他审查/宏观审查计划.md、world info/ 全部文件、创作者文件/创作文件/角色卡标准格式.md、创作者文件/创作文件/基础能力等级示例.md

## 审查清单
### 4a. 同角色三文件交叉比对（JSON ↔ 简介 ↔ 开场白）
对所有角色检查：基础信息、基础能力、特殊能力、装备、性格特质、评级格式一致

### 4b. 跨角色矛盾检查
重点检查：关系双向一致性（花坂三兄妹、晨昏四成员、烬-劫-慎三角）
同一事件在不同角色卡中描述一致

### 4c. 世界观设定一致性
科室分配、评级体系、身份定义、char_faction/char_status 格式、评估方署名

### 4d. 示例对话与性格一致性
语言风格匹配、无 ControlBoundary 违规、动作描写多样化

输出格式：【角色A】与【角色B/规则】矛盾点 → 双方原文 → T0/T1/T2
零问题时声明"无矛盾"。
  `, {label: 'logic-review', phase: '逻辑审查'}),
])

log(`标点审查${punctuationResult ? '完成' : '完成'}，逻辑审查${logicResult ? '完成' : '完成'}`)

phase('学术审查')

const academicResults = await Promise.all([
  agent(`你是人类学家。读取 world info/ 全部文件，抽样薰/琳/世/光/零的角色文件。从文化系统、帮会亚文化、双重社会、家族仪式角度审查。输出：亮点+问题+T1/T2。`, {label: 'anthropologist', phase: '学术审查'}),
  agent(`你是地理学家。读取 world info/狩灵协会.md 和 world info/锈钟.md，抽样响/君房/光/克羽。从城市分布、地盘空间、场景地理锚定角度审查。输出：亮点+问题+T1/T2。`, {label: 'geographer', phase: '学术审查'}),
  agent(`你是历史学家。读取 world info/ 和事件卡，抽样薰/世/零。从时间线、事件因果、组织起源角度审查。输出：亮点+问题+T1/T2。`, {label: 'historian', phase: '学术审查'}),
  agent(`你是叙事学家。读取 创作者文件/创作文件/狩灵开场白创作指导.md，抽样铁心/薰/零/烬/千乐的开场白。从叙事结构、对话风格、收尾台词角度审查。输出：亮点+问题+T1/T2。`, {label: 'narratologist', phase: '学术审查'}),
  agent(`你是心理学家。读取 world info/异常.md，抽样响/君房/零/烬/薰。从人格张力、创伤处理、缺陷真实性角度审查。输出：亮点+问题+T1/T2。`, {label: 'psychologist', phase: '学术审查'}),
])

log(`五个学术视角全部返回`)

phase('汇总')

const report = await agent(`
你是审查协调员。汇总以下四路审查结果，按 T0/T1/T2 分级输出最终报告。

## 自动脚本结果
${JSON.stringify(rules)}

## 标点审查结果
${punctuationResult}

## 逻辑审查结果
${logicResult}

## 学术审查结果
人类学：${academicResults[0]}
地理学：${academicResults[1]}
历史学：${academicResults[2]}
叙事学：${academicResults[3]}
心理学：${academicResults[4]}

## 输出要求
1. 先列 T0（必须修复），再 T1（建议修复），最后 T2（可选优化）
2. 每项标注来源（脚本/标点/逻辑/学术-领域）
3. 给出修复优先级建议
4. 零问题时明确声明
`, {label: 'coordinator-summary', phase: '汇总'})

log('审查完成。提醒：清理创作者文件/审查文件/ 目录下的临时文件（_开头的中间产物）。')

return { report }
