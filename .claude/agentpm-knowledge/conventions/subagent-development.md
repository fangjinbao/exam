---
updated: 2026-05-22
version: 1.0
scope: global
description: 子 Agent 驱动开发规范，包含三角色审查、四状态协议、Implementer/Spec Reviewer/Code Quality Reviewer 模板
---
# 子 Agent 驱动开发

## 核心原则

每个任务由独立子 Agent 执行，执行后经过两阶段独立审查：先需求符合性，再代码质量。

```
Implementer（实现） → Spec Reviewer（需求审查） → Code Quality Reviewer（质量审查）
```

三个角色独立，不能合并。修复后必须重新审查，循环直到通过。

---

## 何时使用

- 有明确的实现计划（来自 planner 或 delivery-plan）
- 任务之间相对独立
- 需要高质量保证的功能开发

---

## Implementer（实现者）四状态协议

子 Agent 完成任务后必须报告以下四种状态之一：

| 状态 | 含义 | 主流程处理 |
|------|------|-----------|
| `DONE` | 完成，无疑虑 | 进入 Spec Review |
| `DONE_WITH_CONCERNS` | 完成但有疑虑 | 读取 concerns，评估后决定是否进入 Review |
| `NEEDS_CONTEXT` | 缺少信息无法完成 | 补充上下文后重新派发 |
| `BLOCKED` | 无法完成 | 评估阻塞原因（见下方处理规则） |

### BLOCKED 处理规则

1. 上下文不足 → 补充信息，重新派发同模型
2. 任务超出能力 → 用更强模型重新派发
3. 任务太大 → 拆分为更小的子任务
4. 计划本身有问题 → 向用户说明，请求指导

**永远不要忽略 BLOCKED 或强制同一个 Agent 重试而不做任何改变。**

---

## Spec Reviewer（需求符合性审查）

### 核心原则：不信任 Implementer 的报告

```
实现者声称完成 ≠ 实际完成
必须独立读取代码验证，不能只看报告
```

### 审查内容

1. **缺失需求** — 是否所有需求都实现了？有没有跳过的？
2. **多余实现** — 是否做了需求之外的东西？过度工程？
3. **理解偏差** — 是否误解了需求？解决了错误的问题？

### 输出格式

```
✅ 需求符合 — 所有需求已实现，无多余内容
❌ 发现问题：
  - [缺失] xxx 功能未实现（文件:行号）
  - [多余] xxx 不在需求中但被实现了
  - [偏差] xxx 的实现方式与需求不符
```

### 规则

- Spec Review 通过后才能进入 Code Quality Review
- 发现问题 → Implementer 修复 → 重新 Spec Review
- 不能跳过重新审查

---

## Code Quality Reviewer（代码质量审查）

### 前置条件：Spec Review 已通过

### 审查内容

1. 每个文件是否职责单一、接口清晰
2. 单元是否可独立理解和测试
3. 是否遵循项目已有模式
4. 新文件是否已经过大，或显著增大了已有文件
5. 安全性、性能、可维护性

### 输出格式

```
优点：[列出做得好的地方]
问题：
  - [Critical] xxx（文件:行号）— 必须修复
  - [Important] xxx — 应该修复
  - [Minor] xxx — 建议修复
评估：通过 / 需修复
```

### 规则

- 发现 Critical/Important → Implementer 修复 → 重新 Code Quality Review
- Minor 可以标注但不阻断
- 不能在 Spec Review 之前执行 Code Quality Review

---

## 模型路由

根据任务复杂度选择最经济的模型：

| 任务特征 | 推荐模型 |
|---------|---------|
| 1-2 个文件，规格明确，机械操作 | haiku / sonnet |
| 多文件协调，需要集成判断 | sonnet |
| 架构设计、安全审查、复杂调试 | opus |

---

## 连续执行规则

**不要在任务之间停下来问用户"要继续吗？"**

用户要求执行计划 = 授权你连续执行所有任务。唯一停止的理由：
- BLOCKED 且无法自行解决
- 遇到真正的歧义无法推进
- 所有任务完成

进度汇报和"Should I continue?"浪费用户时间。

---

## 完整流程

```
1. 读取计划，提取所有任务
2. 对每个任务：
   a. 派发 Implementer 子 Agent（含完整任务描述 + 上下文）
   b. 收到报告，处理四状态
   c. 派发 Spec Reviewer（含需求原文 + 实现者报告）
   d. Spec Review 通过？
      - 否 → Implementer 修复 → 重新 Spec Review
      - 是 → 继续
   e. 派发 Code Quality Reviewer
   f. Quality Review 通过？
      - 否 → Implementer 修复 → 重新 Quality Review
      - 是 → 标记任务完成
3. 所有任务完成后，派发最终全局审查
```

---

## 迭代检索模式

子 Agent 返回结果后，主流程不能直接接受。必须评估返回质量：

```
1. 子 Agent 返回结果
2. 主流程评估：结果是否充分回答了问题？
3. 不充分 → 追问具体问题，子 Agent 回到源头补充
4. 循环直到充分（最多 3 轮）
5. 充分 → 接受结果，继续下一步
```

**关键：传递目标上下文，不只是查询本身。**

子 Agent 只知道字面查询，不知道请求背后的目的。主流程有语义上下文，必须在 prompt 中传递。

---

## Red Flags（绝对禁止）

- 跳过 Spec Review 直接做 Code Quality Review
- Spec Review 发现问题后不修复就继续
- 让 Implementer 的自审代替独立审查
- 并行派发多个 Implementer（会冲突）
- 让子 Agent 自己读计划文件（应由主流程提供完整文本）
- 忽略子 Agent 的问题（必须回答后再继续）
- 接受"差不多符合"的 Spec Review 结果
- 不评估子 Agent 返回就直接使用（必须验证）
