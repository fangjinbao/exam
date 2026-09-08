#!/bin/sh
# 选一个可达的 Alpine apk 镜像源写入 /etc/apk/repositories。
#
# 为什么不写死单一镜像：不同服务器的出站策略不同，写死 mirrors.aliyun.com 时
# 在部分机器上会 Connection refused，导致 `apk add tzdata` 直接失败、构建中断。
# 这里逐个探测，第一个能取到 APKINDEX 的就用它。
#
# 注意：apk 的版本目录（v3.21 等）取自基础镜像自带的 /etc/apk/repositories，
# 不在本脚本里硬编码，避免基础镜像升级后版本号对不上。
set -eu

# 从现有配置里取出 Alpine 版本路径（形如 v3.21 或 edge）
VER="$(sed -n 's#^https\?://[^/]*/alpine/\([^/]*\)/main.*#\1#p' /etc/apk/repositories | head -1)"
[ -n "$VER" ] || VER="latest-stable"

echo "[pick-apk-mirror] Alpine 版本路径: $VER"

for HOST in \
  mirrors.aliyun.com \
  mirrors.tuna.tsinghua.edu.cn \
  mirrors.ustc.edu.cn \
  dl-cdn.alpinelinux.org
do
  URL="https://$HOST/alpine/$VER/main/x86_64/APKINDEX.tar.gz"
  # busybox wget：-T 超时秒数、-t 重试次数。不用 --spider（老版 busybox 不支持）
  if wget -q -T 8 -t 1 -O /dev/null "$URL" 2>/dev/null; then
    printf 'https://%s/alpine/%s/main\nhttps://%s/alpine/%s/community\n' \
      "$HOST" "$VER" "$HOST" "$VER" > /etc/apk/repositories
    echo "[pick-apk-mirror] 选用: $HOST"
    apk update >/dev/null 2>&1 || true
    exit 0
  fi
  echo "[pick-apk-mirror] 不可达，跳过: $HOST"
done

echo "[pick-apk-mirror] 错误：所有镜像源都不可达。" >&2
echo "  服务器可能没有公网出站，或防火墙拦截了 HTTPS(443)。" >&2
echo "  排查：在宿主机执行 curl -I https://dl-cdn.alpinelinux.org/alpine/" >&2
exit 1
