---
name: export-pipeline
description: 导出管线——按序运行三条导出管线（关系网→世界书→PNG），每步产物验证、错误诊断。触发词：导出、导出管线、跑管线、全管线、刷新导出。
---

# 导出管线

按序执行三条导出管线，每步完成后验证产物一致性。

## 管线总览

```
管线一：角色卡 → 关系网（导出关系网.ts）
    ↓
管线二：关系网 + world info → 世界书（导出世界书.ts）
    ↓
管线三：底图 + 世界书 + 角色卡 → PNG（导出角色卡.ts）
```

三条管线**必须按序执行**，不可跳过中间步骤。上一步验证通过才能进入下一步。

---

## 前置要求

执行前确认：
- `npx tsx "创作者文件/审查文件/自动检查.ts"` 通过（全绿）
- git status 无意外变更（干净或仅预期文件已修改）
- 三条管线脚本均存在且未修改

---

## 阶段一：管线一 — 导出关系网

```bash
npx tsx "创作者文件/导出文件/导出关系网.ts"
```

### 验证清单

1. 脚本返回零退出码
2. `角色卡/` 下全部角色（事件卡、世界观卡除外）在 `关系网/全角色/` 中有对应副本
3. 副本数量与源角色卡数量一致
4. `关系网/{各阵营}/` 下副本按 FACTION_MEMBERS 分配正确
5. 副本 JSON 语法合法：

```bash
for f in 关系网/全角色/*.json; do
  node -e "JSON.parse(require('fs').readFileSync('$f','utf-8'))" || echo "FAIL: $f"
done
```

---

## 阶段二：管线二 — 导出世界书

```bash
npx tsx "创作者文件/导出文件/导出世界书.ts"
```

### 验证清单

1. 脚本返回零退出码
2. `世界书/` 下 8 册 JSON 全部生成/更新
3. 每册 JSON 语法合法：

```bash
for f in 世界书/*.json; do
  node -e "JSON.parse(require('fs').readFileSync('$f','utf-8'))" || echo "FAIL: $f"
done
```

4. Keys 数量与 TAG池.md 一致（keys 唯一来源是 TAG 池，禁止硬编码）
5. 角色词条按 WORLDBOOK_BUILD 分配正确

---

## 阶段三：管线三 — 导出 PNG

```bash
npx tsx "创作者文件/导出文件/导出角色卡.ts"
```

### 验证清单

1. 脚本返回零退出码
2. `导出角色卡/` 下 PNG 数量 = 角色卡数量
3. 每张 PNG 的 tEXt chunk 包含合法 base64 编码的 JSON
4. 无 iTXt/zTXt chunk 残留
5. PNG 文件名匹配 card_name（非 char_name）

---

## 一键全管线

```bash
npm run 全管线
```

此命令等效于逐阶段执行。若中间步骤失败，需先修复再继续，不可跳过。

---

## 故障处理

| 症状 | 诊断步骤 |
|------|----------|
| 管线一失败 | 检查是否有 JSON 语法错误（`node -e "JSON.parse(...)"`），检查新增角色的 card_name 是否与目录名一致 |
| 管线二失败 | 检查 TAG池.md 是否更新、WORLDBOOK_BUILD 是否与 FACTION_MEMBERS 产生矛盾 |
| 管线三失败 | 检查底图是否存在、PNG_EXPORT_ASSIGN 是否包含所有角色 |
| 产物数量不对 | 使用 `node -e "const f=require('fs');console.log(f.readdirSync('目录').length)"` 清点各目录数量 |
| 管线产出陈旧 | 先确认源文件（角色卡/底图/world info）的时间戳是否在管线产物之后 |

## 禁止操作

- 禁止跳过中间管线直接跑终点
- 禁止在管线运行期间修改源文件
- 禁止以手动编辑方式"修复"管线产物（产物应从源文件重新生成）
- 禁止在三张分配表之间复制粘贴成员列表（三表独立设计，成员刻意不同）
