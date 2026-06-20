# .claude/ 目录说明

> SDAD（Spec-Driven Agentic Delivery，规格驱动代理交付）系统的**运行时配置**。
> 本目录是「开发态」配置，改动立即在当前仓库生效；确认无误后同步到 `packages/agentpm/content/` 打包发布。

## 目录树总览

```
.claude/
├── skills/                          # 技能库：触发词匹配后执行的工作流
│   │                                #   ── 交付主流水线（核心业务资产）──
│   ├── req-doc/                     #   SRS 需求规格说明书：生成/细化/审查/反向同步/导出
│   ├── hld-design/                  #   概要设计说明书（HLD）：系统总体架构
│   ├── lld-design/                  #   详细设计说明书（LLD）：模块+数据库+API 三合一
│   ├── page-generator/              #   创建页面、实现功能（列表/详情/表单页）
│   ├── backend-generator/           #   生成后端代码（NestJS+Prisma，消费 LLD）
│   ├── annotation/                  #   原型页面注入需求标注，与 UI 库解耦
│   ├── delivery-plan/               #   交付计划：原型→上线，含进度追踪
│   ├── feature-list/                #   提取功能清单，导出 xlsx/Word
│   ├── feasibility-report/          #   可行性研究报告（可研报告）
│   ├── diagram-generator/           #   各类图表 → draw.io XML
│   │                                #   ── 产品经理（PM）工具集 ──
│   ├── pm-test-cases/               #   测试用例生成
│   ├── pm-operation-manual/         #   操作手册/用户手册
│   │                                #   ── 通用方法论技能（非品牌资产）──
│   ├── brainstorming/               #   创意工作前探索意图与设计
│   ├── systematic-debugging/        #   系统化排查 bug
│   ├── test-driven-development/     #   先写测试再实现
│   ├── verification-before-completion/  # 完成前强制验证
│   ├── finishing-branch/            #   分支收尾：merge/PR/保留/丢弃
│   ├── skill-creator/               #   创建/更新技能指南
│   ├── common/                      #   技能公共资源
│   └── config.json                  #   技能配置
│
├── agents/                          # 专用子 Agent：analyzer→writer→reviewer 三段式
│   ├── code-reviewer.md             #   代码质量+安全审查（写完代码强制调用）
│   ├── planner.md                   #   复杂功能分阶段实现计划
│   ├── req-analyzer.md              #   需求：分析上下文出功能摘要
│   ├── req-writer.md                #   需求：撰写 PRD 语言章节
│   ├── req-reviewer.md              #   需求：审查章节
│   ├── template-analyzer.md         #   需求：从 Word 提炼模板
│   ├── design-analyzer.md           #   设计：分析出设计摘要
│   ├── design-writer.md             #   设计：撰写 HLD/LLD 章节
│   ├── design-reviewer.md           #   设计：五维审查
│   ├── design-advisor.md            #   设计：页面设计决策（查 ui-ux-pro-max）
│   ├── feasibility-analyzer.md      #   可研：分析出项目摘要
│   ├── feasibility-writer.md        #   可研：撰写章节
│   ├── feasibility-reviewer.md      #   可研：四维审查
│   ├── page-spec-loader.md          #   页面：检测技术栈、规划组件
│   ├── page-reviewer.md             #   页面：需求完整性+Mock 验收
│   ├── backend-spec-loader.md       #   后端：检测NestJS栈、加载规范、规划模块
│   ├── backend-reviewer.md          #   后端：LLD覆盖+Swagger+脱敏+构建+接口实测
│   ├── annotation-prd-analyzer.md   #   标注：分析需求出功能点清单
│   ├── annotation-code-locator.md   #   标注：定位 DOM、出 class 注入清单
│   ├── delivery-analyzer.md         #   交付：分析依赖出交付计划
│   └── diagram-drawer.md            #   图表：按规范生成 draw.io XML
│
├── rules/                           # 行为铁律：会话启动自动加载
│   ├── agentpm-agent-orchestration.md      # Agent 编排规则
│   ├── agentpm-coding-conventions.md       # 编码规范
│   ├── agentpm-frontend-conventions.md     # 前端规范
│   ├── agentpm-development-workflow.md     # 开发工作流
│   ├── agentpm-req-doc-workflow.md         # 需求说明书工作流
│   ├── agentpm-git-workflow.md             # Git 工作流
│   ├── agentpm-session-context.md          # 会话上下文与强制清单
│   ├── agentpm-compaction-recovery.md      # 上下文压缩恢复
│   ├── agentpm-spawn-subagent.md           # 子 Agent 调用规则
│   ├── agentpm-subagent-stop.md            # 子 Agent 技能触发禁止
│   └── agentpm-tool-call-integrity.md      # 工具调用完整性
│
├── hooks/                           # 质量门禁：生命周期事件触发的 .cjs
│   ├── session-start.cjs            #   SessionStart：清理状态+注入清单
│   ├── config-protection.cjs        #   PreToolUse：阻止改配置文件
│   ├── gateguard.cjs                #   编辑前检查是否已 Read
│   ├── review-reminder.cjs          #   改代码后注入 review 提醒
│   ├── review-tracker.cjs           #   追踪 code-reviewer 调用
│   ├── pre-compact.cjs              #   压缩前保存状态快照
│   ├── stop-quality-gate.cjs        #   结束时查 console.log 残留与 review
│   ├── run.cjs                      #   hook 运行入口
│   └── lib/                         #   公共库
│
├── agentpm-knowledge/               # 分阶段知识库（按需 Read，线上 MCP 副本）
│   ├── agents.md                    #   Agent 编排总览
│   ├── conventions/                 #   testing/security/typescript/debugging
│   ├── phase1-requirements/         #   需求阶段规范
│   ├── phase2-design/               #   设计阶段规范
│   ├── phase3-development/          #   开发阶段规范
│   ├── phase4-testing/              #   测试阶段规范
│   └── diagram/                     #   绘图规范
│
├── commands/                        # 斜杠命令
│   ├── finish.md                    #   /finish 分支收尾
│   ├── review.md                    #   /review 代码审查
│   └── verify.md                    #   /verify 构建+类型检查
│
├── settings.json                    # hook 注册表（事件 → hook 映射）【发布】
├── run                              # 运行时辅助脚本【发布】
├── scripts/                         # 辅助脚本目录【发布】
├── VERSION                          # 当前版本号（自动写入）【发布】
│
├── agent-memory/                    # 子 Agent 跨会话记忆【本地私有，不发布】
├── settings.local.json              # 本地个人设置【本地私有，不发布】
└── settings.local.template.json     # 本地设置模板【本地私有，不发布】
```

