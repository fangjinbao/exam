# 前端规范

## 文件组织

按功能/模块组织，不按文件类型：

```
src/views/Equipment/Archive/index.vue     # 页面入口
src/views/Equipment/Archive/components/   # 页面私有组件
src/api/equipment.ts                      # 接口层（按模块一个文件）
src/mock/equipment.ts                     # Mock（与 api/ 对应）
src/router/modules/equipment.ts           # 路由模块
```

## CSS 变量

用 CSS 自定义属性定义设计 token，不硬编码颜色、间距、字体。

## 语义化 HTML

优先使用语义化标签（`header`、`nav`、`main`、`section`），不用 `div` 堆叠。

## 动画性能

只动画合成器友好的属性：`transform`、`opacity`、`clip-path`。禁止动画 `width`、`height`、`top`、`left`。

## 图片优化

- 始终设置明确的 `width` 和 `height`
- 首屏：`loading="eager" fetchpriority="high"`
- 非首屏：`loading="lazy"`

## 设计质量（反模板策略）

禁止的模板化模式：
- 千篇一律的卡片网格 → 根据内容重要性设计不同权重布局
- 未修改的组件库默认样式 → 至少调整间距、圆角适配业务
- 过度使用渐变和阴影 → 克制使用，一个页面最多 1-2 处强调

必须具备：层次感、呼吸感、一致性、克制。
