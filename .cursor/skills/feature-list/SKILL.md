---
name: feature-list
description: >
  从 SRS 需求规格说明书和可行性研究报告中提取并生成功能清单文档，支持导出 xlsx 或 Word 格式。
  触发场景：(1) "生成功能清单" "导出功能清单" "功能清单" "功能列表" "feature list",
  (2) "整理功能清单" "汇总功能" "功能汇总表",
  (3) 用户需要将 SRS 或可研报告中的功能整理成独立的功能清单文档时触发。
  支持从已有文档自动提取，也支持用户手动补充后导出。
---

# 功能清单生成器

## Step 1：扫描项目文档

并行扫描以下路径，找到 SRS 和可研报告：

```
Glob("docs/01-需求与规划/*需求说明书*.md")
Glob("docs/01-需求与规划/*SRS*.md")
Glob("docs/01-需求与规划/*可行性研究报告*.md")
Glob("docs/01-需求与规划/*可研*.md")
```

找到文档后告知用户，说明将从哪些文档提取数据。若两类文档都找到，以 SRS 为主数据源（字段更完整），可研报告补充建设类型字段。

## Step 2：提取功能清单数据

从文档中提取以下字段：

| 字段 | 来源 | 说明 |
|------|------|------|
| 所属系统 | SRS / 可研 | PC管理后台、移动端应用等；**仅当系统数量 ≥ 2 时才包含此列** |
| 模块 | SRS / 可研 | 一级模块 |
| 子模块 | SRS | 二级模块（如有） |
| 功能名称 | SRS 页面功能清单（3.3节） | 具体功能点 |
| 功能描述 | SRS 页面功能清单（3.3节） | 功能说明 |
| 优先级 | SRS 需求功能清单（3.2节） | P0 / P1 / P2 |
| 备注 | - | 留空 |

提取规则：
- 功能粒度与 SRS 页面功能清单保持一致，不合并、不拆分
- 优先级从 SRS 需求功能清单按模块匹配，找不到则留空
- **所属系统列**：扫描 SRS 页面功能清单，若只有一个系统（如只有 PC 管理后台），则不生成该列；若有 PC 管理后台 + 移动端等多个系统，则保留该列

提取完成后展示数据摘要（共 N 条，按系统分布），确认后进入下一步。

## Step 3：询问导出格式

```
功能清单数据已提取完成，共 N 条功能。请选择导出格式：
1. xlsx（Excel 表格，适合筛选和编辑）
2. Word（.docx，适合正式文档交付）
```

## Step 4A：生成 xlsx

xlsx 走服务端专用接口，不经过 `export-word.sh`（该脚本只支持 Word）。

1. 从 `.claude/skills/config.json` 读取 `apiBaseUrl`

2. 将提取的数据组装为 JSON，调用服务端接口：
   ```bash
   curl -s {apiBaseUrl}/api/document/export/excel-from-data \
     -X POST \
     -H "Content-Type: application/json" \
     -d '{
       "filename": "{项目名称}-功能清单-V1.0",
       "title": "{项目名称}功能清单",
       "freezeFirstRow": true,
       "autoFilter": true,
       "sheets": [{ "name": "功能清单", "data": [[表头行], [数据行...]] }]
     }' \
     -o "docs/01-需求与规划/{YYYY-MM-DD}-{项目名称}-功能清单-V1.0.xlsx"
   ```

3. 导出成功后告知用户文件路径。

## Step 4B：生成 Word

Word 走通用导出脚本，与 req-doc、feasibility-report 技能一致。

1. 将数据写入 Markdown 中间文件：
   `docs/01-需求与规划/{YYYY-MM-DD}-{项目名称}-功能清单-V1.0.md`
   格式参考 `references/md-template.md`

2. 调用通用导出脚本：
   ```bash
   bash .claude/skills/common/export-word.sh <md文件路径> feature-list
   ```

3. 导出成功后告知用户文件路径。

---

## 文档命名规范

`docs/01-需求与规划/{YYYY-MM-DD}-{项目名称}-功能清单-V1.0.{md|xlsx|docx}`

