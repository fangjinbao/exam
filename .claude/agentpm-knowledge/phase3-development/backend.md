---
updated: 2026-06-20
version: 3.0
scope: phase3-development
description: 后端接口设计规范（框架无关）——路由风格、HTTP语义、统一响应、业务码、错误处理、鉴权、入参安全原则。具体实现见 backend-framework/{框架}/
---
# 后端接口设计规范（框架无关）

> 本规范是 lld-design（详细设计·API 详细设计）与各框架 backend-generator 的共享设计原则，**不绑定具体框架**。
> 具体语法落地见对应框架：
> - NestJS+Prisma → `backend-framework/nestjs-prisma/`（module-development.md / api-doc.md）
> - 其他框架 → `backend-framework/{框架}/`（无预置时由 backend-spec-loader 从项目代码推断）

## 一、路由前缀（按鉴权体系分层）

| 前缀 | 鉴权体系 | 谁用 |
|------|---------|------|
| `/admin/*` | 后台用户鉴权 | 管理后台、内部员工端 |
| `/app/*` | C 端用户鉴权 | 外部 C 端用户 |

- 前缀代表**鉴权体系**，不代表设备。同类用户的不同设备共用接口。
- 完整路径：`/{tier}/{module}/{资源}/{动作}`，如 `/admin/dict/type/list`。
- 具体前缀以项目约定为准（有的项目用 `/api/*`）。

## 二、路径风格

- 全小写，多词用连字符 `kebab-case`。
- 资源名用单数，动作跟在资源后（`.../add`、`.../detail/:id`），不要动词开头（`/getList`）。
- 路径参数只用于资源主键；其余条件走 query 或 body。
- 按「模块/资源/动作」分段，不堆叠深层级。

## 三、HTTP 方法语义

| 方法 | 用途 | 参数位置 |
|------|------|---------|
| `GET` | 查询（列表、详情），无副作用 | query / path |
| `POST` | 新增、批量操作、动作类（登录、测试连接） | body |
| `PUT` | 更新（整体或部分） | body（含 id） |
| `DELETE` | 单条删除 | path |

- 查询一律 `GET`，禁止用 `POST` 查列表。
- 单条删除用 `DELETE /delete/:id`；批量删除需传数组用 `POST /batch-delete`。

## 四、CRUD 标准动作

后端框架通常提供 CRUD 基类/脚手架，统一以下标准动作（方法名/路径固定，不自创风格）：

| 动作 | 方法 | 说明 |
|------|------|------|
| list | GET | 列表/分页（page/pageSize/keyword + 筛选） |
| detail | GET `/detail/:id` | 详情 |
| add | POST `/add` | 新增 |
| update | PUT `/update` | 更新（含 id） |
| update-status | PUT `/update-status` | 改状态 |
| delete | DELETE `/delete/:id` | 单删 |
| batch-delete | POST `/batch-delete` | 批量删除 |

> 具体由哪个基类/装饰器提供见框架篇。自定义接口沿用同风格（动作名结尾）。

## 五、统一响应格式

所有接口返回统一外壳：

```json
{ "code": 200, "data": {}, "message": "success" }
```

- 成功返回 data，失败返回错误信息，结构一致（由框架的统一响应封装/拦截器实现，不手写裸对象）。
- 分页返回结构固定：`{ list: [], pagination: { page, pageSize, total } }`。

## 六、状态码 / 业务码

业务码（响应体 `code`）与 HTTP 状态码对齐：

| code | 含义 |
|------|------|
| 200 | 成功 |
| 400 | 业务错误 / 参数校验失败 |
| 401 | 未登录 / 登录失效 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

- 业务可预期失败用 400 + 可展示的中文 message。
- 鉴权/权限失败由守卫/拦截器统一抛出，不在业务代码手写 401/403。

## 七、错误处理

- 业务校验失败返回统一失败响应，不滥抛异常。
- 框架级错误由全局异常处理器捕获转统一格式。
- message 面向前端展示，写明确中文，不透传堆栈/SQL 细节。

## 八、分层架构

- **数据访问层**：ORM/Repository，不写裸 SQL 拼接（参数化）。
- **服务层**：业务逻辑、校验、事务。
- **控制器层**：路由、入参校验、调用服务、统一响应。
- 控制器按鉴权体系分层（admin/app）；服务层不分端。

## 九、鉴权与权限点

- 接口默认需登录 + 权限点；免登录接口显式标记（公开装饰器/白名单）。
- 权限点可由 URL 推导（如 `/admin/dict/type` → `dict:type`）。
- 超管放行所有权限点。

## 十、入参与安全

- 外部输入（body/param/query）必须经 DTO/校验器校验，禁止内联匿名结构 / any。
- 敏感字段（password 等）**绝不**在响应中返回：响应模型不含 + 数据层用 select 白名单或解构排除（运行时真的不返回，不能只靠文档声明）。
- 启用严格校验（拒绝未声明字段）时，DTO 字段集要覆盖前端会传且服务会用的全部字段。

## 十一、日志

- 禁止 `console.log`，用框架 Logger。
- 日志不记录密码/Token 等敏感信息。

## 后端接口检查清单

- [ ] 路径 kebab-case、动作结尾，带鉴权前缀
- [ ] 查询 GET、改 PUT、删 DELETE，CRUD 沿用标准动作
- [ ] 响应统一外壳，分页返回 `{list, pagination}`
- [ ] 业务码对齐 HTTP 码，业务失败不滥抛异常
- [ ] 入参用 DTO/校验器，无内联匿名结构/any
- [ ] 新增接口已标鉴权（免登录显式标记）
- [ ] 敏感字段不进响应，数据层真的排除
- [ ] 无 console.log、无裸 SQL 拼接
