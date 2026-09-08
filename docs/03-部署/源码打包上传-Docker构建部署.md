# 源码打包上传 + 服务器 Docker 构建部署

适用场景：本地打包源码 → 上传服务器 → 在服务器上用 Docker 构建并运行。服务器只需装 Docker，不需要装 Node、pnpm、MySQL、Redis。

与另一份《宝塔面板+Docker部署方案》的区别：那份用 `git clone` 拉源码、且依赖宝塔面板做反向代理；这份用压缩包上传、不依赖宝塔，直接用 Docker 起全套。

---

## 你要知道的三件事

**一、前端不用在本地构建。** 前端的 `pnpm build` 是在服务器的 Docker 构建阶段完成的（见 `docker/gateway.Dockerfile`），所以你本地不需要先跑 build、也不需要传 `dist` 目录。传源码即可。

**二、数据库表结构自动创建。** 后端容器启动前会自动执行 `prisma migrate deploy`（见 `docker/entrypoint.sh`），首次部署会建好全部表，以后加字段也会自动应用。你不需要手动敲任何迁移命令、不需要导入 SQL。

**三、服务器至少要 4G 内存。** 构建前端时 vite 吃内存，2G 的机器会 OOM。如果只有 2G，看文末「低配服务器怎么办」。

---

## 第一步：本地打包

在项目根目录执行。压缩包要排除 `node_modules`、`dist`、`.git` 这些——它们体积大且服务器上会重新生成。

```bash
cd /Users/fangjinbao/Desktop/Micon/micon-ai/exam

tar --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.git' \
    --exclude='docs' \
    --exclude='.claude' \
    --exclude='CLAUDE.md' \
    --exclude='.plan-*.md' \
    --exclude='server/docker/data' \
    --exclude='server/uploads' \
    --exclude='output' \
    --exclude='*.log' \
    --exclude='.env' \
    --exclude='.DS_Store' \
    -czf ../exam-deploy.tar.gz .
```

包会生成在项目上一级目录，名为 `exam-deploy.tar.gz`。检查大小：

```bash
ls -lh ../exam-deploy.tar.gz
```

**实测 3.9M**。如果你的包超过 50M，说明有大目录没排除干净，用这条查是谁占的：

```bash
tar -tzvf ../exam-deploy.tar.gz | sort -k5 -n -r | head -15 | awk '{printf "%9.2fM  %s\n", $5/1048576, $NF}'
```

### 几个排除项的原因

| 排除项 | 为什么 |
|--------|--------|
| `node_modules` `dist` | 服务器构建时会重新装、重新生成 |
| `output` | AI 生成的图片素材，**实测 146M**，与部署完全无关 |
| `server/uploads` | 运行时上传的文件（14M），服务器上有独立的 Docker volume 存这些，传上去反而会污染 |
| `server/docker/data` | 本地开发用的 MySQL 数据目录 |
| `.env` | 里面有数据库密码。不传，服务器上单独配一份 |
| `docs` | 文档，构建不需要 |
| `.claude` `CLAUDE.md` `.plan-*.md` | AI 协作配置与开发记录，不该进生产环境 |

---

## 第二步：上传到服务器

```bash
scp ../exam-deploy.tar.gz root@你的服务器IP:/opt/
```

如果服务器改过 SSH 端口（比如 2222）：

```bash
scp -P 2222 ../exam-deploy.tar.gz root@你的服务器IP:/opt/
```

---

## 第三步：服务器上解压

SSH 登录服务器后执行。

```bash
ssh root@你的服务器IP

mkdir -p /opt/exam
tar -xzf /opt/exam-deploy.tar.gz -C /opt/exam
cd /opt/exam

# 确认关键文件都在
ls docker-compose.yaml docker/server.Dockerfile docker/gateway.Dockerfile
```

三个文件都列出来才算解压正确。

---

## 第四步：配置环境变量

```bash
cd /opt/exam
cp .env.example .env
```

先生成两个密码和一个密钥，把输出记下来：

```bash
echo "MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)"
echo "MYSQL_PASSWORD=$(openssl rand -hex 16)"
echo "REDIS_PASSWORD=$(openssl rand -hex 16)"
echo "JWT_SECRET=$(openssl rand -hex 32)"
```

然后编辑 `.env`，把上面四行的值填进对应位置：

```bash
vi .env
```

填完应该是这样（值是你自己生成的，不要照抄）：

```env
MYSQL_ROOT_PASSWORD=a1b2c3d4e5f6...
MYSQL_PASSWORD=f6e5d4c3b2a1...
REDIS_PASSWORD=9z8y7x6w5v4u...
JWT_SECRET=一串64位的十六进制
```

