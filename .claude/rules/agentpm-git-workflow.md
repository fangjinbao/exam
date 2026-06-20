---
# Git 工作流规则
---

# Git 工作流

## Commit 规范

使用 Conventional Commits 格式：

```
<type>(<scope>): <description>

[optional body]
```

| type | 用途 |
|------|------|
| feat | 新功能 |
| fix | Bug 修复 |
| refactor | 重构（不改变行为） |
| style | 样式/格式调整 |
| docs | 文档 |
| test | 测试 |
| chore | 构建/工具/依赖 |

## 禁止操作

- **禁止 `--no-verify`** — hook 存在是有原因的，修复问题而不是跳过检查
- **禁止 force push 到 main/master** — 除非用户明确要求
- **禁止 `git add .` 或 `git add -A`** — 逐文件 stage，避免意外提交敏感文件
- **禁止 amend 已 push 的 commit** — 创建新 commit

## Push 前检查

推送代码前必须确认：
1. 构建通过（`npx vite build`）
2. 类型检查通过（`npx vue-tsc --noEmit`）
3. 不包含 `.env`、密钥、Token 等敏感文件
4. commit message 符合 Conventional Commits

## 分支命名

```
feat/<feature-name>
fix/<bug-description>
refactor/<scope>
```
