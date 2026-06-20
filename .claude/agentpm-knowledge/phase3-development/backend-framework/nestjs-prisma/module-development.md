---
updated: 2026-06-20
version: 1.0
scope: phase3-development/backend-framework
description: NestJS 模块开发——Service/Controller/Module 标准写法、声明式 CRUD、自定义接口
---
# 模块开发（Service / Controller / Module）

> 以 `src/modules/dict/` 为黄金样本。接口设计规则见 backend.md，文档标注见 api-doc.md。

## 一、标准模块结构

```
src/modules/dict/
├── controllers/
│   └── admin/                      # 按鉴权体系分层（admin/app）
│       ├── dict-type.controller.ts
│       └── dict-info.controller.ts
├── services/                       # 不分端，admin/app 共用
│   ├── dict-type.service.ts
│   └── dict-info.service.ts
├── dto/
│   └── dict.dto.ts
├── vo/
│   └── dict.vo.ts
└── dict.module.ts
```

> 新模块一律按上面分层；代码生成器生成的代码已自动分层。

## 二、Service 写法

继承 `BaseService`，构造传入 Prisma model 名（camelCase）：

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { BaseService } from '@/common/crud';

/**
 * 字典类型服务
 */
@Injectable()
export class DictTypeService extends BaseService {
  constructor(protected prisma: PrismaService) {
    super(prisma, 'dictType');   // 第二个参数 = Prisma schema 里的 model 名
  }
}
```

`BaseService` 开箱提供 6 个方法：`page` / `list` / `info` / `add` / `update` / `delete`，无需自己实现。业务逻辑（校验、状态机、跨表操作）写在 service 自定义方法里。

## 三、Controller 写法

继承 `CrudControllerBase`，用 `@CrudController` 声明：

```typescript
import { ApiTags } from '@nestjs/swagger';
import { CrudController, CrudControllerBase } from '@/common/crud';
import { DictTypeService } from '../../services/dict-type.service';

@ApiTags('字典类型')
@CrudController({
  prefix: 'admin/dict/type',          // 路由前缀，必须带 admin/ 或 app/
  api: ['add', 'delete', 'update', 'info', 'page', 'list'],  // 启用哪些接口
  pageQueryOp: {
    keyWordLikeFields: ['name', 'key'],  // 模糊搜索字段（前端传 query keyword）
    fieldEq: ['typeId'],                 // 精确筛选字段
  },
})
export class DictTypeController extends CrudControllerBase {
  constructor(private readonly dictTypeService: DictTypeService) {
    super(dictTypeService);
  }
}
```

声明后自动生成 RESTful 接口（list/detail/add/update/update-status/delete/batch-delete，路由表见 backend.md 第四节），无需写方法体。

### 自定义接口

在 controller 加普通 NestJS 方法即可，与 CRUD 接口共存：

```typescript
@Post('data')
@Public()                                   // 免登录用此装饰器
@ApiOperation({ summary: '根据 key 批量获取字典项' })
@ApiResult(DictInfoVo)
async data(@Body() dto: GetDictByKeysDto) {
  return this.ok(await this.dictInfoService.getByKeys(dto.keys));
}
```

> 自定义方法**必须**自己加 `@ApiOperation` + 响应装饰器（基类 CRUD 方法已统一标注，无需重复）。

### data 精确到 VO

要让 list/detail 的 data 在文档中精确到实体 VO，继承 `CrudControllerFactory(XxxVo)` 工厂而非 `CrudControllerBase`。
⚠️ 覆盖基类方法时，基类方法上的装饰器**一个都不继承**，必须把 `@ApiOperation`/`@ApiQuery`/`@ApiParam`/响应装饰器全部重新抄一遍。

## 四、Module 写法

```typescript
import { Module } from '@nestjs/common';
import { DictTypeController } from './controllers/admin/dict-type.controller';
import { DictTypeService } from './services/dict-type.service';

@Module({
  controllers: [DictTypeController],
  providers: [DictTypeService],
  exports: [DictTypeService],   // 需被其他模块引用的 service 才 export
})
export class DictModule {}
```

模块**无需**在 `app.module.ts` 注册——`discoverModules()` 启动时自动扫描 `src/modules/*/*.module.ts` 收集。

## 五、硬性规则

- 单文件 ≤ 500 行，单函数 ≤ 80 行
- 禁止 `console.log`，用 NestJS `Logger`
- 禁止裸写 SQL 拼接，用 Prisma 参数化
- 外部输入必须经 DTO + class-validator 校验
- 跨层 import 用 `@/`，模块内用 `../`
- 新增接口默认需鉴权，免登录显式 `@Public()`
- 写完接口必须标 Swagger（见 api-doc.md），否则 `/docs` 空白