**四项都必须填，一个都不能留空。** `REDIS_PASSWORD` 留空会导致 Redis 启动失败；`JWT_SECRET` 留空会导致登录功能不可用。

---

## 第五步：构建并启动

```bash
cd /opt/exam
docker compose up -d --build
```

`--build` 是关键：它让 Docker 用本地源码构建镜像，而不是去 GHCR 拉现成镜像。

首次构建要 5~15 分钟（装依赖 + 构建前后端）。构建过程会刷很多日志，只要最后没有 `ERROR` 就正常。

### 看启动状态

```bash
docker compose ps
```

四个容器都应该是 `Up`，其中 mysql、redis、backend 还会显示 `(healthy)`：

```
NAME                STATUS
agentpm-mysql       Up 2 minutes (healthy)
agentpm-redis       Up 2 minutes (healthy)
agentpm-backend     Up 1 minute (healthy)
agentpm-gateway     Up 1 minute
```

backend 从启动到 `healthy` 要等 40 秒左右（要先跑数据库迁移）。如果一直 `starting`，看日志：

```bash
docker compose logs -f backend
```

正常日志里能看到这两行：

```
[entrypoint] 应用数据库迁移 (prisma migrate deploy)...
[entrypoint] 启动服务 (node dist/main)...
```

---

## 第六步：验证

在服务器上直接测。

```bash
# 后端健康检查，应返回 JSON
curl http://127.0.0.1:8080/admin/open/health

# 管理后台首页，应返回 HTML
curl -I http://127.0.0.1:8080

# 移动端 H5
curl -I http://127.0.0.1:8081
```

两个前端的端口：

| 端口 | 前端 | 说明 |
|------|------|------|
| 8080 | admin | 管理后台 |
| 8081 | mobile | 移动端 H5 |

**注意这两个端口默认只绑本机回环**（`docker-compose.yaml` 里写的是 `127.0.0.1:8080:8080`），从外网访问不到。这是故意的——设计上假定前面有一层反向代理。下一步解决。

---

## 第七步：让外网能访问

三种做法，按你的情况选一种。

### 做法 A：装 Nginx 做反向代理（推荐，能上 HTTPS）

服务器上装 Nginx（不是容器，是宿主机的）：

```bash
# Ubuntu/Debian
apt update && apt install -y nginx

# CentOS/RHEL
yum install -y nginx
```

建配置文件 `/etc/nginx/conf.d/exam.conf`：

```nginx
# 管理后台
server {
    listen 80;
    server_name admin.你的域名.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # 上传大文件（题库 Excel 导入）用，不设会 413
        client_max_body_size 50m;
    }
}

# 移动端 H5
server {
    listen 80;
    server_name m.你的域名.com;

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50m;
    }
}
```

测试配置并重载：

```bash
nginx -t && systemctl reload nginx
```

上 HTTPS（免费证书）：

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d admin.你的域名.com -d m.你的域名.com
```

certbot 会自动改好 Nginx 配置并配置自动续期。

### 做法 B：没有域名，直接用 IP 访问

改 `docker-compose.yaml`，把 gateway 的端口绑定从回环改成全网卡：

```yaml
  gateway:
    ports:
      - "8080:8080"   # 去掉 127.0.0.1: 前缀
      - "8081:8081"
```

改完重启 gateway：

```bash
docker compose up -d gateway
```

然后浏览器访问 `http://服务器IP:8080`。

同时要在云服务商的安全组里放行 8080、8081 端口，否则还是访问不到。

> 这种方式没有 HTTPS，登录密码是明文传输的，只适合内网或临时测试。对外正式使用请走做法 A。

---

## 第八步：首次登录

访问管理后台，用初始账号登录：

- 账号：`admin`
- 密码：`123456`

**登录后立刻改密码。**

---

## 以后怎么更新版本

本地重新打包上传，服务器上重新构建。数据不会丢——MySQL 和 Redis 的数据存在 Docker volume 里，重建容器不影响。

```bash
# 本地：重新打包（同第一步，排除项必须一致）
cd /Users/fangjinbao/Desktop/Micon/micon-ai/exam
tar --exclude='node_modules' --exclude='dist' --exclude='.git' \
    --exclude='docs' --exclude='.claude' --exclude='CLAUDE.md' --exclude='.plan-*.md' \
    --exclude='server/docker/data' --exclude='server/uploads' --exclude='output' \
    --exclude='*.log' --exclude='.env' --exclude='.DS_Store' \
    -czf ../exam-deploy.tar.gz .

# 本地：上传
scp ../exam-deploy.tar.gz root@你的服务器IP:/opt/
```

```bash
# 服务器：解压覆盖 + 重新构建
cd /opt/exam
tar -xzf /opt/exam-deploy.tar.gz -C /opt/exam
docker compose up -d --build

# 看状态
docker compose ps
```

