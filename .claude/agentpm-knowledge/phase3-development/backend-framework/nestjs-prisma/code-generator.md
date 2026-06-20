---
updated: 2026-06-20
version: 1.0
scope: phase3-development/backend-framework
description: 框架代码生成器——读数据库表反向生成全套 CRUD 代码
---
# 代码生成器

> 已建好数据库表时，调框架自带生成器一键出全套 CRUD，省去手写。backend-generator 的"生成器为主"策略优先走这条。

## 一、流程

```
建表 → introspect 推断 IR → preview 预览 → generate 落盘
     → 重启 pnpm dev（自动 db push 同步 model）→ 接口可用
```

## 二、接口（需登录 + coding:generator 权限点，仅开发环境）

| 接口 | 说明 |
|------|------|
| `POST /admin/coding/generator/tables` | 列出数据库表 |
| `POST /admin/coding/generator/introspect` | 读表结构 → 推断 IR |
| `POST /admin/coding/generator/preview` | 预览生成代码（不写盘） |
| `POST /admin/coding/generator/generate` | 生成并写入 + 追加 prisma model |

## 三、入参

```json
{
  "tableName": "biz_product",   // 数据库表名
  "module": "product",           // 可选，默认由表名推导
  "tier": "admin",               // 可选 admin/app，默认 admin
  "force": false                 // 可选，模块已存在时是否覆盖
}
```

生成产物：`services/`、`controllers/{tier}/`、`dto/`、`{module}.module.ts` + 追加 Prisma model。

## 四、字段推断规则

- `status` / `type` / `*Id` → 精确筛选（fieldEq）
- `name` / `title` / `*No` / `code` → 模糊搜索（keyWordLikeFields）
- 公共字段（id / createTime / updateTime / tenantId）自动排除

## 五、注意

- 生成器**只在开发环境可用**（生产 `NODE_ENV=production` 禁用）。
- 生成 model 后**不会自动 db push**（DDL 高风险），需重启 `pnpm dev` 才同步建表。
- 生成的是骨架：标准 CRUD 开箱可用；自定义接口、业务逻辑、特殊 VO 脱敏需在生成后手动补（backend-generator 步骤5 负责）。

## 六、backend-generator 何时用生成器 vs 手写

| 场景 | 策略 |
|------|------|
| 表已建好、标准 CRUD | 调生成器出骨架 |
| 表未建（先按 LLD 写 schema） | 先写 schema.prisma → 重启同步 → 再调生成器 |
| 大量自定义接口 / 复杂业务流程 | 生成骨架后手写补充，或直接手写 |
| 仅补一两个自定义接口到已有模块 | 直接手写，不重新生成 |
