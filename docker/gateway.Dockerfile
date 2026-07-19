# 网关镜像：一次构建 frontends.json 里所有前端的静态产物，由单个 nginx 托管并按子域名分流。
# 构建上下文为仓库根目录（compose/CI 均以 . 为 context）。

# ---------- 构建阶段：循环构建所有前端 ----------
FROM node:20-alpine AS builder

WORKDIR /build

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 仅拷贝构建所需：各前端源码 + 清单 + 构建脚本（.dockerignore 已排除 node_modules/dist/server 数据等）
COPY . .

# 读清单逐个 vite build，产物输出到 /out/<name>
RUN node docker/build-frontends.mjs

# ---------- 运行阶段：nginx 托管 + 启动时渲染各前端 server 块 ----------
FROM nginx:1.25-alpine

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
RUN apk add --no-cache tzdata jq
ENV TZ="Asia/Shanghai"

# http 级公共配置
COPY docker/nginx.conf /etc/nginx/nginx.conf
# 单前端 server 块模板 + 清单（供启动脚本渲染用）
COPY docker/nginx-server.conf.tpl /etc/nginx/nginx-server.conf.tpl
COPY docker/frontends.json /etc/nginx/frontends.json
# 启动脚本：nginx 官方镜像会自动执行 /docker-entrypoint.d/ 下的 *.sh（先于 nginx 启动）
COPY docker/gateway-entrypoint.sh /docker-entrypoint.d/40-render-frontends.sh
RUN chmod +x /docker-entrypoint.d/40-render-frontends.sh

# 所有前端静态产物：/usr/share/nginx/html/<name>
COPY --from=builder /out /usr/share/nginx/html

EXPOSE 80
