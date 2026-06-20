---
updated: 2026-05-22
version: 2.0
scope: global
description: 安全编码规范，包含强制安全检查、密钥管理、XSS/CSRF/SQL注入防护、CSP、安全响应头
---
# 安全规范

## 提交前强制检查

每次提交前必须确认：
- [ ] 无硬编码密钥（API Key、密码、Token）
- [ ] 所有用户输入已验证
- [ ] SQL 注入防护（参数化查询）
- [ ] XSS 防护（净化 HTML）
- [ ] CSRF 保护已启用
- [ ] 认证/授权已验证
- [ ] 所有端点启用限流
- [ ] 错误消息不泄露敏感数据

## 密钥管理

- 永远不要在源代码中硬编码密钥
- 始终使用环境变量或密钥管理器
- 启动时验证所需密钥是否存在
- 轮换任何可能已暴露的密钥

```typescript
// 错误
const apiKey = "sk-proj-xxxxx"

// 正确
const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) {
  throw new Error('OPENAI_API_KEY 未配置')
}
```

## XSS 防护

- 永远不要注入未净化的 HTML
- 避免使用 `innerHTML` / `dangerouslySetInnerHTML`，除非先净化
- 转义动态模板值
- 必须使用 HTML 时，用经过验证的净化库处理

## SQL 注入防护

始终使用参数化查询，禁止字符串拼接 SQL：

```typescript
// 错误
const query = `SELECT * FROM users WHERE id = ${userId}`

// 正确（TypeORM）
const user = await repo.findOne({ where: { id: userId } })
```

## HTTP 安全响应头

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

## Content Security Policy（CSP）

生产环境必须配置 CSP，推荐 nonce-based 方案：

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{random}';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.example.com;
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
```

CDN 引入的脚本必须加 SRI（Subresource Integrity）：
```html
<script src="https://cdn.example.com/lib.js"
  integrity="sha384-xxxxx"
  crossorigin="anonymous"></script>
```

## 前端安全检查清单

- [ ] 无 `v-html` 直接渲染用户输入（必须先 DOMPurify 净化）
- [ ] 权限按钮用 `v-if` 不渲染（不是 `disabled`）
- [ ] 无在 localStorage/sessionStorage 存储完整 token 或密码
- [ ] 表单提交有基本校验（必填、格式、长度限制）
- [ ] 无将用户输入拼接到 URL 的写法
- [ ] 敏感操作有二次确认（删除、支付、权限变更）

## 后端安全检查清单

- [ ] 所有公开端点有限流（rate limiting）
- [ ] 认证 token 有过期时间且支持刷新
- [ ] 密码用 bcrypt/argon2 哈希存储
- [ ] 日志不记录密码、token、完整身份证号等敏感信息
- [ ] 错误响应不暴露内部堆栈或数据库结构
- [ ] 文件上传有类型和大小限制

## 发现安全问题时

1. 立即停止当前工作
2. 修复关键问题后再继续
3. 轮换任何已暴露的密钥
4. 检查整个代码库中的类似问题
