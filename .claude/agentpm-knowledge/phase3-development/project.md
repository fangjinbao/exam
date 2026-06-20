---
updated: 2026-05-16
version: 1.0
scope: global
description: 通用页面开发规范，包含文件目录、命名、路由、封装原则
---
# 项目规范指南（通用）

本文件为 page-generator 技能提供通用约束，适配任意前端项目。  
**项目特有规范**（技术栈、路由格式、组件库用法）在各子项目的 `.claude/knowledge/` 中。

---

## 一、第一原则

**只做被要求的事，不自作主张。**

- 需求里没有的字段、交互、样式，一律不加
- 如果认为某个改动有必要，先问用户，不要直接做
- 所有生成的代码必须有注释（组件用途、功能块说明、复杂逻辑解释）
- 优先复用已有公共组件，不重复造轮子

---

## 二、文件目录规范

### 整体结构（推断为主）

读取 `src/views/` 已有目录，观察命名风格后遵循，不要引入新的命名风格。

通用惯例：
```
src/
├── api/              # 接口请求（按模块一个文件）
├── mock/             # Mock 数据（按模块一个文件）
├── router/           # 路由配置
├── views/            # 页面
│   └── ModuleName/   # 模块目录（大驼峰）
│       └── Feature/  # 功能目录（大驼峰）
│           ├── index.vue
│           └── components/   # 页面私有组件
└── components/       # 全局公共组件
```

### 命名规则

| 类型 | 命名规则 | 示例 |
|-----|---------|------|
| 模块/功能目录 | 大驼峰 | `Equipment/Archive/` |
| 页面入口 | 固定为 `index.vue` | `index.vue` |
| 页面私有组件 | 大驼峰 + 功能后缀 | `ArchiveForm.vue`、`ImportDialog.vue` |
| api / mock / router 文件 | 小驼峰 | `equipment.ts` |

---

## 三、路由规范（推断为主）

读取已有路由文件，观察并遵循：
- `name` 命名规则（大驼峰拼接 / 点分隔）
- `path` 格式（`/module/feature`）
- `meta` 字段（title、icon、keepAlive 等）
- 菜单是否从路由 meta 自动生成，还是需要手动维护

---

## 四、API 文件规范（推断为主）

读取已有 api 文件，观察：
- request 封装路径（`@/utils/http` / `@/utils/request` 等）
- 响应格式（`{ code, data, message }` 等）
- 是否有统一的类型定义文件
- Mock 开关机制（环境变量 / 拦截器 等）

---

## 五、页面封装原则

**页面主体（筛选、操作栏、表格）写在 index.vue，有独立 open 状态的交互单元封装成组件。**

封装判断标准：**有没有独立的打开/关闭状态？有就封装，没有就留在 index.vue。**

| 留在 index.vue | 封装成独立组件 |
|--------------|-------------|
| 筛选区 | 新增/编辑弹窗 |
| 操作栏（按钮） | 详情查看弹窗 |
| 数据表格 | 导入弹窗 |
| 分页器 | 复杂树形侧边栏 |

弹窗组件统一用 `v-model:open` 控制显隐，`@success` 通知父组件刷新。

读取已有页面文件，观察：
- 公共布局组件名称（`PageContainer` / `BasicLayout` 等）及用法
- 全局样式 class 是否已定义
- 已有页面是否有 `components/` 子目录，遵循已有实践

---

## 六、本项目特有约定（AxureMart 一次物流信息化）

> 以下为本项目实际踩坑后沉淀的硬性约定，page-generator 生成 admin 页面时必须遵守，优先级高于"推断"。

### 技术栈与命令

- admin（PC 管理后台）：Vue 3 + TypeScript + Vite + **Element Plus**
- mobile（移动端）：Vue 3 + Vite + **Vant** + Capacitor（JS，非 TS）
- 构建：`cd admin && npx vite build`；类型检查：`cd admin && npx vue-tsc --noEmit`

### admin 卡片样式（强制，参考运单台账页 `views/Waybill/List/index.vue`）

本项目 admin 页面的卡片是**无边框、无阴影**的扁平风格，**禁止**给卡片加边框/阴影/顶部彩条：

```scss
.xxx-card {
  border: none;
  box-shadow: none;
  border-radius: 12px;   // 统一 12px
}
// 对应模板：<ElCard shadow="never" class="xxx-card">
```

- 页面区块之间间距统一 `gap: 16px`
- 顶部统计/KPI 区：放在一张白卡内，多指标用 grid 等分 + 淡分隔线区隔，**不要**做成多个独立色块卡，也**不要**报表页那种顶部 3px 彩条（那是报表页特例，非通用风格）
- 卡片标题 15px / 600 字重 / `var(--el-text-color-primary)`

### admin 表格（强制）

- 内容列一律用 `min-width`，**禁止固定 `width`**（防列错位）；仅序号列/操作列/状态列可用固定 `width`
- 表格用 `border` + `stripe`；空数据用 `empty-text` 给出业务文案
- 列内文本加 `show-overflow-tooltip`

### 颜色与设计 token

- 颜色、间距、字号优先用 Element Plus CSS 变量（`var(--el-color-xxx)`、`var(--el-text-color-xxx)`、`var(--el-border-color-lighter)`），不硬编码 `#xxx`
- 动画只用合成器友好属性（`transform`/`opacity`/`clip-path`），禁止动画 `background`/`border-color`/`width`/`height`

### 运单状态枚举（全项目统一）

`transit 在途 → arrived 到库 → unloading 接卸中 → completed 已完成`（外加 `cancelled 已取消`）；化验结果 `testResult: pass/fail/null`。新增涉及运单状态的功能必须复用此枚举，不另起名。
