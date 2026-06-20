---
updated: 2026-05-16
version: 1.0
scope: global
description: Agent 协作架构说明，各技能内部子 Agent 的角色与调度关系
---
# Agent 协作架构

各技能内部通过子 Agent 协作完成复杂任务，主流程不干预内部调度。

## req-doc 技能

```
req-analyzer    → 从设计文档/代码提取功能摘要
req-writer      → 将摘要转化为 PRD 语言的章节内容
req-reviewer    → 四维度审查（语言规范/章节结构/三要素/提示文案）
```

## feasibility-report 技能

```
feasibility-analyzer  → 分析项目文档，输出结构化摘要
feasibility-writer    → 撰写可研报告章节
feasibility-reviewer  → 审查报告质量
```

## page-generator 技能

```
spec-loader     → 检测技术栈，加载组件库规范
design-advisor  → 查询 ui-ux-pro-max，输出设计决策
page-reviewer   → 四维度验收（需求完整性/规范遵守/代码质量/交互完整性）
```

## annotation 技能

```
annotation-prd-analyzer       → 读取需求文档，生成标注清单
annotation-code-locator       → 读取页面代码，定位 DOM 节点，输出注入清单
```

## 子 Agent 定义文件位置

`.claude/agents/` 目录下，每个 Agent 一个 `.md` 文件，包含角色定义、工具权限、输出格式。
