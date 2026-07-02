# Appearance 字段格式指导

> 本文档为 `角色卡标准格式.md` 和 `狩灵角色卡创作指导.md` §2.1 的补充细化，专门规范 `hair`、`face`、`clothing` 三个 appearance 字段的中英文写法。

---

## 一、Hair（发型发色）

### 中文规则

- **基本格式**：`[颜色][长度/发型][，补充描述]`
- **无句号**：hair 为标签式字段，不加句号
- 简单型：`粉色长发`、`黑色短发`、`绿色短发`
- 复杂型（有补充描述时用逗号分隔）：`银白色长发微卷发尾，低马尾`、`黑色短发，颈后扎成短马尾`

### 英文规则

- **基本格式**：`[Length] [texture] [color] [style], [extra details]`
- **无句号**：与中文一致，标签式
- **形容词顺序**：长度 → 质感 → 颜色（English adjective order: opinion → size → physical quality → color）
  - ✅ `Long black hair`（长度→颜色）
  - ✅ `Short wavy brown hair`（长度→质感→颜色）
  - ❌ `Black long hair`（颜色→长度，错误语序）
  - ❌ `Pink, long`（颜色→长度且多余逗号，且缺名词 hair）
- **累积形容词不加逗号**：`Short black hair` 不是 `Short, black hair`
- **逗号仅用于引出补充描述**：`Long black hair, tied in a ponytail`、`Short blue hair, often messy from workshop`
- **必须包含名词 `hair`**：不能写成 `"Silver-white, slightly curled"` 而无 `hair`，须为 `"Long silver-white hair, slightly curled at ends"`
- **中英文结构一致**：中文有"长发"→英文必须有 `Long`；中文有"短发"→英文必须有 `Short`

### 英文形容词顺序速查

| 顺序 | 类别 | 示例 |
|------|------|------|
| 1 | 主观评价 (opinion) | messy, disheveled, beautiful |
| 2 | 长度/大小 (size) | long, short, shoulder-length |
| 3 | 质感 (physical quality) | wavy, straight, curly, silky |
| 4 | 颜色 (color) | black, brown, pink, silver-white |

> 主观评价可灵活前置（`Messy short blonde hair` / `Short messy blonde hair` 均可），但长度-质感-颜色的相对顺序不能变。

---

## 二、Face（面容特征）

### 中文规则

- **结尾加句号**：`。`
- **内容**：脸型、五官、瞳色、肤色、表情习惯等
- 简单型：`蓝色眼睛。`
- 复杂型：`面容消瘦，深灰色眼睛深陷在眼窝里。`

### 英文规则

- **结尾加句号**：`.`
- **结构与中文对应**
- 简单型：`Blue eyes.`
- 复杂型：`Gaunt features, dark gray eyes sunken deep.`

---

## 三、Clothing（着装）

### 中文规则

- **结尾加句号**：`。`
- **内容**：服装风格，从上到下/从内到外描述
- 多项以逗号分隔：`白色衬衫，灰色外套，黑色燕尾服。`

### 英文规则

- **结尾加句号**：`.`
- **结构与中文对应**
- 多项以逗号分隔：`White shirt, grey coat, black tailcoat.`
