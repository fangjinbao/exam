---
description: 验证 — 运行构建 + 类型检查，确认当前代码状态
---

# /verify

运行项目验证命令，确认代码状态。

## 行为

1. 运行 `cd admin && npx vue-tsc --noEmit`（类型检查）
2. 运行 `cd admin && npx vite build`（构建）
3. 报告结果：通过/失败 + 错误详情
4. 如果失败，尝试修复后重新验证
