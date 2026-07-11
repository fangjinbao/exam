# 宝塔面板 + Docker 部署方案

> server 后端 + admin（PC 后台）+ mobile（移动端 H5）+ MySQL + Redis 全部跑在 Docker 里，宝塔只负责域名反代和 HTTPS。
> 两个前端用子域名：`admin.xxx.com` → 管理后台，`m.xxx.com` → 移动端 H5。
>
> **本文档支持两种部署方式，除"镜像从哪来"外，其余步骤完全通用：**

| | **方式一：GitHub CI 构建镜像**（推荐） | **方式二：服务器本地构建** |
|---|---|---|
| 镜像来源 | GitHub Actions 构建推到 GHCR，服务器只拉取 | 服务器用本地源码 + Dockerfile 现场构建 |
| 服务器需要 | 仅 `docker-compose.yaml` + `.env`（无源码）+ 登录 GHCR | **完整源码**（git clone 或上传打包） |
| 服务器负载 | 低（2 核 2G 够，不构建） | 高（构建吃内存，建议 ≥4G 或加 swap） |
| 依赖外网 | 需能访问 GHCR（可设 Public 免登录） | 构建时需拉基础镜像/依赖，运行不依赖 GHCR |
| 适用场景 | 有 GitHub、走标准 CI/CD、多机部署 | 内网/离线环境、不想用 GHCR、单机自建 |
| 启动命令 | `docker compose up -d` | `docker compose up -d --build` |

部署链路：

```
【方式一】本地 git push ─► GitHub Actions ─► 构建 3 个镜像 ─► GHCR ─► 服务器 docker compose pull
【方式二】上传/克隆源码到服务器 ─► docker compose up -d --build（本地构建，不碰 GHCR）
                                                          │
admin.xxx.com ─┐                        ┌─ 127.0.0.1:8080 (admin-nginx)
               ├─ 宝塔 Nginx (80/443) ──┤
m.xxx.com     ─┘   反代 + HTTPS          └─ 127.0.0.1:8081 (mobile-nginx)
                                              两者 ──接口──► backend(9001) + MySQL + Redis
```

两种方式最终跑起来的容器、端口、宝塔反代、HTTPS、升级方式完全一致，仅"镜像从哪来"不同。容器只绑 `127.0.0.1`，外部走宝塔反代进来；数据落命名卷，容器重建不丢。

---

## 一、环境准备

