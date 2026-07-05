export const meta = {
  name: 'change-impact',
  description: '变更影响分析：输入关键字或 auto，扫描全项目引用，按"必须同步/建议检查/无需改动"三级输出影响范围',
  phases: [
    { title: '输入', detail: '解析关键字或从 git diff 自动提取' },
    { title: '扫描', detail: '全项目 grep + 按文件类型分类' },
    { title: '输出', detail: '三级影响报告' },
  ],
}

const keyword = args || 'auto'

phase('输入')

const inputResult = await agent(`
你是一次性输入解析器。接收到的参数是："${keyword}"

**如果参数不是 "auto"：**
直接将参数作为搜索关键字输出。
输出格式：
===KEYWORD===
（关键字）
===MODE===
explicit

**如果参数是 "auto"：**

按以下步骤自动提取关键字：

1. 运行 git diff --name-only HEAD 和 git diff --name-only，合并去重变更文件列表
2. 用 Read 读取每个变更的 JSON 文件和 MD 文件
3. 从变更内容中提取可能影响其他文件的实体名称，包括：
   - 角色名称（一般称呼和全名，如"薰""花坂 薰"）
   - 事件名称（如"第一次扭曲""沃拉瑟斯""熊本连环扭曲"）
   - 组织名称（如"狩灵协会""锈钟""发条""齿轮"）
   - 专有术语（如"灵力回路""色彩阶""ControlBoundary"）
   - 地点名称（如"福冈""横滨""东京"）
4. 对每个提取的实体，判断是否需要影响分析（排除太泛的术语如"灵力""恶灵"）
5. 选出最重要的 1-3 个实体（优先选共享事件名、角色全名、组织名）

输出格式：
===KEYWORDS===
（每行一个关键字，最多 3 个；如果无变更或提取不到任何实体，写 NONE）
===MODE===
auto
===SOURCE===
（变更文件列表摘要，一行描述即可）
`, {label: 'parse-input', phase: '输入'})

const isAuto = inputResult.includes('===MODE===\nauto') || inputResult.includes('MODE===\nauto')
const hasKeywords = !inputResult.includes('===KEYWORDS===\nNONE') && !inputResult.includes('KEYWORDS===\nNONE')

if (!hasKeywords) {
  log('未检测到需要影响分析的实体。')
  return { report: '## 变更影响分析\n\n未检测到需要影响分析的实体变更。当前 git diff 中的修改不涉及共享实体（角色名、事件名、组织名等），无需跨文件同步。' }
}

log(isAuto ? 'auto 模式：从 git diff 自动提取实体。' : `关键字模式："${keyword}"`)

phase('扫描')

const impactResult = await agent(`
你是影响分析扫描器。对以下每个关键字，用 Grep 工具在全项目中搜索引用。

搜索参数：${inputResult}

## 搜索步骤

对每个关键字：
1. 运行 Grep(pattern="关键字", path="D:/File/AiJunkyard/dzmm/狩灵世界观", output_mode="files_with_matches")
2. 逐个检查匹配文件，确定引用类型和影响等级

## 影响等级判定规则

**MUST_SYNC（必须同步）：** 定义性文件和关系数据
- world info/*.md — 世界设定，定义性
- 小说化内容/时间线.md — 权威时间线
- 角色关系网/**/*.json — 关系数据
- 角色卡/事件卡/**/*.json — 事件定义
- *角色卡/*/*.json — 角色卡数据定义
- *角色卡/*/*_zh.json — 中文角色卡，需与英文同步
- 任何文件中包含日期、年龄、数字等硬数据的引用

**SHOULD_CHECK（建议检查）：** 叙事文件和介绍文件
- *角色卡/*/*简介.md — 角色介绍
- *角色卡/*/*开场白.md — 叙事入口
- 角色卡/事件卡/**/*简介.md — 事件介绍
- 角色卡/事件卡/**/*开场白.md — 事件开场
- 小说化内容/** — 小说化叙事

**NO_ACTION（无需改动）：**
- 创作者文件/审查文件/** — 审查输出，不与源数据同步
- 创作者文件/创作文件/** — 创作规范
- .claude/** — 工具配置
- 仅作为举例/注释/背景提及的引用

## 输出格式（严格遵循）

对每个关键字，输出：

### 关键字：XXX

**MUST_SYNC（N 个文件）：**
- 文件路径 → 引用方式（如"char_background.origin""关系条目""时间线条目"等）

**SHOULD_CHECK（N 个文件）：**
- 文件路径 → 引用方式

**NO_ACTION（N 个文件）：**
- 文件路径（可汇总为"创作者文件/审查文件/N 个"等）

每个关键字之后用 --- 分隔。

如果某关键字在全项目中无任何匹配，输出"### 关键字：XXX\n\n全项目无匹配。"
`, {label: 'impact-scan', phase: '扫描'})

phase('输出')

const report = await agent(`
你是影响分析报告生成器。根据以下扫描结果，输出简洁的影响分析报告。

${impactResult}

## 原始参数
关键字：${keyword}
模式：${isAuto ? 'auto（从 git diff 自动提取）' : 'explicit（手动指定）'}

## 输出要求

1. 开头一句话总评（如"修改「XXX」将影响 N 个文件，其中 M 个必须同步"）
2. 按关键字分组，每个关键字下列出 MUST_SYNC 和 SHOULD_CHECK 的文件清单
3. 每个文件附一行说明引用的具体位置（如"char_background.origin 中提及""关系条目：花坂 薰 → 花坂 枫的描述"）
4. NO_ACTION 的文件在末尾汇总为一行即可
5. 给出修复顺序建议（先 MUST_SYNC，后 SHOULD_CHECK）
6. 整体紧凑，控制在 50 行以内

不要输出审查规则或方法论原文。
`, {label: 'report', phase: '输出'})

return { report }