## 顶层结构

| 路径 | 作用 | 是否发布 |
|------|------|---------|
| `skills/` | 技能库——触发词匹配后执行的工作流 | ✅ |
| `agents/` | 专用子 Agent——主流程委派的分析/撰写/审查角色 | ✅ |
| `rules/` | 行为铁律——会话启动时自动加载的约束 | ✅ |
| `hooks/` | 质量门禁——在工具调用前后自动执行的 `.cjs` 脚本 | ✅ |
| `agentpm-knowledge/` | 分阶段详细规范——按需 Read 的知识库本地副本 | ✅ |
| `commands/` | 斜杠命令（`/finish` `/review` `/verify`） | ✅ |
| `settings.json` | hook 注册表（哪个事件触发哪个 hook） | ✅ |
| `run` | 运行时辅助脚本 | ✅ |
| `scripts/` | 辅助脚本目录 | ✅ |
| `VERSION` | 当前版本号（由 pack.js/init.js 自动写入） | ✅ |
| `agent-memory/` | 子 Agent 跨会话记忆 | ❌ 本地私有 |
| `settings.local.json` | 本地个人设置 | ❌ 本地私有 |
| `settings.local.template.json` | 本地设置模板 | ❌ 本地私有 |

---

## skills/ — 技能库

触发后执行的工作流。CLAUDE.md 的触发词表是它们的入口。

### 交付主流水线（核心业务资产）

| 技能 | 用途 |
|------|------|
| `req-doc` | 生成/细化/审查/反向同步 SRS 需求规格说明书，支持导出 Word、从 Word 提炼模板 |
| `hld-design` | 从 SRS 推导系统总体架构，生成概要设计说明书（HLD） |
| `lld-design` | 生成详细设计说明书（LLD）：模块设计 + 数据库物理设计 + API 设计三合一 |
| `page-generator` | 在现有项目中创建页面、实现功能（列表/详情/表单页等） |
| `backend-generator` | 消费 LLD/HLD 生成后端代码（NestJS+Prisma：schema/service/controller/dto/vo/module + Swagger） |
| `annotation` | 在原型页面上注入需求标注（字段说明、业务规则、交互逻辑），与 UI 库解耦 |
| `delivery-plan` | 分析需求说明书，生成从原型到上线的完整交付计划，支持进度追踪与下一步推荐 |
| `feature-list` | 从 SRS/可研报告提取功能清单，导出 xlsx 或 Word |
| `feasibility-report` | 生成应用系统类项目的可行性研究报告（可研报告） |
| `diagram-generator` | 生成各类图表（流程图/架构图/时序图/泳道图/ER图/UML/BPMN 等），输出 draw.io XML |

### 产品经理（PM）工具集

| 技能 | 用途 |
|------|------|
| `pm-test-cases` | 从需求生成功能/边界/异常/权限测试用例 |
| `pm-operation-manual` | 生成操作手册/用户手册/快速入门 |

### 通用方法论技能（社区/通用，非品牌资产）

| 技能 | 用途 |
|------|------|
| `brainstorming` | 创意工作前探索用户意图、需求与设计 |
| `systematic-debugging` | 遇到 bug/测试失败/异常行为时的系统化排查 |
| `test-driven-development` | 实现功能或修复前先写测试 |
| `verification-before-completion` | 声称完成前强制运行验证命令、确认证据 |
| `finishing-branch` | 开发分支收尾：验证→选择 merge/PR/保留/丢弃 |
| `skill-creator` | 创建/更新技能的指南 |

---

## agents/ — 专用子 Agent

