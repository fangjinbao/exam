# 通用绘图规范

> 本规范适用于所有类型的 draw.io XML 图表。每次生成图表前必须读取。
> 读完本文件后，再根据图表类型读取对应的专项规范。

---

## 一、XML 基本结构

所有图表必须包含完整的 mxfile 包装：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="draw.io">
  <diagram name="图表名称" id="唯一ID">
    <mxGraphModel dx="宽" dy="高" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="宽" pageHeight="高" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <!-- 内容从 id="2" 开始 -->
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

`id="0"` 和 `id="1"` 是 draw.io 必需的根节点，禁止省略。

---

## 二、画布内边距（强制）

渲染 API 会裁切到内容边界，导致节点紧贴图片边缘。**所有图表必须添加透明占位矩形**，撑开画布边界，提供至少 30px 的视觉内边距。

```xml
<!-- 透明占位：撑开画布边界，提供内边距 -->
<mxCell id="spacer" value="" style="fillColor=none;strokeColor=none;opacity=0;" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="{内容最右边X + 60}" height="{内容最底部Y + 60}" as="geometry"/>
</mxCell>
```

**计算规则：**
- spacer 起点固定为 `x=0, y=0`
- width = 内容最右侧元素的 `x + width + 30`（右边距 30px）
- height = 内容最底部元素的 `y + height + 30`（下边距 30px）
- 内容起始坐标 ≥ 30px（左边距和上边距由内容自身坐标保证）

**示例：** 若最右侧元素为 `x=570`（回路线 waypoint），最底部元素为 `y=770, height=40`，则：
- width = 570 + 30 = 600（或取整到 640）
- height = 770 + 40 + 30 = 840（或取整到 840）

---

## 三、绝对禁止

1. **禁止使用 emoji** — 渲染 API 不支持，会显示为方块
2. **禁止使用中文文件名** — 文件名用英文，节点内容可以用中文
3. **禁止文字节点叠放** — 标题和描述必须在同一个 cell 的 value 中用 HTML 换行，不能用两个独立节点重叠
4. **禁止省略 id="0" 和 id="1"** — draw.io 必需的根节点
5. **禁止输出不完整的 XML** — 必须有 mxfile 包装
6. **禁止省略 spacer 占位** — 所有图表必须有透明占位矩形保证内边距
7. **无需手动加白色背景** — 渲染 API 已统一处理，XML 中不要加 outer 白色容器

---

## 四、白色背景

渲染脚本已在 API 请求中统一添加 `"background": "#ffffff"` 参数，所有 PNG 输出自动带白底。

**XML 中不需要手动添加白色背景容器。** 渲染 API 会自动处理。

---

## 五、HTML 文本规范

节点内需要多行文字时，使用 HTML 内联格式：

```xml
<!-- 标题 + 描述 -->
value="&lt;b&gt;模块名称&lt;/b&gt;&lt;br&gt;&lt;font style=&quot;font-size:10px;color:#666&quot;&gt;描述文字&lt;/font&gt;"

<!-- 多行列表 -->
value="第一行&lt;br&gt;第二行&lt;br&gt;第三行"
```

所有使用 HTML 的节点必须在 style 中包含 `html=1;whiteSpace=wrap;`。

---

## 六、ID 命名规范

- 使用语义化 ID：`L2_m1`（第2层模块1）、`arrow1`、`legend_title`
- 禁止纯数字 ID（除了 "0" 和 "1"）
- 同一图表内 ID 不得重复

---

## 七、尺寸与字号

| 元素 | 最小宽度 | 最小高度 | 字号 |
|------|---------|---------|------|
| 普通节点 | 100px | 28px | 11-12px |
| 标题文本 | — | 30px | 16-18px |
| 图例色块 | 18px | 14px | — |
| 图例文字 | — | — | 10px |

---

## 八、连线规则（适用于含 edge 的图表）

架构图无 edge，可跳过本节。流程图/时序图等必须遵守。

### 8.1 锚点必须显式指定

所有 edge 必须在 style 中指定 `exitX/exitY/entryX/entryY`，禁止依赖自动路由。

```
垂直向下：exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0
垂直向上：exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0
水平向右：exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0
水平向左：exitX=0;exitY=0.5;exitDx=0;exitDy=0;entryX=1;entryY=0.5;entryDx=0;entryDy=0
```

### 8.2 同一节点多条出线

同一节点有多条出线时，必须从不同侧或不同位置出发：
- 主流程（向下）：exitX=0.5;exitY=1（底部中心）
- 分支流程（向右）：exitX=1;exitY=0.5（右侧中心）
- 禁止两条线从同一锚点出发

### 8.3 防交叉规则

- 连线不得穿过其他节点的矩形区域
- 若两条线路径可能重叠，使用中间点（`<Array as="points">`）手动控制路径
- 跨多列的水平连线，选择不经过中间节点的 Y 坐标
- 回流连线（从右向左）优先走图表底部或顶部空白区域

### 8.4 orthogonal 路由行为

使用 `edgeStyle=orthogonalEdgeStyle` 时，路由器会在 exit 和 entry 之间插入直角拐弯：
- exit 底部 + entry 顶部 → 若 X 不同，产生"下→横→下"Z 形路径
- exit 底部 + entry 左侧 → 产生"下→横"L 形路径（更简洁）
- exit 右侧 + entry 左侧 → 若 Y 不同，产生"横→竖→横"Z 形路径

选择锚点组合时，优先产生 L 形（一次拐弯）而非 Z 形（两次拐弯）。

---

## 九、规范文件索引

| 业务场景 | 专项规范文件 | 模板目录 |
|---------|------------|---------|
| 业务流程图（泳道图、BPMN） | `business-flow-rules.md` | `examples/business-flow/` |
| 用户操作流程图 | `operation-flow-rules.md` | `examples/operation-flow/` |
| 系统架构图 | `system-architecture-rules.md` | `examples/system-architecture/` |
| UML图（用例、时序、类图、ER） | `uml-rules.md` | `examples/uml/` |

后续新增类型时在此表追加。