解压时 `.env` 不会被覆盖（打包时已排除），所以密码配置会保留。

**加了字段/改了表结构也是这套流程**，`prisma migrate deploy` 会在后端容器启动时自动应用新迁移，你不用做额外操作。

---

## 常用命令

```bash
cd /opt/exam

# 看所有容器状态
docker compose ps

# 看后端日志（实时）
docker compose logs -f backend

# 看最近 100 行日志
docker compose logs --tail=100 backend

# 重启某个服务
docker compose restart backend

# 停止全部（数据保留）
docker compose stop

# 启动全部
docker compose start

# 彻底删除容器（数据仍保留在 volume）
docker compose down

# 进后端容器排查
docker compose exec backend sh

# 连数据库
docker compose exec mysql mysql -uroot -p
```

---

## 排错

### 构建时报 `ENOSPC` 或磁盘满

Docker 构建缓存占满了。清一下：

```bash
docker builder prune -f
docker image prune -f
df -h
```

### 构建前端时容器被 kill（OOM）

内存不够。看「低配服务器怎么办」。

### backend 一直 unhealthy

先看日志定位：

```bash
docker compose logs --tail=50 backend
```

常见原因：

| 日志关键字 | 原因 | 解决 |
|-----------|------|------|
| `Can't reach database server` | MySQL 没起来或密码不对 | 检查 `.env` 里 `MYSQL_PASSWORD`，然后 `docker compose restart backend` |
| `WRONGPASS` / `NOAUTH` | Redis 密码不对 | 检查 `.env` 里 `REDIS_PASSWORD` 不为空 |
| `migrate found failed migration` | 上次迁移中断 | 见下一条 |

### 迁移失败卡住

进容器看迁移状态：

```bash
docker compose exec backend ./node_modules/.bin/prisma migrate status
```

如果显示某个迁移 failed，且你确认可以重来（**会丢数据，仅首次部署时用**）：

```bash
docker compose down
docker volume rm exam_mysql_data
docker compose up -d --build
```

### 前端页面能开但接口 502

后端没就绪。gateway 依赖 backend 健康后才启动，正常不会出现。检查：

```bash
docker compose ps
curl http://127.0.0.1:8080/admin/open/health
```

### 改了 `.env` 但没生效

环境变量在容器创建时注入，改完要重建容器（不是 restart）：

```bash
docker compose up -d --force-recreate backend
```

---

## 低配服务器怎么办

2G 内存的机器构建前端会 OOM。三个办法：

**办法一：加临时 swap（最简单）**

```bash
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
free -h
```

构建完可以关掉：`swapoff /swapfile && rm /swapfile`

**办法二：本地构建镜像后传镜像包**

本地有 Docker 的话，在本地构建好镜像再传，服务器完全不用构建：

```bash
# 本地
docker compose build
docker save ghcr.io/fangjinbao/agentpm-server:latest \
            ghcr.io/fangjinbao/agentpm-gateway:latest \
  | gzip > exam-images.tar.gz
scp exam-images.tar.gz root@服务器IP:/opt/

# 服务器
cd /opt/exam
docker load < /opt/exam-images.tar.gz
docker compose up -d   # 注意：不加 --build
```

**办法三：给 Node 限堆上限**

前端是逐个串行构建的（见 `docker/build-frontends.mjs`），内存峰值来自单个 vite 进程。给它限一下堆上限往往就能过，但要改 `docker/gateway.Dockerfile`，在构建阶段那行 `RUN node docker/build-frontends.mjs` **之前**插一行：

```dockerfile
ENV NODE_OPTIONS=--max-old-space-size=1536
```

改完重新 `docker compose up -d --build`。

> 别用 `docker compose build --build-arg NODE_OPTIONS=...` —— 两个 Dockerfile 都没有声明 `ARG NODE_OPTIONS`，传进去会被 Docker 直接忽略，白折腾。

三个办法里**办法一的 swap 最省事**，优先用它。

---

## 数据备份

数据在 Docker volume 里，删容器不影响，但**删 volume 会丢**。定期备份：

```bash
# 备份数据库
docker compose exec -T mysql mysqldump -uroot -p"$(grep MYSQL_ROOT_PASSWORD /opt/exam/.env | cut -d= -f2)" \
  --single-transaction --default-character-set=utf8mb4 agentpm \
  | gzip > /opt/backup-$(date +%F).sql.gz

# 备份上传的文件
docker run --rm -v exam_backend_uploads:/data -v /opt:/backup alpine \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

恢复数据库：

```bash
gunzip < /opt/backup-2026-09-09.sql.gz | \
  docker compose exec -T mysql mysql -uroot -p"密码" --default-character-set=utf8mb4 agentpm
```
