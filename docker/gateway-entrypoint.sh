#!/bin/sh
# 网关启动期脚本（由 nginx 官方镜像的 /docker-entrypoint.d/ 机制自动执行，先于 nginx 启动）。
# 读 frontends.json，对每个前端从环境变量取域名（约定：NAME 大写 + _DOMAIN，如 admin → ADMIN_DOMAIN），
# 用 nginx-server.conf.tpl 渲染出 /etc/nginx/conf.d/<name>.conf。
# 新增前端：frontends.json 加一行 + .env 加 <NAME>_DOMAIN，本脚本自动生成 server 块，无需改 nginx 配置。
set -eu

MANIFEST=/etc/nginx/frontends.json
TEMPLATE=/etc/nginx/nginx-server.conf.tpl
CONF_D=/etc/nginx/conf.d

# 清掉基础镜像自带的 default.conf 及历史渲染，避免残留
rm -f "$CONF_D"/*.conf 2>/dev/null || true

count=$(jq 'length' "$MANIFEST")
i=0
rendered=0
while [ "$i" -lt "$count" ]; do
  name=$(jq -r ".[$i].name" "$MANIFEST")
  api_prefix=$(jq -r ".[$i].apiPrefix" "$MANIFEST")
  env_name=$(echo "$name" | tr '[:lower:]' '[:upper:]')_DOMAIN
  domain=$(printenv "$env_name" 2>/dev/null || true)

  if [ -z "$domain" ]; then
    echo "[gateway] 警告：前端 '$name' 未配置域名环境变量 $env_name，跳过（该前端将无法访问）"
    i=$((i + 1))
    continue
  fi

  sed -e "s|__SERVER_NAME__|${domain}|g" \
      -e "s|__NAME__|${name}|g" \
      -e "s|__API_PREFIX__|${api_prefix}|g" \
      "$TEMPLATE" > "$CONF_D/$name.conf"
  echo "[gateway] 渲染 $name → server_name=$domain  api=$api_prefix"
  rendered=$((rendered + 1))
  i=$((i + 1))
done

if [ "$rendered" -eq 0 ]; then
  echo "[gateway] 错误：没有任何前端被渲染，请检查 .env 中的 *_DOMAIN 配置" >&2
  exit 1
fi
echo "[gateway] 共渲染 $rendered 个前端 server 块"
