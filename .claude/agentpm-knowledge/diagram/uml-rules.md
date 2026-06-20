# UML 图绘图规范

> 适用于：用例图、时序图、类图、ER图。
> 前置依赖：必须先读取 `common-rules.md` 通用规范。
> 模板目录：`examples/uml/`

---

## 一、用例图（Use Case Diagram）

### 1.1 布局结构

```
[Actor左侧]  ┃  [系统边界框]  ┃  [Actor右侧]
              ┃  ┌──────────┐  ┃
  油库主任 ───┃──│ (用例1)   │──┃─── 系统管理员
              ┃  │ (用例2)   │  ┃
  油库调度员 ─┃──│ (用例3)   │──┃─── 系统
              ┃  └──────────┘  ┃
```

### 1.2 元素样式

**Actor（参与者）：**
```
shape=umlActor;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontSize=11;
尺寸：width=40, height=60
```

**系统边界：**
```
rounded=1;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#666666;dashed=1;dashPattern=8 4;strokeWidth=2;fontSize=14;fontStyle=1;verticalAlign=top;spacingTop=8;arcSize=5;
```

**用例（椭圆）：**
```
ellipse;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=12;
尺寸：width=150, height=40
```

**系统用例（区分色）：**
- 普通用例：`fillColor=#dae8fc;strokeColor=#6c8ebf`（蓝色）
- 人员相关用例：`fillColor=#d5e8d4;strokeColor=#82b366`（绿色）
- 系统自动用例：`fillColor=#fff2cc;strokeColor=#d6b656`（黄色）

### 1.3 连线规则

**关联线（Actor → 用例）：**
```
rounded=0;exitX={值};exitY={值};exitDx=0;exitDy=0;entryX={值};entryY={值};entryDx=0;entryDy=0;
```

- 左侧 Actor 到用例：`exitX=1` → `entryX=0`
- 右侧 Actor 到用例：`exitX=0` → `entryX=1`
- 同一 Actor 多条出线：使用不同 exitY 值（均匀分布 0.1~0.95）

**include 关系（虚线箭头）：**
```
dashed=1;endArrow=open;endSize=8;fontSize=10;fontStyle=2;
value="&lt;&lt;include&gt;&gt;"
```

**extend 关系（虚线箭头）：**
```
dashed=1;endArrow=open;endSize=8;fontSize=10;fontStyle=2;
value="&lt;&lt;extend&gt;&gt;"
```

### 1.4 布局间距

- 用例垂直间距：≥ 50px（椭圆底部到下一椭圆顶部）
- Actor 与系统边界水平间距：≥ 60px
- 用例分列时列间距：≥ 80px
- 系统边界内边距：≥ 40px

---

## 二、时序图（Sequence Diagram）

> **重要：** 禁止使用 `shape=umlLifeline` 形状。渲染 API 无法正确定位 umlLifeline 上的消息箭头（所有消息会堆积在底部）。必须使用下方的手动绘制方式。

### 2.1 手动绘制方式（强制）

时序图由以下独立元素手动组合：

1. **参与者框**：普通圆角矩形，顶部和底部各一组（镜像）
2. **生命线**：虚线 edge（endArrow=none），从参与者框底部到底部参与者框顶部
3. **消息箭头**：水平 edge，使用 sourcePoint/targetPoint 绝对坐标定位
4. **分组标题**：全宽矩形，横跨所有生命线，作为场景分隔

### 2.2 元素样式

**参与者框（顶部 + 底部镜像）：**
```
rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=12;fontStyle=1;
尺寸：width=100~120, height=36
```

配色方案（按角色区分）：
- 用户/管理员：`fillColor=#dae8fc;strokeColor=#6c8ebf`（蓝色）
- 前端页面：`fillColor=#e1d5e7;strokeColor=#9673a6`（紫色）
- 后端服务：`fillColor=#fff2cc;strokeColor=#d6b656`（黄色）
- 数据库：`fillColor=#f8cecc;strokeColor=#b85450`（红色）

