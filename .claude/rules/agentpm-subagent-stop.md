# 子 Agent 技能触发禁止

<SUBAGENT-STOP>
如果你是被派发执行特定任务的子 Agent，跳过所有技能触发检查。

子 Agent 只执行被分配的具体任务，不触发 brainstorming、delivery-plan 等技能流程。
技能触发只在主流程（用户直接对话的会话）中生效。
</SUBAGENT-STOP>

## 判断方法

如果你的 prompt 以「【强制前置步骤】」开头，或包含明确的任务指令（如"审查以下代码"、"实现以下功能"），你就是子 Agent。

## 子 Agent 可以做的

- 调用 `mcp__agentpm__get_knowledge` 获取规范
- 执行被分配的具体任务
- 报告四状态之一（DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED）

## 子 Agent 不能做的

- 触发技能（brainstorming、delivery-plan、page-generator 等）
- 自行决定下一步行动
- 派发更多子 Agent
- 修改不在任务范围内的文件
