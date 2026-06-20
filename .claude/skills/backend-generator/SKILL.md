---
name: backend-generator
description: >
  You MUST use this skill when users ask to implement backend APIs, generate server-side code, or build backend modules in existing backend projects (framework-agnostic: NestJS, Spring Boot, Django, Go, etc. — detected at runtime).
  Triggers: (1) "实现后端" "生成接口" "后端开发" "做后端" "生成后端代码",
  (2) "按详细设计实现接口" "按LLD生成代码" "根据详细设计写后端" "实现xx接口" "生成xx模块接口",
  (3) "建表" "生成service" "生成controller" "写后端CRUD" "实现后端功能",
  (4) "按计划实现后端" "实现Phase2" "连续实现后端" "自动实现后端",
  (5) Users need to generate backend code (data models, services, controllers, DTOs, API endpoints) from LLD design, in whatever backend framework the project uses.
---

# 后端代码生成器工作流

每次生成后端功能，严格按以下 7 个步骤执行，每步都要有结果输出。

> **框架无关**：适配 NestJS / Spring Boot / Django / Go 等任意后端框架（与 page-generator 对 UI 库无关同理）。
> 具体框架由 Step 2 的 `backend-spec-loader` 检测——命中预置规范（如 `nestjs-prisma`）则加载，否则**从项目现有代码推断写法**。
> 本文工作流通用；文中出现的 NestJS+Prisma 写法仅为示例，**实际以 spec-loader 返回的框架规范/项目写法为准**。
> **规范来源**：通用层 `backend.md` / `database.md`（框架无关设计原则）+ `backend-framework/{框架}/`（框架特有实操）。
> **设计来源**：消费 LLD（详细设计·数据库物理设计/API详细设计/模块详细设计）+ HLD（模块划分）。

> **后端项目定位**：工作目录下后端项目通常在 `server/` 子目录（含 `package.json` + `prisma/schema.prisma`）。
> Step 1 先确定 **SERVER_PATH**，后续所有路径以它为基准。

---

## 步骤 1：需求理解

**目标**：明确要实现哪些表、接口、业务逻辑，全部来自设计文档，不靠猜。

执行动作：

**0. 判断触发模式**：
- "按计划实现后端"/"实现Phase2"/"连续实现后端"（批量）：读 `docs/delivery-plan.md` Phase 2，找当前推荐的后端任务，作为目标，记"批量模式"
- 用户指定功能名（"实现xx接口"/"生成xx模块"）：直接用，记"单次模式"

**批量模式铁律：不在功能之间停下询问，完成一个立即开始下一个。**

**1. 定位后端项目**：检查工作目录下是否有 `server/` 子目录（含 `package.json` + `prisma/`）。确定后作为 **SERVER_PATH**；无则用当前目录。

**2. 读取设计文档**（优先级从高到低）：
- `Glob("docs/**/*详细设计*.md")` — **LLD 是后端实现的最重要依据**
- `Glob("docs/**/*概要设计*.md")` — HLD 提供模块划分
- `Glob("docs/**/*需求*说明书*.md")` — SRS 补业务规则

从 LLD 按以下顺序提取目标功能的实现要素：
- **四、数据库物理设计**：目标模块涉及的表（model 名、字段、类型、索引、关系、`///` 注释内容）
- **五、API 详细设计**：接口清单——区分「标准 CRUD」（list/detail/add/update/delete/batch-delete）和「自定义接口」（路径、方法、入参、响应、错误码）
- **三、模块详细设计**：业务流程、状态机、跨表逻辑
- **HLD 模块划分**：确认模块归属和 admin/app 分层
- **SRS 业务规则**：唯一性、删除保护、状态联动等

**3. 无设计文档时**：根据用户描述整理，单次模式可询问不明确处；批量模式按现有信息继续。

**输出格式**：
```
后端需求理解
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
功能：[功能/模块名称]
所属模块：[module 名]  鉴权分层：[admin / app]
SERVER_PATH：[后端项目路径]

表清单（来自 LLD 四）：
  [ ] [Model名]（@@map: xxx）：字段 a/b/c... | 索引 | 关系
  ...

接口清单（来自 LLD 五）：
  标准 CRUD：[list/detail/add/update/delete/batch-delete 中需要的]
  自定义接口：
    [ ] [METHOD] [path] — [用途]，入参[DTO]，响应[VO]
  ...

业务规则（来自 LLD 三 + SRS）：
  - [规则1：如名称唯一性校验]
  - [规则2：如删除前检查关联]

鉴权点：
  - [免登录接口列表 → @Public()]
  - [权限点：由 URL 推导]

脱敏字段：
  - [实体.字段：不进 VO + service select 排除]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[单次模式] 有真正不确定处才在此等待确认。批量模式直接继续步骤 2。
```

