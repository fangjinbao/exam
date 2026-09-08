# 单前端 server 块模板。占位符由 gateway-entrypoint.sh 替换：
#   __PORT__         该前端在网关内监听的端口（来自 frontends.json，如 8080、8081）
#   __NAME__         前端名（= 静态产物目录 /usr/share/nginx/html/<name>）
#   __API_PREFIX__   反代到后端的路径前缀（来自 frontends.json，如 /admin、/app）
#                    注意：不做 rewrite，后端无全局前缀、路由自带该前缀
# 按端口分流：每个前端独占一个端口，不依赖域名。宝塔各子域名反代到对应端口即可。
server {
    listen __PORT__ default_server;
    server_name _;

    # 前端静态文件（构建产物已 COPY 进镜像）
    location / {
        root /usr/share/nginx/html/__NAME__;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 上传文件（富文本插图等）反代到后端的静态目录
    #
    # 必须单独开一段：/uploads/ 不在 __API_PREFIX__ 之下（那是 /admin、/app），
    # 否则会被上面的 location / 命中，去前端静态目录找不到文件后
    # try_files 回落 index.html，浏览器把 HTML 当图片渲染 → 题干里全是破图。
    # 本地 dev 直连后端 9001 不会暴露这个问题，只在容器部署后出现。
    location /uploads/ {
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # 故意不加尾斜杠：proxy_pass 的值不带 URI 时原始请求路径原样转发，
        # /uploads/x.png 到后端仍是 /uploads/x.png，与 useStaticAssets 的 prefix 对得上。
        # 写成 http://backend:9001/ 会把 location 前缀裁掉、变成 /x.png 而 404。
        proxy_pass http://backend:9001;

        # 题库图片内容不变，可长期缓存；文件名是 UUID，换图即换名不必担心失效。
        # 只用 add_header 单一来源设置：expires 指令本身也会生成 Cache-Control,
        # 两者并存会让响应里出现两条同名头，最终值依赖客户端的隐式合并行为。
        add_header Cache-Control "public, max-age=2592000, immutable" always;

        # 图片 URL 会出现在考生端 HTML 里，转发出去后可能被搜索引擎抓取，
        # 明确禁止收录以免扩大题目内容的暴露面
        add_header X-Robots-Tag "noindex, nofollow" always;

        # 纵深防御：静态文件只需读取。express.static 对非 GET/HEAD 本就不写操作，
        # 这里在网关层再挡一道
        limit_except GET HEAD {
            deny all;
        }
    }

    # 后端 API 代理（backend 为 compose 服务名，端口与后端实际监听一致：9001）
    location __API_PREFIX__ {
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        proxy_pass http://backend:9001;

        # WebSocket
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        limit_req zone=api_limit burst=50 nodelay;
    }

    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }
}
