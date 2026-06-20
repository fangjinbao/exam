---
updated: 2026-06-20
version: 3.0
scope: phase3-development
description: 数据库设计规范（框架无关）——命名、必备字段、索引、类型、查询优化原则。具体 ORM 语法见 backend-framework/{框架}/
---
# 数据库设计规范（框架无关）

> 本规范是 lld-design（详细设计·数据库物理设计）与各框架 backend-generator 的共享设计原则，**不绑定具体 ORM**。
> 具体语法落地见对应框架：
> - NestJS+Prisma → `backend-framework/nestjs-prisma/data-model.md`
> - 其他框架 → `backend-framework/{框架}/`（无预置时由 backend-spec-loader 从项目代码推断）

## 一、命名规范

| 对象 | 原则 | 说明 |
|------|------|------|
| 实体/模型名 | PascalCase | 由 ORM 映射到物理表 |
| 物理表名 | snake_case | 通过映射配置与模型解耦（如 Prisma `@@map`、JPA `@Table`） |
| 字段（应用层） | camelCase | 应用代码统一 camelCase；物理列名由 ORM 映射 |
| 主键 | `id`，自增整数 | 统一主键策略 |
| 索引 | `idx_表_字段` 或 ORM 默认 | 见下 |
| 外键 | 关联字段以 `Id` 结尾（如 `userId`） | 必建索引 |

> 物理列名风格（snake_case vs camelCase）以项目实际框架约定为准；设计文档按应用层 camelCase 表达。

## 二、必备字段（所有业务表）

| 字段 | 含义 |
|------|------|
| `id` | 自增主键 |
| `createTime` | 创建时间 |
| `updateTime` | 更新时间 |

> 需要多租户隔离时加 `tenantId`；需要审计时按需加 `createBy` / `updateBy`。具体字段名以框架/项目约定为准（如有的项目用 `created_at`）。

## 三、字段注释（强制）

- 每个表和字段必须有中文注释（说明用途）。
- 枚举字段写明取值，如「状态 1=启用 0=禁用」。
- 注释作为唯一数据源，驱动数据库 comment、接口文档、代码生成。具体注释机制见各框架篇。

## 四、索引策略

- 外键字段（`*Id`）必须建索引
- 频繁作为查询条件的字段建索引
- 复合索引：区分度高的字段在前
- 单表索引不超过 5 个
- 低区分度字段（status、gender）不单独建索引，只作复合索引非首列
- 唯一性用唯一约束/唯一索引

## 五、查询优化原则

| 原则 | 说明 |
|------|------|
| 禁止 N+1 | 用关系预加载 / 批量 in 查询，不在循环里单查 |
| 只查需要的字段 | 用 select 白名单，避免返回全字段（尤其敏感字段） |
| 事务保证一致性 | 多表写操作放同一事务 |
| 避免全表扫描 | 查询带条件；范围查询代替函数包裹索引字段 |
| 大数据量分批 | 不一次性加载全量，分页/游标处理 |
| 软删除按需 | 用状态字段标记而非物理删除（按项目约定） |

## 六、类型映射参考（MySQL → 应用类型）

| MySQL | 应用类型(TS) |
|-------|------|
| varchar / text | string |
| int | number |
| bigint | number |
| decimal | number |
| tinyint(1) | boolean |
| datetime | Date |
| json | object |

> 具体 ORM 类型（Prisma `Int`/`String`、JPA `Integer`/`String` 等）见框架篇。

## 数据库检查清单

- [ ] 所有表有 `id` / 创建时间 / 更新时间
- [ ] 每个表和字段有中文注释，枚举写明取值
- [ ] 外键字段有索引
- [ ] 查询用 select 白名单，无返回全字段/敏感字段
- [ ] 无 N+1 查询
- [ ] 多表写操作用事务
- [ ] schema 变更已同步（重启/迁移，按框架约定）
