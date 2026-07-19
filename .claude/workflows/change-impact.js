export const meta = {
  name: 'change-impact',
  description: '变更影响分析\u65306输入关键字或 auto\u65292扫描全项目引用\u65292按"必须同步/建议检查/无需改动"三级输出影响范围',
  phases: [
    { title: '输入', detail: '解析关键字或从 git diff 自动提取' },
    { title: '扫描', detail: '全项目 grep + 按文件类型分类' },
    { title: '输出', detail: '三级影响报告' },
  ],
}

const keyword = args || 'auto'

phase('输入')

const inputResult = await agent(`
你是一次性输入解析器\u12290接收到的参数是\u65306"${keyword}"

**如果参数不是 "auto"\u65306**
直接将参数作为搜索关键字输出\u12290
输出格式\u65306
===KEYWORD===
\u65288关键字\u65289
===MODE===
explicit

**如果参数是 "auto"\u65306**

按以下步骤自动提取关键字\u65306

1. 运行 git diff --name-only HEAD 和 git diff --name-only\u65292合并去重变更文件列表
2. 用 Read 读取每个变更的 JSON 文件和 MD 文件
3. 从变更内容中提取可能影响其他文件的实体名称\u65292包括\u65306
   - 角色名称\u65288一般称呼和全名\u65292如"薰""花坂 薰"\u65289
   - 事件名称\u65288如"第一次扭曲""沃拉瑟斯""熊本连环扭曲"\u65289
   - 组织名称\u65288如"狩灵协会""锈钟""发条""齿轮"\u65289
   - 专有术语\u65288如"灵力回路""色彩阶""ControlBoundary"\u65289
   - 地点名称\u65288如"福冈""横滨""东京"\u65289
4. 对每个提取的实体\u65292判断是否需要影响分析\u65288排除太泛的术语如"灵力""恶灵"\u65289
5. 选出最重要的 1-3 个实体\u65288优先选共享事件名\u12289角色全名\u12289组织名\u65289

输出格式\u65306
===KEYWORDS===
\u65288每行一个关键字\u65292最多 3 个\u65307如果无变更或提取不到任何实体\u65292写 NONE\u65289
===MODE===
auto
===SOURCE===
\u65288变更文件列表摘要\u65292一行描述即可\u65289
`, {label: 'parse-input', phase: '输入'})

const isAuto = inputResult.includes('===MODE===\nauto') || inputResult.includes('MODE===\nauto')
const hasKeywords = !inputResult.includes('===KEYWORDS===\nNONE') && !inputResult.includes('KEYWORDS===\nNONE')

if (!hasKeywords) {
  log('未检测到需要影响分析的实体\u12290')
  return { report: '## 变更影响分析\n\n未检测到需要影响分析的实体变更\u12290当前 git diff 中的修改不涉及共享实体\u65288角色名\u12289事件名\u12289组织名等\u65289\u65292无需跨文件同步\u12290' }
}

log(isAuto ? 'auto 模式\u65306从 git diff 自动提取实体\u12290' : `关键字模式\u65306"${keyword}"`)

phase('扫描')

const impactResult = await agent(`
你是影响分析扫描器\u12290对以下每个关键字\u65292用 Grep 工具在全项目中搜索引用\u12290

搜索参数\u65306${inputResult}

## 搜索步骤

对每个关键字\u65306
1. 运行 Grep(pattern="关键字", path="D:/File/AiJunkyard/dzmm/狩灵世界观", output_mode="files_with_matches")
2. 逐个检查匹配文件\u65292确定引用类型和影响等级

## 影响等级判定规则

**MUST_SYNC\u65288必须同步\u65289\u65306** 定义性文件和关系数据
- world info/*.md \u8212 世界设定\u65292定义性
- 小说化内容/时间线.md \u8212 权威时间线
- 关系网/**/*.json \u8212 关系数据
- 角色卡/事件卡/**/*.json \u8212 事件定义
- *角色卡/*/*.json \u8212 角色卡数据定义
- *角色卡/*/*_zh.json \u8212 中文角色卡\u65292需与英文同步
- 任何文件中包含日期\u12289年龄\u12289数字等硬数据的引用

**SHOULD_CHECK\u65288建议检查\u65289\u65306** 叙事文件和介绍文件
- *角色卡/*/*简介.md \u8212 角色介绍
- *角色卡/*/*开场白.md \u8212 叙事入口
- 角色卡/事件卡/**/*简介.md \u8212 事件介绍
- 角色卡/事件卡/**/*开场白.md \u8212 事件开场
- 小说化内容/** \u8212 小说化叙事

**NO_ACTION\u65288无需改动\u65289\u65306**
- 创作者文件/审查文件/** \u8212 审查输出\u65292不与源数据同步
- 创作者文件/创作文件/** \u8212 创作规范
- .claude/** \u8212 工具配置
- 仅作为举例/注释/背景提及的引用

## 输出格式\u65288严格遵循\u65289

对每个关键字\u65292输出\u65306

### 关键字\u65306XXX

**MUST_SYNC\u65288N 个文件\u65289\u65306**
- 文件路径 \u8594 引用方式\u65288如"char_background.origin""关系条目""时间线条目"等\u65289

**SHOULD_CHECK\u65288N 个文件\u65289\u65306**
- 文件路径 \u8594 引用方式

**NO_ACTION\u65288N 个文件\u65289\u65306**
- 文件路径\u65288可汇总为"创作者文件/审查文件/N 个"等\u65289

每个关键字之后用 --- 分隔\u12290

如果某关键字在全项目中无任何匹配\u65292输出"### 关键字\u65306XXX\n\n全项目无匹配\u12290"
`, {label: 'impact-scan', phase: '扫描'})

phase('输出')

const report = await agent(`
你是影响分析报告生成器\u12290根据以下扫描结果\u65292输出简洁的影响分析报告\u12290

${impactResult}

## 原始参数
关键字\u65306${keyword}
模式\u65306${isAuto ? 'auto\u65288从 git diff 自动提取\u65289' : 'explicit\u65288手动指定\u65289'}

## 输出要求

1. 开头一句话总评\u65288如"修改「XXX」将影响 N 个文件\u65292其中 M 个必须同步"\u65289
2. 按关键字分组\u65292每个关键字下列出 MUST_SYNC 和 SHOULD_CHECK 的文件清单
3. 每个文件附一行说明引用的具体位置\u65288如"char_background.origin 中提及""关系条目\u65306花坂 薰 \u8594 花坂 枫的描述"\u65289
4. NO_ACTION 的文件在末尾汇总为一行即可
5. 给出修复顺序建议\u65288先 MUST_SYNC\u65292后 SHOULD_CHECK\u65289
6. 整体紧凑\u65292控制在 50 行以内

不要输出审查规则或方法论原文\u12290
`, {label: 'report', phase: '输出'})

return { report }
