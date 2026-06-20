---
name: diagram-generator
description: >
  You MUST use this skill when users ask to generate, create, draw, or insert ANY type of diagram into documents.
  CRITICAL: When generating requirements documents (需求说明书) via req-doc skill, you MUST use this skill to generate ALL diagrams. Never generate diagrams manually without this skill.
  Triggers:
  (1) 流程图/活动图: "生成流程图" "画流程图" "重新生成流程图" "插入流程图" "生成活动图" "用户操作流程图",
  (2) 架构图: "生成架构图" "画架构图" "插入架构图" "系统架构图",
  (3) 时序图: "生成时序图" "画时序图" "插入时序图" "系统交互时序",
  (4) 泳道图: "生成泳道图" "画泳道图" "插入泳道图",
  (5) ER图: "生成ER图" "实体关系图" "数据库设计图",
  (6) UML图: "生成UML" "类图" "用例图" "状态图",
  (7) 组织结构图: "组织架构图" "组织结构" "人员架构",
  (8) BPMN: "生成BPMN" "业务流程建模",
  (9) Any request to visualize business processes, system architecture, data flows, or any other diagram in documents.
---

# Diagram Generator (draw.io)

## 核心原则

**所有图表统一使用 draw.io XML 格式，通过后端 API 渲染为 PNG/SVG。**

- 不使用 Mermaid、PlantUML、D2 或任何其他图表语言
- 源文件为 `.xml`（draw.io 格式），输出为 `.png`（默认）或 `.svg`
- 渲染通过 `draw.axuremart.com/api/export` API 完成

## 角色定义

你是业务架构师，负责将需求转化为清晰的可视化图表。你的输出必须：
1. 准确表达业务逻辑和系统结构
2. 遵循 draw.io XML 规范
3. 通过 API 渲染验证后才能交付

## 使用流程

### 单张图表生成

```
1. 确定图表类型 → 查阅类型对照表
2. 调用 diagram-drawer agent 生成 XML
   - 传入：PROJECT_PATH, SKILL_PATH, DIAGRAM_TYPE, DESCRIPTION
   - agent 自动读取绘图规范 + 模板 → 生成 → 自检
3. 接收 agent 输出的 XML
4. 保存 XML 源文件 → docs/images/src/<名称>.xml
5. 调用渲染脚本 → render-diagram.sh 生成 PNG
6. 验证渲染成功 → 确认文件存在且大小 > 0
7. 在文档中插入图片引用
```

### Agent 调用方式

```
subagent_type: "diagram-drawer"
传入：
  PROJECT_PATH: {项目根目录}
  SKILL_PATH: {PROJECT_PATH}/.claude/skills/diagram-generator
  DIAGRAM_TYPE: bpmn | flowchart | sequence | architecture | swimlane | er | class | orgchart
  DESCRIPTION: {图表内容描述，包含节点名称、流程步骤、角色等}
  CONTAINER_SIZE: {可选，如 "1050x1000"}
  STYLE_OVERRIDE: {可选，如 "swimlane border: #b0b8c0"}
```

### 批量生成（需求文档场景）

```
1. 分析文档中所有需要图表的位置
2. 逐张调用 diagram-drawer agent 生成 XML
3. 保存所有 XML 源文件
4. 批量调用渲染脚本
5. 验证所有图片生成成功
6. 在文档中插入所有图片引用
```

## API 调用

### 渲染脚本（推荐）

```bash
.claude/skills/diagram-generator/scripts/render-diagram.sh <源文件.xml> <输出文件.png>
```

### 直接调用 API

```bash
curl -X POST "https://draw.axuremart.com/api/export" \
  -H "Content-Type: application/json" \
  -d '{"xml":"<mxGraphModel>...</mxGraphModel>","format":"png","scale":2}' \
  --output output.png
```

### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| xml | string | 是 | 完整的 draw.io XML 字符串 |
| format | string | 否 | `png`（默认）或 `svg` |
| scale | number | 否 | 缩放倍数，默认 2 |

## 图表类型对照表

| 业务场景 | 模板目录 | 适用情况 |
|---------|---------|---------|
| 业务流程图 | `examples/business-flow/` | 跨部门/跨角色协作流程、BPMN、泳道图 |
| 系统架构图 | `examples/system-architecture/` | 分层架构、技术栈、组织结构 |
| 用户操作流程图 | `examples/operation-flow/` | 单功能操作步骤、审批流程、用户交互 |
| UML 图 | `examples/uml/` | 用例图、时序图、类图、ER图 |

