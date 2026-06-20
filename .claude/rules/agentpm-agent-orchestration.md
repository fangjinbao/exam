# Agent 编排

## 自动调用规则（无需用户提示）

<EXTREMELY-IMPORTANT>
以下 agent 调用是强制的。不存在"这次不需要"的例外。
跳过 = 违反项目规则。
</EXTREMELY-IMPORTANT>

### 必须调用的 Agent

| 触发条件 | Agent | 时机 |
|---------|-------|------|
| 写完/修改任何代码后 | **code-reviewer** | 每组相关改动完成后，向用户报告前 |
| 复杂功能实现前（多文件、架构决策） | **planner** | 写代码前 |
| 构建失败 | 自行修复后重新验证 | 不报告"失败了" |

### 子 Agent 规则

1. 子 Agent 不继承主流程上下文
2. spawn 时必须在 prompt 开头注入知识库调用指令（见 spawn-subagent.md）
3. 子 Agent 不触发技能流程
4. 子 Agent 不派发更多子 Agent
5. 子 Agent 报告四状态：DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED

### code-reviewer 调用标准

**什么算"一组相关改动"：**
- 修改同一个功能的多个文件 → 全部改完后调用一次
- 修改不相关的多个功能 → 每个功能改完后各调用一次
- 单个文件的单次修改 → 改完立即调用

**code-reviewer 发现问题后：**
1. CRITICAL / HIGH → 必须修复
2. MEDIUM → 修复成本低就修
3. LOW → 记录但不一定修复
4. 修复后不需要再次 review（除非修复引入 >30 行新代码）
5. 如果不同意建议 → 说明理由，不盲目执行

**code-reviewer 报告四种状态：**
- **DONE** — 无问题，继续
- **DONE_WITH_CONCERNS** — 有 MEDIUM/LOW 问题，可继续但建议修复
- **NEEDS_CONTEXT** — 缺少上下文，需补充
- **BLOCKED** — 有 CRITICAL/HIGH 问题，必须修复