---

## 步骤 2：规范加载与模块规划

**目标**：调 `backend-spec-loader` agent 检测技术栈、加载规范、规划模块与接口。

执行动作：使用 `Agent` 工具，`subagent_type: "backend-spec-loader"`，传入：

```
SERVER_PATH：{后端项目根目录绝对路径}

功能需求：
{步骤 1 输出的完整需求理解内容}
```

> agent 定义在 `.claude/agents/backend-spec-loader.md`，返回技术栈、规范要点、项目实际写法参考、模块规划（含生成器策略、脱敏点）。

**输出格式**：
```
规范加载与模块规划
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[backend-spec-loader agent 返回内容，原样展示]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 步骤 3：执行计划

**目标**：列出所有需创建/修改的文件，确认无遗漏。

执行动作：
1. 根据需求和规范摘要，确定 schema.prisma 改动 + 模块文件清单
2. 判断生成器策略（表已建→调生成器；表未建→先写 schema 再生成 / 手写）
3. 判断哪些是标准 CRUD（基类自动）、哪些要手写自定义接口

**输出格式**：
```
执行计划
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
功能：[功能名]  生成器策略：[调生成器 / 先写schema再生成 / 手写]

任务清单：
  [ ] 1. prisma/schema.prisma                    新增/修改 model
  [ ] 2. src/modules/xxx/services/xxx.service.ts  Service
  [ ] 3. src/modules/xxx/controllers/admin/xxx.controller.ts  Controller
  [ ] 4. src/modules/xxx/dto/xxx.dto.ts           请求 DTO
  [ ] 5. src/modules/xxx/vo/xxx.vo.ts             响应 VO（含脱敏）
  [ ] 6. src/modules/xxx/xxx.module.ts            模块定义
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 步骤 4：数据模型

**目标**：按 LLD 数据库设计写/改数据模型，**定义方式按检测到的框架**（以 Step 2 spec-loader 返回的写法为准）：
- Prisma → `prisma/schema.prisma` 的 model
- JPA/Hibernate → `@Entity` 实体类
- Django → `models.py`
- 其他 → 按项目现有实体写法

执行动作（以 NestJS+Prisma 为例，其他框架对应迁移）：
1. 写/改数据模型：
   - 模型名 PascalCase，物理表名按框架映射（Prisma `@@map`、JPA `@Table`）
   - 字段 camelCase；必备字段 `id` / 创建时间 / 更新时间（+ 多租户 `tenantId` 按项目约定）
   - **每个模型和字段写中文注释**（直接抄 LLD 字段说明，枚举写明取值；Prisma 用 `///`）
   - 外键字段（`*Id`）建索引；唯一用唯一约束
2. **不擅自执行结构同步/迁移**（DDL 高风险）。写完提示用户按框架方式同步：
   > 数据模型已更新，需按框架同步表结构（Prisma：重启 `pnpm dev`；JPA：迁移/ddl；Django：makemigrations+migrate）。

**输出**：列出新增/修改的模型及关键字段。

---

## 步骤 5：生成骨架 + 补业务

**目标**：按"生成器为主、手写兼容"策略产出代码。

### 5.1 选择生成方式（按步骤 2 的生成器策略）

- **路径 A（生成器为主）**：表已在数据库中存在 → 提示用户在后端调用框架代码生成器：
  > 可调用 `POST /admin/coding/generator/generate`（入参 `{tableName, module, tier}`）生成 CRUD 骨架，或我手写。
  生成器产出 service/controller/dto/module 骨架后，跳到 5.3 补业务。
- **路径 B（手写）**：表未建 / 大量自定义接口 / 仅补接口到已有模块 → 直接手写。

### 5.2 手写骨架（路径 B 或生成器不可用）

按 Step 2 spec-loader 返回的**框架写法/项目实际写法**逐文件生成，先展示任务清单，每个文件完成标 ✅。
以下为 **NestJS+Prisma 示例**（其他框架按检测到的写法对应迁移：Spring 的 Service/Controller/Mapper+Entity、Django 的 views/models/serializers 等）：
- **Service**：继承 `BaseService`，`super(prisma, 'modelName')`；业务逻辑写自定义方法
- **Controller**：继承 `CrudControllerBase` + `@CrudController({prefix, api, pageQueryOp})`；要 data 精确到 VO 用 `CrudControllerFactory(Vo)`
- **Module**：声明 controllers + providers（需被引用的 service 才 export）

### 5.3 统一补充（两条路径都要）

