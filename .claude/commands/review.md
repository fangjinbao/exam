---
description: 代码审查 — 对当前改动调用 code-reviewer（涵盖代码质量+安全）
---

# /review

手动触发代码审查流程。

## 行为

1. 检查当前有哪些未提交的改动
2. 调用 code-reviewer agent 审查所有改动（涵盖代码质量+安全检查）
3. 报告审查结果
4. 修复 CRITICAL/HIGH 问题