主流程委派的角色。多数遵循「分析器 analyzer → 撰写者 writer → 审查者 reviewer」三段式，由对应技能编排调用。子 Agent 不继承主流程上下文，不触发技能。

### 通用

| Agent | 用途 |
|-------|------|
| `code-reviewer` | 代码质量 + 安全审查，写完代码后强制调用 |
| `planner` | 复杂功能/架构变更前输出分阶段实现计划 |

### 需求（req-doc 技能调用）

| Agent | 用途 |
|-------|------|
| `req-analyzer` | 分析项目上下文，输出结构化功能摘要 |
| `req-writer` | 撰写符合 PRD 语言规范的需求章节 |
| `req-reviewer` | 从语言/结构/三要素/分级等维度审查需求章节 |
| `template-analyzer` | 以 Word 章节结构为准提炼需求说明书新模板 |

### 设计（hld-design / lld-design 技能调用，DOC_TYPE 区分）

| Agent | 用途 |
|-------|------|
| `design-analyzer` | 分析 SRS/代码/已有设计，输出设计信息摘要 |
| `design-writer` | 撰写概要/详细设计章节（允许技术实现细节） |
| `design-reviewer` | 从结构/分层/规范/可追溯/质量五维审查设计章节 |
| `design-advisor` | 生成页面前查询 ui-ux-pro-max，输出设计决策（page-generator 调用） |

### 可研（feasibility-report 技能调用）

| Agent | 用途 |
|-------|------|
| `feasibility-analyzer` | 分析项目上下文，输出可研项目信息摘要 |
| `feasibility-writer` | 撰写符合可研语言规范的章节 |
| `feasibility-reviewer` | 从结构/数据一致性/语言/可研要求四维审查 |

### 页面 / 后端 / 标注 / 交付 / 图表

| Agent | 用途 |
|-------|------|
| `page-spec-loader` | 检测技术栈、加载相关 UI 库参考、规划所需组件（page-generator 调用） |
| `page-reviewer` | 页面生成验收：需求完整性 + Mock 接口正确性 |
| `backend-spec-loader` | 检测 NestJS+Prisma 栈、加载后端规范、规划模块与接口（backend-generator 调用） |
| `backend-reviewer` | 后端验收：LLD 覆盖 + Swagger 标注 + 敏感字段脱敏 + 构建 + 接口实测 |
| `annotation-prd-analyzer` | 标注前分析需求，输出功能点清单 |
| `annotation-code-locator` | 为功能点定位 DOM 节点，输出 class 注入清单（不依赖 UI 库） |
| `delivery-analyzer` | 分析功能依赖，生成交付计划文件（delivery-plan 调用） |
| `diagram-drawer` | 按绘图规范生成 draw.io XML（diagram-generator 调用） |

---

## hooks/ — 质量门禁

`.cjs` 脚本，由 `settings.json` 注册到各生命周期事件。`run.cjs` 为统一入口，`lib/` 为公共库。

| Hook | 触发时机 | 作用 |
|------|---------|------|
| `session-start.cjs` | SessionStart | 清理上轮状态文件，注入强制执行清单 |
| `config-protection.cjs` | PreToolUse (Edit/Write) | 阻止修改 linter/formatter/tsconfig 等配置文件 |
| `gateguard.cjs` | PreToolUse(Edit) / PostToolUse(Read) | 编辑文件前检查是否已 Read，并记录已读文件 |
| `review-reminder.cjs` | PostToolUse (Edit/Write) | 代码修改后注入 code-reviewer 强制提醒 |
| `review-tracker.cjs` | PostToolUse (Agent) | 追踪 code-reviewer 是否被调用 |
| `pre-compact.cjs` | PreCompact | 上下文压缩前保存工作状态快照 |
| `stop-quality-gate.cjs` | Stop | 回复结束时检查 console.log 残留与 review 调用 |
| `run.cjs` / `lib/` | — | hook 运行时入口与公共库 |

---

## agentpm-knowledge/ — 分阶段知识库

按需 Read 的详细规范（线上 MCP 服务的本地维护副本）。

| 路径 | 内容 |
|------|------|
| `agents.md` | Agent 编排总览 |
| `conventions/` | 编码规范（testing / security / typescript / debugging 等） |
| `phase1-requirements/` | 需求阶段规范（prd-language、section-format 等） |
| `phase2-design/` | 设计阶段规范 |
| `phase3-development/` | 开发阶段规范 |
| `phase4-testing/` | 测试阶段规范 |
| `diagram/` | 绘图规范 |

---

## commands/ — 斜杠命令

| 命令 | 作用 |
|------|------|
| `/finish` | 完成当前分支：验证 + 选择 merge/PR/保留/丢弃 |
| `/review` | 对当前改动调用 code-reviewer（质量 + 安全） |
| `/verify` | 运行构建 + 类型检查，确认代码状态 |

---

## 相关文档

- 仓库总规则与执行铁律：根目录 `CLAUDE.md`
- 开发态↔发布态流程、发布通道：根目录 `DEVELOPMENT.md`
- 行为约束细则：`rules/agentpm-*.md`
