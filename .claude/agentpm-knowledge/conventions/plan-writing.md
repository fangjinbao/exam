---
updated: 2026-05-22
version: 1.0
scope: global
description: 实现计划编写规范，包含任务粒度、禁止占位符、自审清单、文件结构映射
---
# 实现计划编写规范

## 核心原则

```
计划是给零上下文的工程师写的操作手册
每一步必须包含实际内容，不能有占位符
```

---

## 任务粒度：咬一口大小

每个步骤是一个动作（2-5 分钟）：

```
- "写失败测试" — 一步
- "运行测试确认失败" — 一步
- "实现最小代码让测试通过" — 一步
- "运行测试确认通过" — 一步
- "提交" — 一步
```

**不是一步的：**
- "实现用户认证模块"（太大）
- "添加适当的错误处理"（太模糊）
- "类似任务 3"（不自包含）

---

## 禁止占位符

以下内容出现在计划中 = 计划失败：

| 禁止内容 | 为什么是失败 |
|---------|------------|
| "TBD"、"TODO"、"后续补充" | 工程师无法执行 |
| "添加适当的错误处理" | 什么是"适当的"？ |
| "添加验证" | 验证什么？规则是什么？ |
| "处理边界情况" | 哪些边界情况？ |
| "写测试覆盖以上功能" | 没有实际测试代码 |
| "类似任务 N" | 工程师可能乱序阅读 |
| 描述做什么但不展示怎么做 | 代码步骤必须有代码块 |
| 引用未在任何任务中定义的类型/函数 | 悬空引用 |

---

## 计划文档结构

### 头部（必须）

```markdown
# [功能名称] 实现计划

**目标：** [一句话描述构建什么]

**架构：** [2-3 句话描述方法]

**技术栈：** [关键技术/库]

---
```

### 文件结构映射（必须）

在定义任务之前，列出所有将创建或修改的文件及其职责：

```markdown
## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/modules/user/user.service.ts` | 修改 | 添加密码重置逻辑 |
| `src/modules/user/user.controller.ts` | 修改 | 添加重置端点 |
| `tests/user/password-reset.spec.ts` | 新建 | 密码重置测试 |
```

### 任务结构

````markdown
### 任务 N：[组件名称]

**文件：**
- 新建：`exact/path/to/file.ts`
- 修改：`exact/path/to/existing.ts:123-145`
- 测试：`tests/exact/path/to/test.ts`

- [ ] **步骤 1：写失败测试**

```typescript
describe('resetPassword', () => {
  it('should send reset email for valid user', async () => {
    const result = await service.resetPassword('user@example.com');
    expect(result.sent).toBe(true);
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`npm test -- --testPathPattern=password-reset`
预期：FAIL — "resetPassword is not defined"

- [ ] **步骤 3：实现最小代码**

```typescript
async resetPassword(email: string) {
  const user = await this.userRepo.findByEmail(email);
  if (!user) throw new NotFoundException();
  await this.mailService.sendResetLink(user);
  return { sent: true };
}
```

- [ ] **步骤 4：运行测试确认通过**

运行：`npm test -- --testPathPattern=password-reset`
预期：PASS

- [ ] **步骤 5：提交**

```bash
git add src/modules/user/user.service.ts tests/user/password-reset.spec.ts
git commit -m "feat(user): add password reset service method"
```
````

---

## 自审清单

计划写完后，必须执行以下检查：

1. **需求覆盖** — 逐条对照需求，每条需求都能指向一个任务
2. **占位符扫描** — 搜索上方"禁止内容"表中的所有模式
3. **类型一致性** — 后面任务中使用的类型/方法名是否与前面定义的一致
4. **路径准确性** — 所有文件路径是否存在或将被创建

发现问题直接修复，不需要重新审查。

---

## 范围检查

如果需求覆盖多个独立子系统，应拆分为多个计划：
- 每个计划独立产出可工作、可测试的软件
- 计划之间通过接口定义依赖
- 按依赖顺序执行

---

## 执行交接

计划保存后，提供执行选项：

1. **子 Agent 驱动**（推荐）— 每个任务派发独立子 Agent，任务间有审查
2. **内联执行** — 在当前会话中逐任务执行

选择子 Agent 驱动时，遵循 `conventions/subagent-development` 规范。
