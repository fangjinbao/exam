---
updated: 2026-06-20
version: 1.0
scope: phase3-development/backend-framework
description: Schema 字段注释与数据库注释流水线——/// 注释 → 库 comment → 文档/代码生成
---
# Schema 注释流水线

> 注释写在数据模型定义处，作为唯一数据源，一处定义、多处复用（数据库 comment + Swagger 文档 + 代码生成器）。model 规范见 database.md。

## 核心规则

- **`///`（三斜杠）** 是 Prisma 文档注释，能被工具读取；`//`（双斜杠）会被忽略，**不要用 `//` 写字段说明**。
- model 上方 `/// xxx` = 表注释；字段上方 `/// xxx` = 列注释；`id` 可不注释。
- 枚举字段写明取值：`/// 状态 1=启用 0=禁用`。

```prisma
/// 字典类型
model DictType {
  id   Int    @id @default(autoincrement())
  /// 类型名称
  name String
  /// 类型键（唯一）
  key  String @unique
  @@map("dict_type")
}
```

## 关键限制：Prisma 不写库 comment

Prisma 对 MySQL **不会**把 `///` 注释写进数据库的表/列 comment（与 TypeORM 不同）。所以需把注释刷进数据库——已做成**自动**：

```bash
pnpm dev              # 主入口：db push 后自动刷注释。改完 schema 重启它即可
# 边缘/调试场景：
pnpm prisma:push      # 不启服务，只把结构+注释刷进库（db push 后自动刷注释）
pnpm sync:comments    # 只刷注释，不动结构（幂等可重跑）
DRY_RUN=1 pnpm sync:comments              # 预览不执行
npx ts-node scripts/sync-db-comments.ts SysUser   # 单表调试
```

> 日常只记 `pnpm dev`：改完 schema 重启就自动 db push + 刷注释 + 重新生成 client。watch 模式不会自动同步 schema，别在服务运行时手动 `prisma:push`，重启一条命令搞定。生产走迁移 `migrate deploy`，与此无关。

## 同步脚本产出

脚本（`scripts/sync-db-comments.ts`）解析 schema 的 `///` 注释，生成 `ALTER TABLE ... COMMENT` 刷库（仅追加注释、不改字段定义）。刷库后：

1. Navicat 等工具能看到中文注释；
2. 代码生成器读数据库 column comment，自动生成带中文 `@ApiProperty` 的 DTO/VO，新表零负担出文档。

## backend-generator 注意

写 schema.prisma 时**每个 model/字段都要带 `///` 注释**（直接抄 LLD 数据库设计的中文字段说明），这样后续代码生成器能据此产出带中文描述的 DTO/VO，省去手补 `@ApiProperty` 描述。
