---
updated: 2026-05-16
version: 1.0
scope: global
description: CSS 选择器模式规范，适用于 annotation 技能
---
# CSS 选择器策略

## 核心原则

**标注系统与任何 UI 库无关**。selector 永远使用我们自己注入的 `.annot-*` class，不依赖代码原有的 class，也不猜 UI 库渲染出的 class。

```
❌ 错误：selector: ".ant-table-tbody .ant-tag"
❌ 错误：selector: ".el-table__row"
❌ 错误：selector: ".filter-card"（代码原有，可能被重构）
✅ 正确：selector: ".annot-inspection-task-filter"（我们注入，稳定可控）
```

---

## 标注 class 命名规范

### 推荐格式

**同一页面内唯一**即可，有两种风格：

**简短风格（推荐，单页面场景）**：`annot-{name}`
- 适合单页面内标注，class 名短好读
- 示例：`annot-btn-add`、`annot-btn-export`、`annot-table`、`annot-filter-fields`

**完整风格（跨页面/大项目）**：`annot-{page}-{category}-{name}`
- 跨多个页面/子项目时避免命名冲突
- 示例：`annot-inspection-task-action-add`、`annot-equipment-archive-field-table`

两种风格**不能混用**。同一项目内选一种，统一到底。

### 字段说明

- **annot-**：统一前缀，避免与业务 class 冲突（强制）
- **{page}**：页面标识（路由去斜杠，如 `/inspection/task` → `inspection-task`）
- **{category}**：功能分类（`filter` / `action` / `field` / `rule` / `custom`）
- **{name}**：具体功能名（短横线命名，语义化）

### 示例（简短风格）

| 功能区域 | class 名 |
|---------|---------|
| 筛选区整体 | `annot-filter-fields` |
| 操作栏新增按钮 | `annot-btn-add` |
| 操作栏导入按钮 | `annot-btn-import` |
| 操作栏导出按钮 | `annot-btn-export` |
| 批量删除按钮 | `annot-btn-batch-delete` |
| 列表整体 | `annot-table` |
| 列表操作列 - 编辑 | `annot-btn-edit` |
| 列表操作列 - 删除 | `annot-btn-delete` |
| 新增/编辑表单 | `annot-form-fields` |
| 导入弹窗内容区 | `annot-import-modal` |

---

## class 注入位置策略

读代码时，根据**功能粒度**决定把 class 加到哪个 DOM 节点：

| 功能粒度 | 注入位置 | 说明 |
|---------|---------|------|
| 筛选区 | 筛选表单外层容器（`<a-space>` / form） | 整个筛选组件 |
| 单个操作按钮（常驻显示） | 按钮本身 | 每个常驻按钮（新增/导入/导出/批量删除）单独注入 class |
| 列表整体 | 表格组件（`<a-table>` / `<el-table>`） | 直接加在表格组件上 |
| 表格操作列按钮（常驻） | 每个操作按钮本身 | 表格行内操作列常驻渲染，编辑/删除各自一个 class |
| **列表项卡片内 hover 操作按钮** | **常驻祖先容器（列表项首项的常驻行）** | **hover 才显示的编辑/删除/停用，合并为一个标注挂到常驻容器，禁止挂按钮本身** |
| 新增/编辑表单 | 表单组件本身（`<a-form>`） | 一个标注覆盖所有字段 |
| 弹窗内容 | 弹窗内容区外层 div | `container: modal` |
| 抽屉内容 | 抽屉内容区外层 div | `container: drawer` |

**重要原则：按钮类 class 加在按钮本身，不要挂在操作栏容器上。** 操作栏容器如果被单独标注，它的范围会覆盖所有子按钮，造成和每个按钮标注重叠（视觉上多出一个多余的点）。

---

## hover / 条件显示元素的定位（必读）

<EXTREMELY-IMPORTANT>
标注点靠目标元素的 `getBoundingClientRect()` 定位。若元素默认 `display:none` / `opacity:0` / `v-show=false`，常态下尺寸为 0，标注点会掉到屏幕左上角 (0,0) 或乱跑出屏幕。

**禁止把 class 注入到 hover/条件显示的元素本身。必须上移到最近的常驻显示祖先容器。**
</EXTREMELY-IMPORTANT>

识别信号：父级有 `@mouseenter`/`@mouseleave`、CSS 默认 `opacity:0`/`display:none` hover 恢复、`v-show`/`v-if` 绑定 hover 或选中状态。

处理方式：
1. 找最近的常驻祖先（v-for 列表项用**首项**做锚点，避免 class 匹配多个元素）
2. 多个条件操作（编辑/停用/删除）合并为**一个**标注点，content 分段说明
3. className 用容器语义，如 `annot-{pageKey}-action-item-ops`

---

## 注入原则

1. **最小侵入**：只加 class，不改其他属性、不改结构、不加 wrapper（如果原本没有 span/div 容器，才加一层 span）
2. **语义清晰**：class 名看到就知道指向哪个功能
3. **全局唯一**：整个项目里 `.annot-xxx` 不能重复
4. **永久保留**：标注 class 跟随代码一起维护，不删除（除非删除对应功能）

---

## 降级策略（selector 留空时）

极少数情况（如临时标注、还没注入 class），selector 可以留空字符串 `""`，此时：

- 标注系统按 `category + title` 关键词匹配，降级选择器使用 `[class*="xxx"]` 属性包含匹配
- 这种方式不稳定，**只用作临时过渡，正式标注必须通过 class 注入**

---

## 好处

- ✅ 换 UI 库完全不受影响（Ant Design → Element Plus → Vant → TDesign）
- ✅ 代码重构时，只要 `.annot-xxx` class 保留，标注就不会失效
- ✅ 不需要 selector-validator 验证（class 是我们加的，100% 存在）
- ✅ 不需要降级推断（selector 总是精确命中）
- ✅ 多个标注点天然分离（每个标注一个独立 class，不会重叠）