| 项目 | 要求 |
|------|------|
| 服务器 | Linux x86_64。方式一 2 核 2G 即可（不构建）；**方式二本地构建吃内存，建议 ≥4G，或加 2G swap** |
| 宝塔面板 | 7.x / 8.x，[官网安装脚本](https://www.bt.cn/new/download.html)；面板 →「Docker」→「立即安装」 |
| 域名 | `admin.xxx.com`、`m.xxx.com` 各加一条 A 记录指向服务器 IP；国内需 **ICP 备案** |
| GitHub | 仅**方式一**需要：代码已推到你的 GitHub 仓库，Actions 已能构建出镜像（仓库 Actions 页绿勾） |

> **📌 文档约定**：下文出现的 `<你的GitHub用户名>` 和 `<你的仓库>` 请替换成实际值。
> 本项目源仓库 owner 是 `fangjinbao`、仓库名 `inspection`；**别人 fork 部署时，把这两处换成自己的**。

**仅方式一需了解的 CI 自动构建**（一次性确认，无需手动操作）：仓库已配 `.github/workflows/`，push 到 `main` 且改动了 `admin/`、`mobile/`、`server/` 时，自动构建对应镜像推到**你自己仓库的 GHCR**：

- `ghcr.io/<你的GitHub用户名>/inspection-server`
- `ghcr.io/<你的GitHub用户名>/inspection-admin`
- `ghcr.io/<你的GitHub用户名>/inspection-mobile`

> CI 用 `GITHUB_REPOSITORY_OWNER` 自动取当前仓库 owner，**谁 fork 谁的 Actions 就推到谁的 GHCR**，workflow 文件无需改。

每次构建打两个标签：`latest`（最新）和 `sha-<短哈希>`（不可变，用于回滚）。

---

## 二、首次部署

### 1. 准备部署文件

所有 `docker compose` 命令都在部署目录 `/www/wwwroot/inspection` 执行。按你选的方式准备文件：

**方式一（CI 构建）——服务器无需完整源码**，只要 2 个文件：`docker-compose.yaml`、`.env.example`：

```bash
mkdir -p /www/wwwroot/inspection && cd /www/wwwroot/inspection
# 方式 A：只传所需文件（推荐，服务器无源码）
#   把仓库根目录的 docker-compose.yaml、.env.example 传到此目录
# 方式 B：直接 git clone（图方便，拉镜像版 compose 不会触发构建）
git clone https://github.com/<你的GitHub用户名>/<你的仓库>.git .
```

**方式二（本地构建）——服务器需要完整源码**（含 `admin/`、`server/`、`mobile/` 及各自 Dockerfile）：

```bash
cd /www/wwwroot
# 方式 A：git clone（推荐，后续 git pull 更新代码方便）
git clone https://github.com/<你的GitHub用户名>/<你的仓库>.git inspection
cd inspection
# 方式 B：本地打包上传（内网/无 GitHub 访问时）
#   本地：tar --exclude=node_modules --exclude=.git -czf inspection.tar.gz .
#   上传后：mkdir -p /www/wwwroot/inspection && tar -xzf inspection.tar.gz -C /www/wwwroot/inspection
```

> 本地打包务必排除 `node_modules`、`dist`、`.git`（构建在容器内进行，这些是本地产物，传上去既慢又可能污染构建）。

### 2. 登录 GHCR（仅方式一需要）

GHCR 镜像默认私有，服务器拉取前先登录。用一个只读 Token，凭据只留服务器：

1. GitHub 网页：`Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token`，勾选 **`read:packages`**，生成后复制。
2. 服务器执行（用户名换成你自己的 GitHub 用户名，按提示粘贴 Token）：

```bash
echo "粘贴你的PAT" | docker login ghcr.io -u <你的GitHub用户名> --password-stdin
```

看到 `Login Succeeded` 即可。

> 嫌麻烦也可把仓库的三个 package 在 GitHub 设为 Public，则服务器免登录直接拉。
> **方式二（本地构建）跳过本步**，本地构建不拉 GHCR、无需登录。

### 3. 配置环境变量

```bash
cp .env.example .env
vi .env          # 或用宝塔「文件」编辑器
```

改这几项：

| 变量 | 说明 |
|------|------|
| `IMAGE_OWNER` | **仅方式一**用：你的 GitHub 用户名（小写），决定从谁的 GHCR 拉镜像。方式二本地构建保持默认即可（仅作为构建产物的镜像标签名，不影响构建、不联网） |
| `MYSQL_ROOT_PASSWORD` | MySQL root 密码，强密码（纯字母数字） |
| `MYSQL_PASSWORD` | 应用库密码，强密码 |
| `REDIS_PASSWORD` | Redis 密码，**不能留空** |
| `JWT_SECRET` | JWT 密钥，`openssl rand -hex 32` 生成 |
| （`MYSQL_DATABASE`/`MYSQL_USER` 保持默认 `agentpm`） | |

> 端口、镜像标签都有默认值，不用配。端口默认 admin=8080、mobile=8081；`IMAGE_TAG` 默认 latest。
> 若 8080/8081 被占用，在 `.env` 设 `ADMIN_HTTP_PORT=8088`、`MOBILE_HTTP_PORT=8089` 等空闲端口（宝塔反代目标同步改）。

### 4. 启动服务

**方式一（CI 构建）——拉镜像启动**：

```bash
docker compose pull          # 从 GHCR 拉三个镜像
docker compose up -d         # 启动（不构建，秒级）
```

> 只要执行了 `pull`，`up -d` 就用拉下来的现成镜像，不会触发构建。

**方式二（本地构建）——用本地源码构建并启动，全程不碰 GHCR**：

```bash
docker compose up -d --build
```

> `docker-compose.yaml` 里三个应用服务同时写了 `image:` 和 `build:`：加 `--build` 就用本地 Dockerfile 构建，构建产物打上 `image:` 那个名字（`ghcr.io/...` 只是标签，**构建全程不联网、不 pull、不依赖 GitHub / GHCR / IMAGE_OWNER**）。
> 首次构建三个镜像（含 npm/pnpm 装依赖）约 3~8 分钟，取决于服务器性能与网络。

两种方式启动顺序都自动编排：MySQL/Redis 健康 → backend 健康（含 Prisma 迁移建表）→ 两个前端。首次 MySQL 初始化约 30~60 秒。

### 5. 本机验证

```bash
docker compose ps                                # 5 个容器，backend 应为 (healthy)
curl -I http://127.0.0.1:8080/                   # admin 前端
curl -i http://127.0.0.1:8080/admin/open/health  # 经 admin 反代到后端，返回 200
curl -I http://127.0.0.1:8081/                   # mobile 前端
```

### 6. 宝塔加站点 + 反向代理（两个站点，操作相同）

对 `admin.xxx.com` 和 `m.xxx.com` 各做一遍：

**① 添加站点**：宝塔 →「网站」→「添加站点」，域名填子域名；数据库/FTP 不创建；PHP 选「纯静态」。

**② 反向代理**：该站点「设置」→「反向代理」→「添加反向代理」：

| 站点 | 目标 URL | 发送域名 |
|------|----------|----------|
| `admin.xxx.com` | `http://127.0.0.1:8080` | `$host` |
| `m.xxx.com` | `http://127.0.0.1:8081` | `$host` |

### 7. 开启 HTTPS

各站点「设置」→「SSL」→「Let's Encrypt」→ 勾选域名申请 → 开「强制 HTTPS」。证书自动续期。

> 申请卡校验：改用「DNS 验证」，或临时关反代申请成功后再开。

### 8. 首次登录

默认管理员 `admin` / `123456`，**登录后立即改密码**。

---

## 三、功能升级（发版）

### 方式一（CI 构建）：三步，服务器不碰代码、不构建

```
① 本地改代码 → git push 到 main
② 等 GitHub 仓库 Actions 页变绿（镜像已推到 GHCR）
③ 服务器执行：
```

```bash
cd /www/wwwroot/inspection
docker compose pull          # 拉最新镜像
docker compose up -d         # 滚动重启变化的容器
docker compose ps            # 确认状态
```

- 改了哪个端（admin/mobile/server），CI 只重建那个镜像，服务器 `pull` 也只拉变化的。
- 数据库结构变更由后端容器启动时自动 `prisma migrate deploy`，无需手动。
- 宝塔站点配置不用动。

**回滚**：把 `.env` 里的 `IMAGE_TAG` 从 `latest` 换成历史的 `sha-` 标签，再 `pull && up -d`：

```bash
IMAGE_TAG=sha-1a2b3c4     # 标签在 GitHub 仓库 → Packages 里查
```

### 方式二（本地构建）：更新源码后重新构建

```bash
cd /www/wwwroot/inspection
git pull                     # 或重新上传代码包覆盖
docker compose up -d --build
docker compose ps
```

- `--build` 会按 Dockerfile 分层缓存比对，只重建有改动的镜像层，未改的端几乎秒过。
- 数据库结构变更同样由后端容器启动时自动迁移。
- 回滚：`git checkout <历史commit>` 后重新 `--build`。

**两种方式升级前都建议备份数据库**：

```bash
cd /www/wwwroot/inspection
docker compose exec mysql \
  sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' > backup_$(date +%Y%m%d_%H%M).sql
```

---

## 四、常用命令

在 `/www/wwwroot/inspection/` 目录执行（两种方式共用一份 `docker-compose.yaml`，命令一致；方式二 `up` 时加 `--build` 即走本地构建）：

```bash
docker compose pull                    # 拉最新镜像（仅方式一）
docker compose up -d                   # 启动/更新（方式一）
docker compose ps                      # 容器状态
docker compose logs -f backend         # 后端日志
docker compose logs -f admin-nginx     # admin 前端日志
docker compose logs -f mobile-nginx    # mobile 前端日志
docker compose restart backend         # 重启单个服务
docker compose down                    # 停止（保留数据卷）
docker compose down -v                 # 停止并删数据卷（会删库，谨慎！）
```

方式二（本地构建）专用——`up` 时加 `--build` 用本地源码构建：

```bash
docker compose up -d --build         # 构建并启动
docker compose build                 # 仅构建
```

常见问题：

| 现象 | 解决 |
|------|------|
| 拉镜像报 `denied`/`401`/`unauthorized` | （方式一）没登录 GHCR 或 Token 无 `read:packages`，重做「二、2」；或把包设为 Public |
| `manifest unknown` | （方式一）CI 还没构建出镜像，去 GitHub Actions 页确认构建成功 |
| 容器名冲突 `container name ... already in use` | 有残留同名容器：`docker compose down` 后重启；仍冲突则 `docker rm -f agentpm-mysql agentpm-redis agentpm-backend agentpm-admin-nginx agentpm-mobile-nginx` 再启（删容器不删数据卷，数据不丢） |
| 端口冲突 `port is already allocated` | 8080/8081 被占：`ss -tlnp \| grep :8080` 查占用，在 `.env` 改 `ADMIN_HTTP_PORT`/`MOBILE_HTTP_PORT` 到空闲端口，并同步改宝塔反代目标 |
| （方式二）构建 OOM / 卡死 / 被 Killed | 服务器内存不足：加 swap（`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`）或升配后重试 |
| （方式二）`up -d` 却报找不到 Dockerfile / 构建失败 | 本地构建需完整源码；确认服务器有 `admin/`、`server/`、`mobile/` 及各自 Dockerfile，而非只传了 2 个文件 |
| `redis is unhealthy`，backend 不启动 | `.env` 的 `REDIS_PASSWORD` 不能留空 |
| 域名打开 502 | 后端没起好或反代端口错；`curl 127.0.0.1:8080/admin/open/health` 确认 |
| 改了 `.env` 不生效 | 必须重建容器：方式一 `docker compose up -d`；方式二 `docker compose up -d --build` |

---

> **安全须知**：MySQL/Redis 不对公网暴露；`.env` 含密码已被 `.gitignore` 忽略，不要提交；GHCR 登录的 PAT 只留服务器；生产务必开 HTTPS。
>
> **mobile 接口前缀**：移动端当前是 mock 演示，`nginx.conf` 反代 `/api`。真正对接后端时（后端预留 `/app/*`），改 `mobile/nginx.conf` 的 `/api` 为 `/app` 并同步 `VITE_API_BASE_URL`，push 后 CI 自动重建。
