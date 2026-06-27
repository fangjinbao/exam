# 宝塔面板 + Docker 部署方案（CI 构建镜像）

> **方案 C（主流 CI/CD）**：代码推到 GitHub → Actions 自动构建镜像推到 GHCR → 服务器只拉镜像运行，**不在服务器构建**。
> server 后端 + admin（PC 后台）+ mobile（移动端 H5）+ MySQL + Redis 跑在 Docker 里，宝塔只负责域名反代和 HTTPS。
> 两个前端用子域名：`admin.xxx.com` → 管理后台，`m.xxx.com` → 移动端 H5。

部署链路：

```
本地 git push ─► GitHub Actions ─► 构建 3 个镜像 ─► GHCR 镜像仓库
                                                          │ 服务器 docker compose pull
admin.xxx.com ─┐                        ┌─ 127.0.0.1:8080 (admin-nginx)
               ├─ 宝塔 Nginx (80/443) ──┤
m.xxx.com     ─┘   反代 + HTTPS          └─ 127.0.0.1:8081 (mobile-nginx)
                                              两者 ──接口──► backend(9001) + MySQL + Redis
```

服务器不装 node、不存源码、不构建，只拉现成镜像秒级启动。容器只绑 `127.0.0.1`，外部走宝塔反代进来。数据落命名卷，容器重建不丢。

---

## 一、环境准备

