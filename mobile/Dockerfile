# 构建阶段：在容器内 vite 构建出静态产物
FROM node:20-alpine AS builder

WORKDIR /app

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 先装依赖（mobile 无 lock 文件，用 npm install 容错安装；lock 存在时星号自动匹配）
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# 再拷源码构建（vite build 默认 production 模式）
COPY . .
RUN npx vite build

# 运行阶段：nginx 托管静态产物 + 反代后端
FROM nginx:1.25-alpine

RUN apk add --no-cache tzdata
ENV TZ="Asia/Shanghai"

# nginx 配置（反代后端，前缀见 nginx.conf 内说明）
COPY nginx.conf /etc/nginx/nginx.conf
# 构建产物
COPY --from=builder /app/dist /usr/share/nginx/html/web

EXPOSE 80