## 模板参考流程

由 diagram-drawer agent 自动完成，主流程无需手动读取模板：

1. agent 根据 DIAGRAM_TYPE 自动读取对应目录下的模板文件
2. agent 读取 `agentpm-knowledge/diagram/common-rules.md` 通用规范 + 专项规范
3. agent 以模板为骨架，替换为实际业务内容
4. agent 自检通过后输出 XML

**主流程只负责：** 接收 XML → 保存文件 → 调用渲染 → 验证结果

## draw.io XML 结构

### 基本骨架

```xml
<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <!-- 节点和连线从 id="2" 开始 -->
  </root>
</mxGraphModel>
```

### 节点（vertex）

```xml
<mxCell id="2" value="节点文字" style="样式字符串" vertex="1" parent="1">
  <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
</mxCell>
```

### 连线（edge）

```xml
<mxCell id="10" value="标签" style="edgeStyle=orthogonalEdgeStyle;rounded=0;" edge="1" source="2" target="3" parent="1">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
```

### 容器（泳道/分组）

```xml
<mxCell id="2" value="泳道名" style="swimlane;startSize=30;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="700" height="100" as="geometry"/>
</mxCell>
<!-- 子节点 parent 指向容器 id -->
<mxCell id="3" value="子节点" style="rounded=1;" vertex="1" parent="2">
  <mxGeometry x="20" y="40" width="100" height="40" as="geometry"/>
</mxCell>
```

## 样式参考

### 节点样式

| 类型 | style 值 |
|------|----------|
| 普通节点 | `rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=12;` |
| 判断菱形 | `rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=12;` |
| 开始圆形 | `ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontSize=12;` |
| 结束圆形 | `ellipse;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontSize=12;` |
| 数据库 | `shape=cylinder3;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=12;size=10;` |

### 容器样式

| 类型 | style 值 |
|------|----------|
| 泳道 | `swimlane;startSize=30;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;fontSize=13;fontStyle=1;` |
| 分层容器 | `swimlane;startSize=30;fillColor=#f5f5f5;strokeColor=#666666;html=1;fontSize=13;fontStyle=1;horizontal=1;` |

### 连线样式

| 类型 | style 值 |
|------|----------|
| 正交连线 | `edgeStyle=orthogonalEdgeStyle;rounded=0;` |
| 直线连线 | `rounded=0;` |
| 虚线 | `dashed=1;edgeStyle=orthogonalEdgeStyle;rounded=0;` |

## 配色方案

| 语义 | 填充色 | 边框色 | 用途 |
|------|--------|--------|------|
| 蓝色系 | #dae8fc | #6c8ebf | 主流程节点、表现层 |
| 绿色系 | #d5e8d4 | #82b366 | 开始节点、成功状态 |
| 红色系 | #f8cecc | #b85450 | 结束节点、错误状态 |
| 黄色系 | #fff2cc | #d6b656 | 判断节点、数据层 |
| 紫色系 | #e1d5e7 | #9673a6 | 业务层、中间件 |
| 灰色系 | #f5f5f5 | #666666 | 容器背景、分隔 |

## 文件命名与路径

### 源文件（XML）

```
docs/images/src/<模块>-<描述>.xml
```

示例：
- `docs/images/src/login-flow.xml`
- `docs/images/src/system-arch.xml`
- `docs/images/src/order-sequence.xml`

### 输出文件（PNG/SVG）

```
docs/images/<模块>-<描述>.png
```

示例：
- `docs/images/login-flow.png`
- `docs/images/system-arch.png`

### 文档引用

```markdown
![登录流程图](docs/images/login-flow.png)
```

## 布局规范

- 节点最小宽度：100px，高度：40px
- 节点间距：水平 50px，垂直 60px
- 泳道高度：至少 100px
- 字体大小：节点 12px，泳道标题 13px（fontStyle=1 加粗）
- 画布起始坐标：x=40, y=40

## 禁止行为

1. **禁止使用 Mermaid/PlantUML/D2** — 所有图表必须是 draw.io XML
2. **禁止跳过渲染验证** — 必须调用 render-diagram.sh 确认输出
3. **禁止绕过 config.json** — 优先从 config.json 读取 API 地址，仅在 config.json 不存在时使用默认值
4. **禁止省略 id="0" 和 id="1"** — 这两个根节点是 draw.io 必需的
5. **禁止使用中文文件名** — 文件名用英文，节点内容可以用中文
6. **禁止不验证就声称完成** — 渲染成功才算完成
