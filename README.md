# AgentPM · 智能 AI 考试平台

基于 [AgentPM](https://www.axuremart.com/) 通用后端 AI 开发框架构建。

- **server** — NestJS + Prisma + MySQL + Redis 后端
- **admin** — Vue3 + Element Plus PC 管理后台
- **mobile** — Vue3 + Vant 移动端 H5

## 本地开发

```bash
# 后端：起 MySQL + Redis 容器 → 建表 → 种子数据 → 启动服务
cd server && npm run dev

# 前端（另开终端）
cd admin && pnpm dev
cd mobile && pnpm dev
```

## 生产部署

单机 **Docker Compose** 编排四个服务：`mysql` / `redis` / `backend`（NestJS）/ `gateway`（单个 nginx 托管**所有前端**，按子域名分流）。

镜像支持两种构建方式，可任选：

- **本地构建**：`docker compose up -d --build`，在服务器上直接用源码构建（不依赖 GHCR）。
- **CI 构建**：push `main` 后 GitHub Actions 自动构建 `agentpm-server` / `agentpm-gateway` 推到 GHCR，服务器 `docker compose pull` 拉取。

### 首次部署

```bash
cp .env.example .env          # 改掉 change_me 密码，填好各 *_DOMAIN 域名
docker compose up -d --build  # 本地构建 + 启动（首次自动建库、执行 prisma migrate deploy）
# 或用 CI 镜像：docker compose pull && docker compose up -d
```

### 更新（发布新版本）

```bash
git pull
docker compose up -d --build   # 本地构建方式
# 或：docker compose pull && docker compose up -d   # CI 镜像方式
```

### 日常运维

```bash
docker compose ps               # 查看各服务状态
docker compose logs -f backend  # 跟踪后端日志
docker compose logs -f gateway  # 跟踪网关日志
docker compose down             # 停止全部服务（数据卷保留）
```

> 数据库迁移由后端镜像的 entrypoint 在启动时执行（`prisma migrate deploy`，幂等），无需手动操作。
>
> 宝塔各子域名（admin.xxx / m.xxx）反向代理均指向同一网关端口（默认 `127.0.0.1:8080`），配 `*.xxx.com` 泛域名证书即可。完整步骤见 [`docs/03-部署/宝塔面板+Docker部署方案.md`](docs/03-部署/宝塔面板+Docker部署方案.md)。

### 新增一个前端子项目

部署配置由 `docker/frontends.json` 单一清单驱动，新增前端**无需改** Dockerfile / compose / CI / nginx：

1. 新建前端目录（如 `shop/`，标准 vite 项目）
2. `docker/frontends.json` 加一行 `{ "name": "shop", "apiPrefix": "/shop" }`
3. `.env` 加 `SHOP_DOMAIN=shop.xxx.com`，并在 `docker-compose.yaml` 的 `gateway.environment` 加 `SHOP_DOMAIN: "${SHOP_DOMAIN}"`
4. 宝塔加 `shop.xxx.com` 反代到同一网关端口（泛证书自动覆盖）
5. `docker compose up -d --build`

## 目录结构

```
.
├── docker-compose.yaml   # 生产编排：mysql / redis / backend / gateway
├── .env.example          # 部署环境变量模板
├── docker/               # 部署配置集中地
│   ├── frontends.json        # ★ 前端清单（单一事实来源）
│   ├── gateway.Dockerfile    # 网关：构建所有前端 + nginx 托管
│   ├── server.Dockerfile     # 后端镜像
│   ├── build-frontends.mjs   # 构建期：循环 vite build 各前端
│   ├── gateway-entrypoint.sh # 启动期：按清单+域名渲染 nginx server 块
│   ├── nginx.conf            # http 级公共配置
│   ├── nginx-server.conf.tpl # 单前端 server 块模板
│   └── entrypoint.sh         # 后端启动迁移脚本
├── server/               # NestJS 后端（含 Prisma schema）
├── admin/                # PC 管理后台
├── mobile/               # 移动端 H5
└── docs/                 # 需求 / 设计 / 部署文档
```

