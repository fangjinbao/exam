---
updated: 2026-05-22
version: 2.0
scope: global
description: 前端 Web 规范，包含文件组织、CSS 变量、语义化 HTML、性能指标、设计质量
---
# 前端 Web 规范

## 文件组织

按功能/模块组织，不按文件类型组织：

```
src/
├── views/
│   └── Equipment/          # 模块目录（大驼峰）
│       └── Archive/        # 功能目录（大驼峰）
│           ├── index.vue   # 页面入口
│           └── components/ # 页面私有组件
├── api/                    # 接口层（按模块一个文件）
├── mock/                   # Mock 层（与 api/ 一一对应）
├── router/modules/         # 路由模块（kebab-case）
├── components/             # 全局公共组件
├── composables/            # 组合式函数（use 前缀）
├── store/modules/          # Pinia store
└── styles/                 # 全局样式
```

## CSS 变量

用 CSS 自定义属性定义设计 token，不要重复硬编码颜色、间距、字体：

```css
:root {
  --color-primary: #2563eb;
  --color-text: #1f2937;
  --color-border: #e5e7eb;

  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;

  --duration-fast: 150ms;
  --duration-normal: 300ms;
}
```

## 语义化 HTML

优先使用语义化标签，不要用 `div` 堆叠：

```html
<!-- 错误 -->
<div class="header">
  <div class="nav">...</div>
</div>

<!-- 正确 -->
<header>
  <nav aria-label="主导航">...</nav>
</header>
```

## 动画性能

只动画合成器友好的属性：
- ✅ `transform`、`opacity`、`clip-path`
- ❌ `width`、`height`、`top`、`left`、`margin`、`padding`

## 性能指标目标

| 指标 | 目标 |
|------|------|
| LCP（最大内容绘制） | < 2.5s |
| INP（交互到下一帧） | < 200ms |
| CLS（累积布局偏移） | < 0.1 |
| FCP（首次内容绘制） | < 1.5s |

## Bundle 体积预算

| 页面类型 | JS（gzip） | CSS |
|---------|-----------|-----|
| 管理后台页面 | < 300kb | < 50kb |
| 落地页 | < 150kb | < 30kb |

## 图片优化

- 始终设置明确的 `width` 和 `height`
- 首屏图片：`loading="eager" fetchpriority="high"`
- 非首屏图片：`loading="lazy"`
- 优先使用 WebP/AVIF 格式

## 性能检查清单

- [ ] 所有图片有明确尺寸
- [ ] 无意外的渲染阻塞资源
- [ ] 动态内容不引起布局偏移
- [ ] 第三方脚本异步/延迟加载

---

## 设计质量规范（反模板策略）

**生成的页面不能看起来像"AI 默认模板"。**

### 禁止的模板化模式

| 模式 | 为什么差 | 替代方案 |
|------|---------|---------|
| 千篇一律的卡片网格 | 无层次感，信息平铺 | 根据内容重要性设计不同权重的布局 |
| 未修改的组件库默认样式 | 看起来像 demo | 至少调整间距、圆角、阴影适配业务场景 |
| 所有数字五颜六色 | 视觉噪音 | 统一色调，只对关键指标用强调色 |
| 到处加图标装饰 | AI 风格明显 | 图标只在有功能意义时使用 |
| 过度使用渐变和阴影 | 廉价感 | 克制使用，一个页面最多 1-2 处强调 |

### 必须具备的设计质量

- **层次感**：标题 > 正文 > 辅助信息，通过字号/字重/颜色区分
- **呼吸感**：留白充足，不要把所有空间填满
- **一致性**：同类元素用相同的间距、圆角、阴影
- **克制**：一个页面的视觉焦点不超过 2 个

### 组件库使用原则

- 优先使用组件库自带的 design token（颜色、间距、圆角变量）
- 不覆盖组件库的全局样式，只在 scoped 内做增强
- 不要为了"好看"给组件加组件库没有的 prop（如自定义 effect）