| 项目 | 要求 |
|------|------|
| 服务器 | Linux x86_64，2 核 2G 即可（不构建，比方案 B 省内存） |
| 宝塔面板 | 7.x / 8.x，[官网安装脚本](https://www.bt.cn/new/download.html)；面板 →「Docker」→「立即安装」 |
| 域名 | `admin.xxx.com`、`m.xxx.com` 各加一条 A 记录指向服务器 IP；国内需 **ICP 备案** |
| GitHub | 代码已推到你的 GitHub 仓库，Actions 已能构建出镜像（仓库 Actions 页绿勾） |

> **📌 文档约定**：下文出现的 `<你的GitHub用户名>` 和 `<你的仓库>` 请替换成实际值。
> 本项目源仓库 owner 是 `fangjinbao`、仓库名 `inspection`；**别人 fork 部署时，把这两处换成自己的**。

**CI 自动构建（一次性确认，无需手动操作）**：仓库已配 `.github/workflows/`，push 到 `main` 且改动了 `admin/`、`mobile/`、`server/` 时，自动构建对应镜像推到**你自己仓库的 GHCR**：

- `ghcr.io/<你的GitHub用户名>/inspection-server`
- `ghcr.io/<你的GitHub用户名>/inspection-admin`
- `ghcr.io/<你的GitHub用户名>/inspection-mobile`

> CI 用 `GITHUB_REPOSITORY_OWNER` 自动取当前仓库 owner，**谁 fork 谁的 Actions 就推到谁的 GHCR**，workflow 文件无需改。

每次构建打两个标签：`latest`（最新）和 `sha-<短哈希>`（不可变，用于回滚）。

---

## 二、首次部署

### 1. 服务器登录 GHCR（拉私有镜像需要）

GHCR 镜像默认私有，服务器拉取前先登录。用一个只读 Token，凭据只留服务器：

1. GitHub 网页：`Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token`，勾选 **`read:packages`**，生成后复制。
2. 服务器执行（用户名换成你自己的 GitHub 用户名，按提示粘贴 Token）：

```bash
echo "粘贴你的PAT" | docker login ghcr.io -u <你的GitHub用户名> --password-stdin
```

看到 `Login Succeeded` 即可。

> 嫌麻烦也可把仓库的三个 package 在 GitHub 设为 Public，则服务器免登录直接拉。

### 2. 准备部署文件（服务器无需完整源码）

`docker-compose.yaml` 和 `.env.example` 都在**项目根目录**。服务器只需要这两个文件即可（拉镜像不依赖源码）：

```bash
mkdir -p /www/wwwroot/inspection && cd /www/wwwroot/inspection
# 方式 A：只传两个文件（推荐，服务器无源码）
#   把仓库根目录的 docker-compose.yaml 和 .env.example 传到此目录
# 方式 B：直接 git clone（图方便，compose 是拉镜像版不会触发构建）
git clone https://github.com/<你的GitHub用户名>/<你的仓库>.git .
```

> 后续所有 `docker compose` 命令都在此根目录执行。

### 3. 配置环境变量

```bash
cp .env.example .env
vi .env          # 或用宝塔「文件」编辑器
```

改这几项：

| 变量 | 说明 |
|------|------|
| `IMAGE_OWNER` | **改成你自己的 GitHub 用户名（小写）**，决定从谁的 GHCR 拉镜像。源仓库默认 `fangjinbao`，fork 部署必改 |
| `MYSQL_ROOT_PASSWORD` | MySQL root 密码，强密码（纯字母数字） |
| `MYSQL_PASSWORD` | 应用库密码，强密码 |
| `REDIS_PASSWORD` | Redis 密码，**不能留空** |
| `JWT_SECRET` | JWT 密钥，`openssl rand -hex 32` 生成 |
| （`MYSQL_DATABASE`/`MYSQL_USER` 保持默认 `agentpm`） | |

> 端口、镜像标签都有默认值，不用配。端口默认 admin=8080、mobile=8081；`IMAGE_TAG` 默认 latest。

### 4. 拉镜像并启动

```bash
docker compose pull          # 从 GHCR 拉三个镜像
docker compose up -d         # 启动（不构建，秒级）
```

启动顺序自动编排：MySQL/Redis 健康 → backend 健康（含 Prisma 迁移建表）→ 两个前端。首次 MySQL 初始化约 30~60 秒。

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

方案 C 的发版只有三步，**服务器不碰代码、不构建**：

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

**回滚到旧版本**：把 `.env` 里的 `IMAGE_TAG` 从 `latest` 换成历史的 `sha-` 标签，再 `pull && up -d`（三个镜像一起回到该版本）：

```bash
# .env 里改（标签在 GitHub 仓库 → Packages 里查）
IMAGE_TAG=sha-1a2b3c4
```

> 若只想回滚单个端（如只回后端），可临时在 `.env` 加一行覆盖该服务镜像，或直接改 `docker-compose.yaml` 对应 image 行。一般整体回滚即可。

**升级前建议备份数据库**：

```bash
cd /www/wwwroot/inspection
docker compose exec mysql \
  sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' > backup_$(date +%Y%m%d_%H%M).sql
```

---

## 四、常用命令

在 `/www/wwwroot/inspection/` 目录执行：

```bash
docker compose pull                    # 拉最新镜像
docker compose up -d                   # 启动/更新
docker compose ps                      # 容器状态
docker compose logs -f backend         # 后端日志
docker compose logs -f admin-nginx     # admin 前端日志
docker compose logs -f mobile-nginx    # mobile 前端日志
docker compose restart backend         # 重启单个服务
docker compose down                    # 停止（保留数据卷）
docker compose down -v                 # 停止并删数据卷（会删库，谨慎！）
```

常见问题：

| 现象 | 解决 |
|------|------|
| 拉镜像报 `denied`/`401` | 没登录 GHCR 或 Token 无 `read:packages`，重做「二、1」 |
| `manifest unknown` | CI 还没构建出镜像，去 GitHub Actions 页确认构建成功 |
| `redis is unhealthy`，backend 不启动 | `.env` 的 `REDIS_PASSWORD` 不能留空 |
| 域名打开 502 | 后端没起好或反代端口错；`curl 127.0.0.1:8080/admin/open/health` 确认 |
| 改了 `.env` 不生效 | 必须 `docker compose up -d` 重建容器 |

---

> **安全须知**：MySQL/Redis 不对公网暴露；`.env` 含密码已被 `.gitignore` 忽略，不要提交；GHCR 登录的 PAT 只留服务器；生产务必开 HTTPS。
>
> **mobile 接口前缀**：移动端当前是 mock 演示，`nginx.conf` 反代 `/api`。真正对接后端时（后端预留 `/app/*`），改 `mobile/nginx.conf` 的 `/api` 为 `/app` 并同步 `VITE_API_BASE_URL`，push 后 CI 自动重建。
