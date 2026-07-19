# 宝塔面板 + Docker 部署方案

> 后端 + 所有前端 + MySQL + Redis 全部跑在 Docker 里，宝塔只负责域名反代和 HTTPS。
> 所有前端由**一个网关容器**统一托管，按子域名分流：`admin.xxx.com` → 管理后台，`m.xxx.com` → 移动端 H5。

本文档面向第一次部署的同学。**先在下面选一种方式，然后直接跳到对应章节，从头到尾走一遍即可，不用来回跳。**

## 第一步：先选一种部署方式

| | **方式一：GitHub 自动构建**（省心） | **方式二：服务器本地构建**（自主） |
|---|---|---|
| 镜像哪来 | push 代码后 GitHub 自动构建，服务器只下载 | 服务器上用源码现场构建 |
| 服务器要放什么 | 只要 `docker-compose.yaml` + `.env`（不用源码） | **完整源码**（git clone 或上传） |
| 服务器配置 | 低，2 核 2G 够（不构建） | 高，建议 **≥4G 内存**（构建吃内存），或加 swap |
| 要不要 GitHub | 要（代码托管在 GitHub，且 Actions 能跑） | 不要（内网 / 离线也能装） |
| 适合谁 | 有 GitHub、想省事、可能多台机器 | 内网环境、不想用 GitHub、就一台机器 |

- 选**方式一** → 先看「一、环境准备」，再直接看「二、方式一」。
- 选**方式二** → 先看「一、环境准备」，再直接看「三、方式二」。

两种方式最终跑起来的容器、端口、宝塔配置**完全一致**，随时可切换。

## 整体长什么样

```
用户浏览器
   │  admin.xxx.com / m.xxx.com（HTTPS）
   ▼
宝塔 Nginx（80/443，负责域名 + 证书）
   │  两个域名都反代到 ▼
127.0.0.1:8080  ── gateway 容器（一个 nginx，按域名分流）
   │                 ├─ admin.xxx.com → 管理后台静态页
   │                 └─ m.xxx.com     → 移动端静态页
   │  接口请求 ▼
backend 容器（NestJS，9001） ── MySQL 容器 + Redis 容器
```

一共 **4 个容器**：`mysql`、`redis`、`backend`、`gateway`。
关键点：**所有前端只有 1 个网关容器、只占 1 个端口（8080）**。以后再加前端，容器和端口都不增加。
容器只绑 `127.0.0.1`（不对公网开放），外部流量统一走宝塔反代进来；数据存在 Docker 命名卷里，容器重建不丢。

---

## 一、环境准备（两种方式通用）

