---
updated: 2026-06-20
version: 1.0
scope: phase3-development/backend-framework
description: 后端开发流程铁律、验证铁律、生产部署
---
# 开发流程与部署

## 一、开发流程铁律

做任何后端功能，按以下流程，每步强制：

1. **读规范** — 做功能前读对应篇（module-development.md / backend.md / api-doc.md 等）
2. **技能检查** — 扫描技能触发词，匹配则调用
3. **实现** — 遵循模块开发规范；优先用代码生成器出骨架
4. **code-reviewer** — 写完代码立即调用审查（强制，无例外）
5. **验证** — 跑 `pnpm build`（exit 0）+ 实测接口，看到输出才能声明完成
6. **报告** — 4、5 全过才能向用户报告

## 二、验证铁律

```
没有 pnpm build exit 0 的证据 = 不能声称"构建通过"
没有实测接口返回的证据 = 不能声称"功能可用"
没有 code-reviewer 审查 = 不能提交代码
```

## 三、硬性规则

- 单文件 ≤ 500 行，单函数 ≤ 80 行
- 禁止 `console.log`（用 NestJS `Logger`）
- 禁止裸写 SQL 拼接（用 Prisma 参数化）
- 外部输入必须经 DTO + class-validator 校验
- 接口必须标 Swagger（@ApiOperation、DTO、@ApiParam、@ApiQuery、响应装饰器）
- 跨层 import 用 `@/`，模块内用 `../`
- 新增接口默认需鉴权，免登录显式 `@Public()`

## 四、生产部署

### 部署架构

生产用 Docker Compose 编排：`mysql` + `redis` + `backend` + `nginx`。后端镜像多阶段构建，启动时**自动迁移数据库 + 幂等初始化种子数据**。

### 首次部署

```bash
cd server
cp docker/.env.example docker/.env   # 复制环境变量模板
vim docker/.env                       # 改所有 change_me_* 占位密码 + JWT_SECRET
./deploy.sh                           # 一键部署
```

### 启动时自动初始化（仅 NODE_ENV=production）

backend 容器通过 `onApplicationBootstrap`（`BootstrapService`）执行：
1. `prisma migrate deploy` — 应用迁移建表（幂等）
2. 幂等 seed — 检测无用户才初始化 admin/角色/菜单

> 数据库 schema 走**迁移**：改 schema 后开发跑 `pnpm prisma migrate dev --name xxx` 生成迁移文件并提交，生产 deploy 时自动 `migrate deploy`。

### deploy.sh 命令

```bash
./deploy.sh            # 完整部署
./deploy.sh start|stop|restart|logs|verify
```

### 健康检查

`GET /admin/open/health`（免登录）→ `{code:200, data:{status:'ok'}}`，供容器探活。

### 部署注意

- `.env` 含密码，不提交仓库；`.env.example` 是模板
- `JWT_SECRET` 上线前必须改强随机值，否则启动报错
- prisma CLI 在 dependencies（生产 migrate 需要），不要移回 devDependencies
- 改 schema 必须生成迁移文件并提交，否则生产 `migrate deploy` 拿不到变更
