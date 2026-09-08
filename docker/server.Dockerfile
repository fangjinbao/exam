# 后端镜像。构建上下文为仓库根目录（compose/CI 均以 . 为 context），故源码路径带 server/ 前缀。

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# apk 源按可达性自动回落：阿里云 → 清华 → 中科大 → 官方 CDN。
# 不写死单一镜像，因为部分服务器出站策略只放通其中某几个（写死阿里云时
# 遇到过 Connection refused 直接构建失败）。全部不通才报错退出。
COPY docker/pick-apk-mirror.sh /tmp/pick-apk-mirror.sh
RUN sh /tmp/pick-apk-mirror.sh && rm -f /tmp/pick-apk-mirror.sh

# 固定 pnpm 10：pnpm 11.6+ 要求 Node ≥22.13（依赖 node:sqlite），与基础镜像 node:20 不兼容
RUN npm install -g pnpm@10

COPY server/package.json server/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY server/prisma ./prisma
RUN pnpm prisma generate

COPY server/ ./
RUN pnpm build

# CI=true 避免 pnpm 在非 TTY 环境下因确认提示中止 modules 目录清理
RUN CI=true pnpm prune --prod

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY docker/pick-apk-mirror.sh /tmp/pick-apk-mirror.sh
RUN sh /tmp/pick-apk-mirror.sh && apk add --no-cache tzdata && rm -f /tmp/pick-apk-mirror.sh
ENV TZ="Asia/Shanghai"

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

# 启动入口：应用进程启动前先跑 prisma migrate deploy（确保表结构先于应用就绪）
COPY docker/entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# 应用启动时会在工作目录创建 uploads 目录，预建并授权给非 root 运行用户
RUN mkdir -p /app/uploads && chown -R appuser:appgroup /app/uploads

USER appuser

EXPOSE 9001

ENTRYPOINT ["./docker-entrypoint.sh"]