| 项目 | 要求 |
|------|------|
| 服务器 | Linux（x86_64）。方式一 2 核 2G 够；**方式二本地构建吃内存，建议 ≥4G，或加 2G swap** |
| 宝塔面板 | 7.x / 8.x。[官网脚本](https://www.bt.cn/new/download.html)装好后，面板 →「Docker」→「立即安装」把 Docker 装上 |
| 域名 | `admin.xxx.com`、`m.xxx.com` 各加一条 A 记录指向服务器 IP；国内需 **ICP 备案** |

> **文档约定**：下文的 `<你的GitHub用户名>`、`<你的仓库>`、`xxx.com` 请替换成你自己的实际值。

**命令在哪敲？**（重要，小白必看）下文所有 `docker compose ...` 命令，都在宝塔的**终端**里执行：

1. 宝塔左侧菜单点「**终端**」（或右上角小黑窗图标），会弹出一个命令行窗口。
2. 先进部署目录，再敲后续命令：
   ```bash
   cd /www/wwwroot/agentpm
   ```
3. 之后每一步的命令，直接复制粘贴进这个终端、回车即可。

> 记不住没关系：只要看到 `docker compose` 开头的命令，就是在这个终端里、`cd` 到 `/www/wwwroot/agentpm` 之后执行。

---

# 二、方式一：GitHub 自动构建

> 思路：代码 push 到 GitHub，Actions 自动构建 **2 个镜像**推到你的 GHCR，服务器只负责下载运行。

仓库已配好 `.github/workflows/docker.yml`，每次 push 到 `main` 自动构建：

- `ghcr.io/<你的GitHub用户名>/agentpm-server` —— 后端
- `ghcr.io/<你的GitHub用户名>/agentpm-gateway` —— 网关（含所有前端）

> 谁 fork 谁的 Actions 就推到谁的 GHCR，workflow 不用改。每次打两个标签：`latest`（最新）和 `sha-<短哈希>`（用于回滚）。
> 前提：仓库 Actions 页能看到绿色对勾（构建成功）。

## 2.1 首次部署

### 第 1 步：把文件放到服务器（不用源码，只要 2 个文件）

这个方式只需要 2 个文件：`docker-compose.yaml` 和 `.env.example`（都在项目仓库根目录）。跟着做：

**① 先在你电脑上拿到这 2 个文件**：打开 GitHub 仓库首页 → 点 `docker-compose.yaml` → 右上角「Download raw file」下载；`.env.example` 同样操作。两个文件存到电脑桌面。

**② 在宝塔里建目录并上传**：

1. 宝塔左侧菜单点「**文件**」。
2. 地址栏进入 `/www/wwwroot`（没有就在上层点「新建目录」建出来）。
3. 点「**新建目录**」，名字填 `agentpm`，进入 `/www/wwwroot/agentpm`。
4. 点上方「**上传**」按钮，把桌面那 2 个文件拖进去，确认上传。

**③ 确认文件到位**：此时 `/www/wwwroot/agentpm` 里应能看到 `docker-compose.yaml` 和 `.env.example` 两个文件。

> 会用命令行的话，一条也行：
> ```bash
> mkdir -p /www/wwwroot/agentpm && cd /www/wwwroot/agentpm
> # 然后用 scp 从本地传，或 wget 从仓库 raw 地址下载这 2 个文件
> ```

### 第 2 步：把镜像包设为 Public（在 GitHub 网页操作，一次性）

GHCR 镜像默认私有，服务器下载不了。把 2 个包设为公开，之后服务器就能免登录直接下载。

CI 第一次跑成功后（Actions 页变绿），GitHub 会自动生成 2 个包。逐个设为 Public：

1. 打开 GitHub 你的**个人主页** → 顶部「**Packages**」标签，能看到 `agentpm-server`、`agentpm-gateway` 两个包。
2. 点进 `agentpm-server` → 右侧「**Package settings**」（齿轮）。
3. 拉到最底部「**Danger Zone**」→「**Change visibility**」→ 选「**Public**」→ 按提示输入包名确认。
4. 对 `agentpm-gateway` 重复第 2~3 步。

两个包都显示 `Public` 即可。之后服务器下载镜像不用登录、不用 token。

> 找不到包？说明 CI 还没成功推过镜像，先确认仓库 Actions 页是绿色对勾，再回来设置。

### 第 3 步：配置 `.env`

```bash
cp .env.example .env
vi .env            # 或用宝塔「文件」编辑器打开
```

必须改的项：

| 变量 | 改成什么 |
|------|----------|
| `IMAGE_OWNER` | 你的 GitHub 用户名（小写），决定从谁的 GHCR 下载镜像 |
| `ADMIN_DOMAIN` | 管理后台域名，如 `admin.xxx.com`（**要和第 6 步宝塔的域名一致**） |
| `MOBILE_DOMAIN` | 移动端域名，如 `m.xxx.com` |
| `MYSQL_ROOT_PASSWORD` | MySQL root 密码，强密码（纯字母数字） |
| `MYSQL_PASSWORD` | 应用库密码，强密码 |
| `REDIS_PASSWORD` | Redis 密码，**不能留空** |
| `JWT_SECRET` | JWT 密钥，用 `openssl rand -hex 32` 生成一串填进去 |

> `MYSQL_DATABASE`/`MYSQL_USER` 保持默认 `agentpm`。端口默认 `8080`，被占用时才设 `GATEWAY_HTTP_PORT`。
> `ADMIN_DOMAIN`/`MOBILE_DOMAIN` 决定网关按哪个域名分流，**必须和宝塔填的域名完全一致**，否则打开域名会 404。

### 第 4 步：下载镜像并启动

```bash
docker compose pull          # 从 GHCR 下载 2 个镜像
docker compose up -d         # 启动（不构建，秒级完成）
```

> 启动顺序自动编排：MySQL/Redis 就绪 → 后端就绪（自动建表迁移）→ 网关。首次 MySQL 初始化约 30~60 秒。

### 第 5 步：在服务器本机验证

```bash
docker compose ps                          # 应有 4 个容器，backend 显示 (healthy)
curl -I -H "Host: admin.xxx.com" http://127.0.0.1:8080/          # 管理后台，返回 200
curl -i -H "Host: admin.xxx.com" http://127.0.0.1:8080/admin/open/health   # 反代到后端，返回 200
curl -I -H "Host: m.xxx.com"     http://127.0.0.1:8080/          # 移动端，返回 200
```

看到 200 就说明容器内部正常，接下来交给宝塔对外暴露。

### 第 6 步：宝塔加站点 + 反向代理

对 `admin.xxx.com` 和 `m.xxx.com` 各做一遍（**两个域名都反代到同一个 8080**，网关自己按域名分流）：

**① 添加站点**：宝塔 →「网站」→「添加站点」，域名填子域名；数据库/FTP 不用建；PHP 选「纯静态」。

**② 反向代理**：进该站点「设置」→「反向代理」→「添加反向代理」：

| 站点 | 目标 URL | 发送域名 |
|------|----------|----------|
| `admin.xxx.com` | `http://127.0.0.1:8080` | `$host` |
| `m.xxx.com` | `http://127.0.0.1:8080` | `$host` |

> 两个站点目标端口**都是 8080**。`发送域名` 填 `$host` 很关键——网关靠它区分该返回哪个前端。

### 第 7 步：开启 HTTPS

每个站点「设置」→「SSL」→「Let's Encrypt」→ 勾选域名申请 → 打开「强制 HTTPS」。证书自动续期。

> **推荐申请泛域名证书 `*.xxx.com`**（DNS 验证）：一张证书覆盖所有子域名，以后加新前端不用再申请。

### 第 8 步：首次登录

浏览器打开 `https://admin.xxx.com`，默认管理员 `admin` / `123456`，**登录后马上改密码**。

## 2.2 功能升级（发版）

**升级前先备份数据库**：

```bash
cd /www/wwwroot/agentpm
docker compose exec mysql \
  sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' > backup_$(date +%Y%m%d_%H%M).sql
```

三步搞定，服务器不碰代码：

```
① 本地改代码 → git push 到 main
② 等 GitHub 仓库 Actions 页变绿（镜像已推到 GHCR）
③ 服务器执行下面三条：
```

```bash
cd /www/wwwroot/agentpm
docker compose pull          # 下载最新镜像
docker compose up -d         # 滚动重启有变化的容器
docker compose ps            # 确认状态
```

- 数据库结构变更由后端启动时自动 `prisma migrate deploy`，无需手动。宝塔站点配置也不用动。
- **回滚**：把 `.env` 里 `IMAGE_TAG` 从 `latest` 改成历史 `sha-` 标签（GitHub 仓库 → Packages 里查），再 `docker compose pull && docker compose up -d`。

---

# 三、方式二：服务器本地构建

> 思路：把完整源码放到服务器，用 `docker compose up -d --build` 现场构建，全程不碰 GitHub / GHCR。适合内网、离线、不想用 GitHub 的场景。

## 3.1 首次部署

### 第 1 步：把完整源码放到服务器

本地构建需要整个项目源码。在宝塔「**终端**」里执行（推荐 git clone，以后更新方便）：

```bash
cd /www/wwwroot
git clone https://github.com/<你的GitHub用户名>/<你的仓库>.git agentpm
cd agentpm
```

clone 完成后，`/www/wwwroot/agentpm` 里应能看到 `docker/`、`server/`、`admin/`、`mobile/`、`docker-compose.yaml` 等（有这些才能本地构建）。

> **内网 / 服务器连不上 GitHub**？改成本地打包上传：
> 1. 在你电脑的项目目录执行：`tar --exclude=node_modules --exclude=.git -czf agentpm.tar.gz .`
> 2. 宝塔「文件」进入 `/www/wwwroot`，新建目录 `agentpm`，把 `agentpm.tar.gz` 上传进去。
> 3. 宝塔终端执行：`cd /www/wwwroot/agentpm && tar -xzf agentpm.tar.gz`
>
> 打包务必排除 `node_modules`、`dist`、`.git`（构建在容器里做，这些本地产物传上去又慢又可能出错）。

### 第 2 步：配置 `.env`

```bash
cp .env.example .env
vi .env            # 或用宝塔「文件」编辑器打开
```

必须改的项：

| 变量 | 改成什么 |
|------|----------|
| `ADMIN_DOMAIN` | 管理后台域名，如 `admin.xxx.com`（**要和第 5 步宝塔的域名一致**） |
| `MOBILE_DOMAIN` | 移动端域名，如 `m.xxx.com` |
| `MYSQL_ROOT_PASSWORD` | MySQL root 密码，强密码（纯字母数字） |
| `MYSQL_PASSWORD` | 应用库密码，强密码 |
| `REDIS_PASSWORD` | Redis 密码，**不能留空** |
| `JWT_SECRET` | JWT 密钥，用 `openssl rand -hex 32` 生成一串填进去 |

> 本地构建**不用管 `IMAGE_OWNER`**（保持默认即可，它只是构建产物的镜像标签名，不联网、不影响构建）。
> `MYSQL_DATABASE`/`MYSQL_USER` 保持默认 `agentpm`。端口默认 `8080`，被占用时才设 `GATEWAY_HTTP_PORT`。
> `ADMIN_DOMAIN`/`MOBILE_DOMAIN` **必须和宝塔填的域名完全一致**，否则打开域名会 404。

### 第 3 步：本地构建并启动

```bash
docker compose up -d --build
```

> 首次构建（网关要一次性构建所有前端 + 后端装依赖）约 5~10 分钟，取决于服务器性能。
> 全程不联网 GHCR：`ghcr.io/...` 只是构建产物的标签名。
> 启动顺序自动编排：MySQL/Redis 就绪 → 后端就绪（自动建表迁移）→ 网关。

### 第 4 步：在服务器本机验证

```bash
docker compose ps                          # 应有 4 个容器，backend 显示 (healthy)
curl -I -H "Host: admin.xxx.com" http://127.0.0.1:8080/          # 管理后台，返回 200
curl -i -H "Host: admin.xxx.com" http://127.0.0.1:8080/admin/open/health   # 反代到后端，返回 200
curl -I -H "Host: m.xxx.com"     http://127.0.0.1:8080/          # 移动端，返回 200
```

看到 200 就说明容器内部正常，接下来交给宝塔对外暴露。

### 第 5 步：宝塔加站点 + 反向代理

对 `admin.xxx.com` 和 `m.xxx.com` 各做一遍（**两个域名都反代到同一个 8080**，网关自己按域名分流）：

**① 添加站点**：宝塔 →「网站」→「添加站点」，域名填子域名；数据库/FTP 不用建；PHP 选「纯静态」。

**② 反向代理**：进该站点「设置」→「反向代理」→「添加反向代理」：

| 站点 | 目标 URL | 发送域名 |
|------|----------|----------|
| `admin.xxx.com` | `http://127.0.0.1:8080` | `$host` |
| `m.xxx.com` | `http://127.0.0.1:8080` | `$host` |

> 两个站点目标端口**都是 8080**。`发送域名` 填 `$host` 很关键——网关靠它区分该返回哪个前端。

### 第 6 步：开启 HTTPS

每个站点「设置」→「SSL」→「Let's Encrypt」→ 勾选域名申请 → 打开「强制 HTTPS」。证书自动续期。

> **推荐申请泛域名证书 `*.xxx.com`**（DNS 验证）：一张证书覆盖所有子域名，以后加新前端不用再申请。

### 第 7 步：首次登录

浏览器打开 `https://admin.xxx.com`，默认管理员 `admin` / `123456`，**登录后马上改密码**。

## 3.2 功能升级（发版）

**升级前先备份数据库**：

```bash
cd /www/wwwroot/agentpm
docker compose exec mysql \
  sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' > backup_$(date +%Y%m%d_%H%M).sql
```

更新源码后重新构建：

```bash
cd /www/wwwroot/agentpm
git pull                     # 或重新上传源码覆盖
docker compose up -d --build
docker compose ps
```

- `--build` 用分层缓存，只重建有改动的部分，没改的几乎秒过。
- 数据库结构变更由后端启动时自动 `prisma migrate deploy`，无需手动。宝塔站点配置也不用动。
- **回滚**：`git checkout <历史commit>` 后重新 `docker compose up -d --build`。

---

# 四、以后新增一个前端（比如商城 shop）

得益于单网关 + 清单驱动，新增前端**不用改 Dockerfile、compose 结构、CI、nginx 配置**，只动一份清单 + 加个域名：

1. **建前端目录**：在仓库根新建 `shop/`（标准 vite 项目）。
2. **清单加一行**：编辑 `docker/frontends.json`，加上 `{ "name": "shop", "apiPrefix": "/shop" }`。
3. **加域名变量**：`.env` 里加 `SHOP_DOMAIN=shop.xxx.com`；并在 `docker-compose.yaml` 的 `gateway.environment` 下加一行 `SHOP_DOMAIN: "${SHOP_DOMAIN}"`。
4. **宝塔加站**：加 `shop.xxx.com` 站点，反向代理到**同一个** `http://127.0.0.1:8080`（发送域名 `$host`）。用了泛证书 `*.xxx.com` 的话 HTTPS 自动覆盖。
5. **重新部署**：方式一 push 后 `docker compose pull && up -d`；方式二 `git pull && docker compose up -d --build`。

容器数量、端口都不变，还是那 4 个容器、那 1 个 8080 端口。

---

# 五、常用命令与排错

在 `/www/wwwroot/agentpm/` 目录执行：

```bash
docker compose ps                    # 看 4 个容器状态
docker compose logs -f backend       # 后端日志
docker compose logs -f gateway       # 网关日志
docker compose restart backend       # 重启单个服务
docker compose down                  # 停止（保留数据卷，不丢数据）
docker compose down -v               # 停止并删数据卷（会删库，谨慎！）
```

遇到问题看这里：

| 现象 | 解决 |
|------|------|
| 下载镜像报 `denied`/`401` | （方式一）包还是私有：按「二、第 2 步」把 `agentpm-server`/`agentpm-gateway` 两个包都设为 Public |
| `manifest unknown` | （方式一）CI 还没构建出镜像，去 GitHub Actions 页确认变绿 |
| 打开域名 404 / 显示错前端 | `.env` 的 `ADMIN_DOMAIN`/`MOBILE_DOMAIN` 和宝塔反代域名不一致；改一致后 `docker compose up -d` |
| 打开域名 502 | 后端没起好或反代端口错；`docker compose ps` 看 backend 是否 healthy |
| 容器名冲突 `already in use` | `docker compose down` 后重启；仍冲突 `docker rm -f agentpm-mysql agentpm-redis agentpm-backend agentpm-gateway` 再启（不丢数据卷） |
| 端口冲突 `port is already allocated` | 8080 被占：`.env` 改 `GATEWAY_HTTP_PORT` 到空闲端口，宝塔反代目标同步改 |
| （方式二）构建 OOM / 被 Killed | 内存不足：加 swap 或升配 |
| `redis is unhealthy` | `.env` 的 `REDIS_PASSWORD` 不能留空 |
| 改了 `.env` 不生效 | 要重建容器：方式一 `docker compose up -d`；方式二 `docker compose up -d --build` |

---

> **安全须知**：MySQL/Redis 不对公网开放；`.env` 含密码，已被 `.gitignore` 忽略，别提交；生产务必开 HTTPS。镜像包设为 Public 只暴露构建产物（前端静态资源 + 后端编译代码），不含 `.env` 密码，放心公开。
>
> **移动端接口前缀**：移动端当前是 mock 演示，网关反代 `/api`（见 `docker/frontends.json` 里 mobile 的 `apiPrefix`）。真对接后端时（后端预留 `/app/*`），把清单里 mobile 的 `apiPrefix` 改成 `/app`，同步移动端 `VITE_API_BASE_URL`，重新部署即可。
