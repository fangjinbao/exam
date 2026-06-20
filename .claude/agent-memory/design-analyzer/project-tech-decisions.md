---
name: project-tech-decisions
description: 智慧厂区巡检平台技术栈、模块划分、数据存储选型、部署架构等核心设计决策
metadata:
  type: project
---

## 智慧厂区巡检平台 — 技术与设计决策表

**Why:** 从 SRS V1.4 + 实际代码 package.json + schema.prisma + docker-compose.yaml 交叉验证所得，供后续 design-writer 直接引用。

**How to apply:** LLD 时优先以此为基准，避免重复读取大文件。

| 决策项 | 选型 | 来源 |
|--------|------|------|
| PC 前端 | Vue 3 + TypeScript + Vite + Element Plus + Pinia + ECharts + vue-router | admin/package.json |
| 移动端 | Vue 3 + Vant 4 + Capacitor 8 + Pinia + axios + ECharts + mockjs | mobile/package.json |
| 后端框架 | NestJS 11 + Prisma 6 | server/package.json |
| 鉴权 | JWT + Passport（@nestjs/jwt + @nestjs/passport + passport-jwt） | server/package.json |
| 密码加密 | bcrypt 6 | server/package.json |
| 任务调度 | @nestjs/schedule 5 + cron | server/package.json |
| 文件上传 | multer 2 | server/package.json |
| API 文档 | @nestjs/swagger 11 | server/package.json |
| 缓存 | Redis 7（ioredis 5 + cache-manager-ioredis-yet） | server/package.json + docker-compose |
| 主数据库 | MySQL 8.0 | server/prisma/schema.prisma + docker-compose |
| 文件存储 | 服务端本地 /app/uploads（Docker volume backend_uploads，非 MinIO） | docker-compose.yaml |
| 部署形态 | Docker Compose 四容器（mysql + redis + backend + nginx） | docker-compose.yaml |
| WebSocket | 依赖 NestJS 平台内置（SRS 4.1 声明，代码未见独立 ws 模块，待确认） | SRS 4.1 |
| 数据权限 | RBAC + 角色数据范围（全部/本部门/本人），SysRoleDepartment 中间表 | schema.prisma |
| 软删除 | 未使用 deleted_at，通过 RecycleData 快照实现回收站 | schema.prisma |

## 已有后端模块（schema.prisma 中定义）

基础系统模块：SysUser、SysRole、SysMenu、SysDepartment、SysUserRole、SysRoleMenu、SysRoleDepartment、SysLog、SysPosition、SysParam

字典模块：DictType、DictInfo

任务调度模块：TaskInfo、TaskLog

文件模块：SpaceInfo、SpaceType

插件模块：PluginInfo

回收站：RecycleData

**业务模块（巡检平台专有）尚未在 schema.prisma 中定义，需在 LLD 阶段新建。**
