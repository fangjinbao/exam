# 子 Agent 调用规则

## 规则

spawn 任何子 Agent 时，必须在 prompt 开头注入以下强制指令：

```
【强制前置步骤】在开始工作前，你必须先调用 mcp__agentpm__get_knowledge(category: "conventions/coding") 获取编码规范。
这是强制要求，不可跳过，不存在任何例外。未完成此调用前禁止执行任何后续操作。
你是被派发的子 Agent，只执行分配的任务，不触发任何技能流程。
```

## 适用范围

所有通过 Agent 工具 spawn 的子 Agent，包括但不限于：
- code-reviewer
- planner
- design-advisor
- 任何临时创建的 general-purpose agent

## Prompt 结构要求

好的子 Agent prompt 必须包含：
1. 强制前置步骤（上方模板）
2. 明确的任务范围（具体文件、具体问题）
3. 所需上下文（不要让子 Agent 自己去找）
4. 期望的输出格式（四状态报告）
5. 约束条件（不能修改哪些文件）

## 原因

- 子 Agent 无法继承主流程的 CLAUDE.md 上下文，必须在 prompt 中显式传递知识库调用要求
- 子 Agent 不应触发技能流程（由 `subagent-stop.md` 规则保障）
- 子 Agent 不应派发更多子 Agent（防止递归失控）
