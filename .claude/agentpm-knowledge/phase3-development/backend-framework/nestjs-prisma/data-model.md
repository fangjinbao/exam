---
updated: 2026-06-20
version: 1.0
scope: phase3-development/backend-framework/nestjs-prisma
description: Prisma 数据模型具体语法——model 定义、字段、映射、类型、索引、查询写法（NestJS+Prisma 专属实现）
---
# Prisma 数据模型（NestJS+Prisma 实现）

> 框架无关的数据库设计原则见 `phase3-development/database.md`。本篇是 Prisma 的**具体语法落地**。

## 一、model 定义

```prisma
/// 字典类型
model DictType {
  id         Int       @id @default(autoincrement())
  /// 类型名称
  name       String
  /// 类型键（唯一）
  key        String    @unique
  /// 租户 ID
  tenantId   Int?
  /// 创建时间
  createTime DateTime  @default(now())
  /// 更新时间
  updateTime DateTime  @updatedAt

  @@index([tenantId])
  @@map("dict_type")
}
```

### 语法约定

| 通用原则 | Prisma 落地 |
|---------|-------------|
| model 名 PascalCase | `model DictType` |
| 表名与 model 解耦 | `@@map("dict_type")` |
| 字段 camelCase | `createTime`（非 `created_at`） |
| 自增主键 | `id Int @id @default(autoincrement())` |
| 创建/更新时间 | `createTime DateTime @default(now())` / `updateTime DateTime @updatedAt` |
| 多租户 | `tenantId Int?` + `@@index([tenantId])` |
| 唯一约束 | 字段级 `@unique` / 复合 `@@unique([...])` |
| 索引 | `@@index([userId])` / 复合 `@@index([userId, status])` |

## 二、字段注释（`///`，强制）

- `///`（三斜杠）是 Prisma 文档注释，能被工具读取；`//` 会被忽略，不要用 `//` 写字段说明。
- model 上方 `///` = 表注释；字段上方 `///` = 列注释；`id` 可省。
- 枚举写明取值：`/// 状态 1=启用 0=禁用`。
- 注释如何刷进数据库 comment 见 `schema-comment.md`。

## 三、类型映射（MySQL → Prisma → TS）

| MySQL | Prisma | TS |
|-------|--------|-----|
| varchar / text | String | string |
| int | Int | number |
| bigint | BigInt | number |
| decimal | Decimal | number |
| tinyint(1) | Boolean | boolean |
| datetime | DateTime | Date |
| json | Json | any |

## 四、查询写法

### 分页

```typescript
const [list, total] = await this.prisma.$transaction([
  this.prisma.user.findMany({
    where: { status: 1, deptId },
    select: { id: true, name: true, phone: true, status: true },
    orderBy: { createTime: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  }),
  this.prisma.user.count({ where: { status: 1, deptId } }),
]);
```

### 避免 N+1 / 只查需要字段 / 事务

```typescript
// 关系预加载避免 N+1
const users = await prisma.user.findMany({ include: { dept: true } });

// select 白名单（排除 password 等敏感字段）
const user = await prisma.user.findUnique({
  where: { id }, select: { id: true, name: true, phone: true },
});

// 多表写操作用事务
await this.prisma.$transaction(async (tx) => {
  const order = await tx.order.create({ data: orderData });
  await tx.orderItem.createMany({ data: items.map(i => ({ ...i, orderId: order.id })) });
});
```

## 五、Schema 变更同步

- 改完 `schema.prisma` 重启 `pnpm dev`：自动 `db push` 同步结构 + 刷注释 + 重新生成 client。
- 不在服务运行时手动 `db push`（watch 不自动同步）。
- 生产走迁移：`pnpm prisma migrate dev --name xxx` 生成迁移并提交，生产 `migrate deploy`。
