# 会话上下文

## 项目环境

- 包管理器: npm
- 框架: Vue 3 + TypeScript + Vite + Element Plus
- 构建命令: `cd admin && npx vite build`
- 类型检查: `cd admin && npx vue-tsc --noEmit`

## 强制执行清单

1. **技能检查** — 接到任何任务后，第一步扫描技能触发词。1% 可能性就调用 Skill 工具。
2. **code-reviewer** — 写完任何代码后立即调用，无例外，不等用户提醒。涵盖代码质量+安全审查。
3. **SRS 规范扫描** — 修改需求说明书前必须读取规范，修改后必须执行禁用词扫描+跨章节一致性检查。不通过不能报告完成。详见 `agentpm-req-doc-workflow.md`。
4. **验证** — 完成声明前必须运行构建/测试命令，看到输出才能声称通过。

以上不是建议，是强制步骤。跳过任何一项 = 违反项目规则。

## 知识库机制

| 层级 | 机制 | 内容 |
|------|------|------|
| 自动加载 | `.claude/rules/agentpm-*.md` | 核心编码规范、前端规范、工作流规则 |
| 按需读取 | `.claude/agentpm-knowledge/` | 详细规范（测试、安全、TypeScript 等） |

何时 Read agentpm-knowledge/：
- 写测试 → `conventions/testing.md`
- 安全改动 → `conventions/security.md`
- TypeScript 类型问题 → `conventions/typescript.md`
- 调试 → `conventions/debugging.md`