**生命线（虚线竖线）：**
```xml
<mxCell id="life1" style="endArrow=none;dashed=1;strokeColor=#999999;dashPattern=4 4;" edge="1" parent="1">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="{参与者中心X}" y="{参与者底部Y}" as="sourcePoint"/>
    <mxPoint x="{参与者中心X}" y="{底部参与者顶部Y}" as="targetPoint"/>
  </mxGeometry>
</mxCell>
```

**同步消息（实线实心箭头，从左到右）：**
```xml
<mxCell id="m1" value="消息描述" style="endArrow=block;endFill=1;html=1;fontSize=11;verticalAlign=bottom;" edge="1" parent="1">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="{源生命线X}" y="{Y坐标}" as="sourcePoint"/>
    <mxPoint x="{目标生命线X}" y="{Y坐标}" as="targetPoint"/>
  </mxGeometry>
</mxCell>
```

**返回消息（虚线开放箭头，从右到左）：**
```xml
<mxCell id="m2" value="返回描述" style="endArrow=open;endFill=0;dashed=1;html=1;fontSize=11;verticalAlign=bottom;" edge="1" parent="1">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="{源生命线X}" y="{Y坐标}" as="sourcePoint"/>
    <mxPoint x="{目标生命线X}" y="{Y坐标}" as="targetPoint"/>
  </mxGeometry>
</mxCell>
```

**自调用（本地处理）：**
```xml
<mxCell id="m_self" value="本地校验描述" style="endArrow=block;endFill=1;html=1;fontSize=11;verticalAlign=bottom;" edge="1" parent="1">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="{生命线X}" y="{Y1}" as="sourcePoint"/>
    <mxPoint x="{生命线X}" y="{Y2}" as="targetPoint"/>
    <Array as="points"><mxPoint x="{生命线X+40}" y="{Y1}"/><mxPoint x="{生命线X+40}" y="{Y2}"/></Array>
  </mxGeometry>
</mxCell>
```

**分组标题（全宽横条）：**
```xml
<mxCell id="g1" value="场景名称" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#f0f0f0;strokeColor=#333333;fontSize=12;fontStyle=1;verticalAlign=middle;" vertex="1" parent="1">
  <mxGeometry x="40" y="{Y}" width="730" height="28" as="geometry"/>
</mxCell>
```

### 2.3 布局规则

- 参与者水平间距：≥ 150px（中心到中心）
- 消息垂直间距：≥ 40px
- 分组标题与首条消息间距：≥ 50px
- 分组之间间距：≥ 40px
- 底部参与者框与最后一条消息间距：≥ 60px
- 生命线 X 坐标 = 参与者框中心 X

### 2.4 内容规范

- 消息文字必须反映实际业务场景（含具体字段名、校验规则、状态值）
- 每个分组对应一个完整的用户操作场景
- 返回消息必须说明返回的具体数据内容
- 自调用用于表示本地校验/计算（前端校验、后端业务规则校验）

---

## 三、类图 / ER 图

### 3.1 类节点样式

```
swimlane;fontStyle=1;align=center;startSize=26;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;
```

### 3.2 关系连线

- 继承：`endArrow=block;endFill=0;`
- 实现：`dashed=1;endArrow=block;endFill=0;`
- 关联：`endArrow=open;endFill=0;`
- 组合：`endArrow=diamond;endFill=1;`
- 聚合：`endArrow=diamond;endFill=0;`

### 3.3 ER 关系标注

在连线上标注基数：`1`、`*`、`0..1`、`1..*`

---

## 四、自检清单

生成 XML 后、输出前，逐项检查：

- [ ] Actor 使用 umlActor 形状，不是普通矩形
- [ ] 系统边界使用虚线框，包裹所有用例
- [ ] 同一 Actor 的多条出线使用不同 exitY 值
- [ ] include/extend 使用虚线箭头 + 斜体标签
- [ ] 用例椭圆大小一致（同类用例 width/height 相同）
- [ ] 连线不穿过其他用例节点
- [ ] 无 emoji 字符
