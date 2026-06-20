---
updated: 2026-05-22
version: 2.1
scope: global
description: Agent 编排规则，包含何时使用哪个 agent、并行执行原则、多视角分析、模型路由、知识库强制调用
---
# Agent 编排规范

## 可用 Agent 一览

| Agent | 用途 | 触发时机 |
|-------|------|---------|
| `req-analyzer` | 需求分析，提取功能摘要 | 生成/反向同步 SRS 前 |
| `req-writer` | 撰写 SRS 章节内容 | req-doc 技能调用 |
| `req-reviewer` | 审查 SRS 质量 | 每个功能模块写完后 |
| `annotation-prd-analyzer` | 分析需求，输出标注清单 | annotation 技能第一阶段 |
| `annotation-code-locator` | 定位 DOM 节点，输出注入清单 | annotation 技能第二阶段 |
| `page-spec-loader` | 加载项目规范，规划组件 | page-generator 技能第 2 步 |
| `page-reviewer` | 验收生成的页面代码 | page-generator 技能第 6 步 |
| `feasibility-analyzer` | 分析项目文档，提取结构化信息 | feasibility-report 技能 |
| `feasibility-writer` | 撰写可研报告章节 | feasibility-report 技能 |
| `feasibility-reviewer` | 审查可研报告质量 | 每章写完后 |
| `design-advisor` | 查询 UI/UX 设计规范 | page-generator 技能第 3 步 |
| `delivery-analyzer` | 分析依赖关系，生成交付计划 | delivery-plan 技能 |
| `planner` | 功能实现规划 | 复杂功能实现前 |
| `code-reviewer` | 代码质量+安全审查 | 写完代码后 |

## 知识库强制调用规则

**所有 Agent 在执行任务前，必须先读取 `.claude/knowledge/` 目录下对应规范文件获取对应规范。**

spawn 子 Agent 时，prompt 开头必须包含：
```
【强制前置步骤】在开始工作前，你必须先调用 Read(".claude/knowledge/conventions/coding.md") 获取编码规范。未完成此调用前禁止执行任何后续操作。
```

## 必须立即使用 Agent 的场景

无需等用户提示，遇到以下情况主动调用：

1. 复杂功能实现 → 先用 `planner` 规划，再用 `page-spec-loader` 加载规范
2. 写完代码后 → 调用 `code-reviewer` 自查（涵盖代码质量+安全）
3. 新功能/Bug 修复 → 遵循 `conventions/testing` TDD 流程

## 条件性激活（避免过度调用）

| 变更范围 | 需要的 Agent |
|---------|-------------|
| 单文件 < 20 行纯样式/文案 | code-reviewer |
| 单文件逻辑修改 | code-reviewer |
| 多文件变更（> 3 个） | code-reviewer |
| 涉及 auth/guard/middleware | code-reviewer（重点审查安全） |
| 新增 API 端点 | code-reviewer（重点审查安全） |
| 架构变更 | planner + code-reviewer |

## 并行执行原则

**无依赖关系的操作必须并行，不能串行。**

```
# 正确：并行（1 条消息 = 所有独立操作）
同一条消息同时调用：
- Agent 1：读取需求文档
- Agent 2：读取已有代码
- Agent 3：读取规范文件

# 错误：串行（浪费时间）
先 Agent 1，再 Agent 2，再 Agent 3
```

## 多视角分析

复杂问题使用多角色子 Agent 并行分析：
- 需求完整性审查者
- 技术可行性评估者
- 安全性审查者
- 一致性检查者

## 模型路由策略

根据任务复杂度选择模型，节省成本：

| 任务类型 | 推荐模型 | 原因 |
|---------|---------|------|
| 简单机械操作（重命名、格式化） | haiku | 不需要深度推理 |
| 标准 CRUD 页面生成 | sonnet | 模式明确，sonnet 足够 |
| 架构设计、安全审查、复杂调试 | opus | 需要深度推理和全局视角 |

## 并行 Agent 派发模板

当面对 2+ 个独立问题时（不同测试文件、不同子系统、不同 bug），并行派发而非串行调查。

### 何时使用

- 3+ 个测试文件因不同根因失败
- 多个子系统独立出问题
- 每个问题可以独立理解，不需要其他问题的上下文

### 何时不使用

- 失败之间有关联（修一个可能修好其他的）
- 需要理解完整系统状态
- Agent 之间会互相干扰（编辑同一文件）

### Agent Prompt 结构

好的 Agent prompt 必须：
1. **聚焦** — 一个明确的问题域
2. **自包含** — 包含理解问题所需的所有上下文
3. **明确输出** — Agent 应该返回什么

```markdown
【强制前置步骤】在开始工作前，你必须先调用 Read(".claude/knowledge/conventions/coding.md") 获取编码规范。

修复 src/modules/user/user.service.spec.ts 中的 3 个失败测试：

1. "should validate email format" — 期望抛出 ValidationError 但收到 undefined
2. "should hash password before save" — hash 结果为 null
3. "should prevent duplicate registration" — 期望 409 但收到 500

你的任务：
1. 读取测试文件，理解每个测试验证什么
2. 识别根因 — 是时序问题还是实际 bug？
3. 修复方式：
   - 修复实现中的 bug
   - 不要只是增加超时 — 找到真正的问题
4. 不要修改其他文件

返回：根因摘要 + 修复内容 + 四状态报告（DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED）
```

### 派发后验证

Agent 返回后：
1. 阅读每个摘要 — 理解改了什么
2. 检查冲突 — Agent 之间是否编辑了相同代码
3. 运行完整测试套件 — 验证所有修复协同工作
4. 抽查 — Agent 可能犯系统性错误

---

## Agent 调用规则

- Agent 只做自己职责范围内的事，不越界
- Agent 输出结果后由主流程决定下一步，不自行决策
- 技能内部的 Agent 协作由技能自动调度，主流程不干预
- Agent 完成后如有 concerns，必须在输出中明确标注，不能静默忽略
- 子 Agent 不能触发技能流程（见 `<SUBAGENT-STOP>` 规则）
- 子 Agent 不能派发更多子 Agent