- **自定义接口**：按 LLD 五逐个实现（路径动作结尾、HTTP 方法语义对、`this.ok/fail` 响应）
- **业务逻辑**：状态机、唯一性、删除保护等写在 service；业务失败 `return this.fail('中文提示')` 不抛异常
- **DTO**：每字段 `@ApiProperty` 中文描述 + class-validator 校验；query 参数声明 `string`
- **VO + 脱敏**：建 `vo/xxx.vo.ts`，敏感字段不进 VO，且 **service 用 `select` 白名单或解构排除**（运行时真的不返回）
- **Swagger**：自定义方法加 `@ApiOperation` + 响应装饰器；`@Param` 配 `@ApiParam`、散 `@Query` 配 `@ApiQuery`
- **鉴权**：免登录接口加 `@Public()`；其余默认需鉴权

**铁律**：禁 `console.log`（用 `Logger`）、禁裸 SQL、单文件 ≤500 行、单函数 ≤80 行、无 TODO 残留。

---

## 步骤 6：验收检查

**目标**：并行调用 `backend-reviewer` + `code-reviewer` 双重审查。

**Agent 1 — backend-reviewer**（LLD覆盖 + Swagger + 脱敏 + 构建 + 接口实测）：
使用 `Agent` 工具，`subagent_type: "backend-reviewer"`，传入：
```
SERVER_PATH：{后端项目根目录绝对路径}

功能需求：
{步骤 1 输出的完整需求理解内容}

规范摘要：
{步骤 2 backend-spec-loader 返回的内容}

生成的文件列表：
{步骤 3/5 任务清单中所有已完成的文件路径}
```

**Agent 2 — code-reviewer**（代码质量 + 安全）：
使用 `Agent` 工具，`subagent_type: "code-reviewer"`，传入：
```
【强制前置步骤】在开始工作前，你必须先调用 mcp__agentpm__get_knowledge(category: "conventions/coding") 获取编码规范。不可跳过。你是被派发的子 Agent，只执行审查任务，不触发任何技能流程。

审查以下新生成的后端代码，从代码质量和安全两个角度审查，重点：敏感字段脱敏、SQL 注入、鉴权遗漏、输入校验。

生成的文件列表：
{步骤 3/5 任务清单中所有已完成的文件路径}

只审查上述文件，不审查项目其他文件。
```

**收到报告后**：
- backend-reviewer 有 ❌（构建/LLD覆盖/脱敏/Swagger/接口）→ 立即修复，修复后重新调用 backend-reviewer 复查（最多 2 次）
- code-reviewer 有 CRITICAL/HIGH → 必须修复
- code-reviewer 有 MEDIUM/LOW → 视情况修复
- 直到所有必须修复项处理完

---

## 步骤 7：更新交付计划

**目标**：验收通过后更新 `docs/delivery-plan.md` Phase 2，推荐下一步。

执行动作：
1. 检查 `docs/delivery-plan.md` 是否存在
   - **不存在**：跳过，提示可用 `/delivery-plan` 生成
2. 找到当前后端功能对应的 Phase 2 条目（按功能名匹配），状态改 `✅`，填完成时间（当天 YYYY-MM-DD）
3. 更新 Phase 2 进度计数、文件顶部"最后更新"日期
4. 计算下一个推荐的后端任务：Phase 2 中依赖已满足（依赖的后端表/模块均 ✅）的最小 ID
5. 更新"当前推荐"章节

6. **判断是否继续**：
   - **批量模式**（"按计划实现后端"等）：有下一个可执行后端任务 → 立即在当前会话从步骤 1 重新执行，**不停下询问**。无 → 输出暂停提示。
   - **单次模式**：输出完成提示，等待用户指令。

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[完成] {功能名} 后端已完成
Phase 2 进度：{已完成}/{总数}
Swagger 文档：http://localhost:9001/docs
推荐下一步：{下一个后端任务 或 "Phase 2 已全部完成"}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 参考资源索引

**框架无关通用层**（所有框架共享）：

| category | 用途 | 加载时机 |
|---------|------|---------|
| `phase3-development/backend` | 接口设计原则（路由/响应/鉴权） | Step 2 始终 |
| `phase3-development/database` | 数据库设计原则 | Step 2/4 |

**框架特有层**（按检测到的框架，命中则读，未命中从项目代码推断）：

| 框架 | 目录 |
|------|------|
| NestJS + Prisma | `phase3-development/backend-framework/nestjs-prisma/`（project-structure / module-development / api-doc / data-model / schema-comment / code-generator / workflow-deploy） |
| 其他框架 | `phase3-development/backend-framework/{框架}/`（无则推断） |

> 加载由 `backend-spec-loader` agent 在 Step 2 完成：检测框架 → 命中预置规范则按需读，未命中从项目现有模块代码推断。不一次性全读。
> 新增框架支持只需在 `backend-framework/` 下加对应子目录，spec-loader 自动发现。

