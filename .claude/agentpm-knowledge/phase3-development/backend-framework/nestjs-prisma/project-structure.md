---
updated: 2026-06-20
version: 1.0
scope: phase3-development/backend-framework
description: NestJS+Prisma 后端项目结构、目录组织、放置规则、技术栈与命令
---
# 后端项目结构（NestJS + Prisma）

> backend-generator 写代码前先确认代码落在哪个目录。框架定位、模块写法见 module-development.md。

## 技术栈与命令

| 项 | 值 |
|----|----|
| 框架 | NestJS 11 |
| ORM | Prisma 6（MySQL） |
| 缓存 | Redis（ioredis） |
| 鉴权 | JWT + Redis token 校验 + 权限点 |
| 包管理器 | **pnpm** |
| 开发端口 | 9001 |

```bash
pnpm dev       # ⭐ 一键启动：起容器 → db push → 刷注释 → seed → watch + studio。改完 schema 重启它
pnpm build     # 构建（= 类型检查），完成声明前必跑，exit 0 才算通过
pnpm start:dev # 纯启动 watch（环境没动过、只想快速重启服务时用）
```

- `http://localhost:9001/docs` — Swagger 接口文档（仅非生产）
- `http://localhost:5555` — Prisma Studio 数据可视化

## 目录结构

```
src/
├── main.ts                    # 入口（无全局前缀，前缀由 controller 声明）
├── app.module.ts              # 根模块（discoverModules 自动收集业务模块）
├── config/                    # 配置
├── common/                    # 框架公共能力（不放业务代码）
│   ├── crud/                  # CRUD 基类与装饰器
│   │   ├── crud.decorator.ts        # @CrudController
│   │   ├── crud-controller.base.ts  # CrudControllerBase（自动 CRUD 路由）
│   │   ├── crud-controller.factory.ts # CrudControllerFactory（data 精确到 VO）
│   │   ├── base.service.ts          # BaseService（page/list/info/add/update/delete）
│   │   └── base.controller.ts       # BaseController（统一响应 ok/fail）
│   ├── guards/                # auth.guard.ts（JWT）、perms.guard.ts（权限点）
│   ├── decorators/            # @Public() @Admin()、api-result.decorator.ts（响应文档）
│   ├── filters/               # 全局异常过滤器
│   ├── interceptors/          # 响应包装拦截器
│   ├── prisma.service.ts      # Prisma 客户端
│   ├── redis.service.ts       # Redis 客户端
│   └── module-loader.ts       # 模块自动发现
└── modules/                   # 业务模块（每个模块一个目录）
    └── {module}/
        ├── controllers/       # 控制器（按 admin/app 分子目录）
        ├── services/          # 服务（业务逻辑，不分端）
        ├── dto/               # 请求 DTO
        ├── vo/                # 响应 VO
        └── {module}.module.ts
```

## 放置规则

- **框架公共能力进 `common/`**：CRUD 基类、守卫、拦截器、过滤器、Prisma/Redis 客户端。不放业务代码。
- **业务代码进 `modules/{module}/`**：每模块一目录，内部按 controllers / services / dto / vo 分层。
- **controller 按鉴权体系分子目录**：`controllers/admin/`、`controllers/app/`；service 不分端，admin/app 共用。
- **跨层 import 用 `@/` 别名，模块内部用相对路径 `../`**。

## 关键文件速查

| 要做什么 | 看哪个文件 |
|---------|-----------|
| CRUD 基类方法 | `src/common/crud/base.service.ts` |
| @CrudController 配置项 | `src/common/crud/crud.decorator.ts` |
| CRUD data 精确到 VO 的工厂 | `src/common/crud/crud-controller.factory.ts` |
| 响应文档装饰器 | `src/common/decorators/api-result.decorator.ts` |
| 鉴权 / 权限点 | `src/common/guards/auth.guard.ts`、`perms.guard.ts` |
| 标准模块样例（黄金样本） | `src/modules/dict/` |
| 代码生成器 | `src/modules/coding/` |
| 数据模型 | `prisma/schema.prisma` |
