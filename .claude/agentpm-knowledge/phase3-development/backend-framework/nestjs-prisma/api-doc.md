---
updated: 2026-06-20
version: 1.0
scope: phase3-development/backend-framework
description: Swagger 接口文档标注规范——@ApiOperation/DTO/@ApiParam/@ApiQuery/响应装饰器/VO 脱敏
---
# 接口文档标注规范（Swagger）

> 接口本身设计见 backend.md。框架启用 `@nestjs/swagger` plugin，DTO 字段的类型/必填能自动推断，但**中文描述、接口摘要、查询/路径参数、响应结构必须手写**。不标不报错，但 `/docs` 一片空白——最容易"漏了还不知道"。以下规则强制。

## 规则一：每个接口必须有 `@ApiOperation`

```typescript
@Post('add')
@ApiOperation({ summary: '新增用户' })
async add(@Body() dto: AddUserDto) { ... }
```

- 继承 `CrudControllerBase` 的自动 CRUD 路由**已在基类统一标注**，子类无需重复。
- 自定义方法（含覆盖了 CRUD 默认实现的方法）**必须自己加**。

## 规则二：入参必须用 DTO 类，禁止内联字面量 / any / Record

```typescript
// ❌ 文档里看不到任何字段
async add(@Body() body: { name: string; items: any[] }) {}
async save(@Body() body: Record<string, any>) {}

// ✅ 定义 DTO 类，字段自带说明
async add(@Body() dto: CreateChecklistDto) {}
```

DTO 每个字段：`@ApiProperty` 写中文描述 + `class-validator` 装饰器做校验，二者并存：

```typescript
export class CreateChecklistDto {
  @ApiProperty({ description: '清单名称' })
  @IsString()
  @MaxLength(50)
  name: string;

  @ApiProperty({ description: '设备分类 ID', required: false })  // 可选字段标 required: false
  @IsOptional()
  @IsInt()
  deviceCategoryId?: number;

  @ApiProperty({ description: '检查项列表', type: [ChecklistItemDto] })  // 数组/嵌套必须标 type
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)         // 缺这行嵌套校验失效，必加
  items: ChecklistItemDto[];
}
```

## 规则三：查询参数 `@Query`、路径参数 `@Param` 要补说明

```typescript
// 路径参数：每个 @Param 配一个 @ApiParam
@Get('detail/:id')
@ApiParam({ name: 'id', description: '记录 ID', type: Number })
async detail(@Param('id', ParseIntPipe) id: number) {}

// 查询参数（写法A 推荐）：query 收进 DTO，字段用 @ApiProperty 描述
async list(@Query() query: ChecklistQueryDto) {}
// 写法B：散字段用 @ApiQuery 逐个标
@ApiQuery({ name: 'keyword', required: false, description: '关键字（模糊匹配）' })
async list(@Query() query: SomeQueryDto) {}
```

> 继承 `CrudControllerBase` 的自动 list 已在基类标了通用 `@ApiQuery`；自己写 list 方法（继承 `BaseController`）的 controller 必须自己补。

## 规则四：DTO 字段与 ValidationPipe 配合

全局 `ValidationPipe` 为 `whitelist: true, forbidNonWhitelisted: true`：

- DTO 没声明的字段会被直接拒（400）。DTO 字段集必须覆盖前端会传且 service 会用的全部字段。
- query 参数来自 URL 是 `string`，DTO 里声明 `string`（controller 内再 `Number()`），不要声明 `number`。
- 枚举字段（status 0/1/2）加 `@IsIn([...])`，否则非法值 `Number()` 后变 `NaN`。

## 规则五：业务校验与 DTO 校验分工

DTO 只管类型 / 非空 / 格式 / 长度等静态校验。业务校验（状态机、唯一性、跨字段依赖、纯空格拦截）写在 controller/service：

```typescript
async add(@Body() dto: CreateAnnouncementDto) {
  if (!dto.title.trim()) return this.fail('公告标题不能为空');  // DTO 做不了的纯空格拦截
  ...
}
```

## 规则六：响应结构必须标注

统一外壳 `{code, data, message}`，用响应装饰器（从 `@/common/decorators` 导出）表达 data 类型：

| 装饰器 | data 形态 | 用于 |
|--------|----------|------|
| `@ApiResult(Vo)` | 单个对象 | 详情、新增、返回单实体 |
| `@ApiArrayResult(Vo)` | 对象数组 | 列表、树 |
| `@ApiPageResult(Vo)` | 分页 `{list:[Vo], pagination}` | 分页查询 |
| `@ApiOkVoid()` | null | 无返回体的写操作（删除、启停） |

```typescript
@Get('detail/:id')
@ApiResult(UserVo)                       // data 精确到 UserVo 字段
async detail(...) { return this.ok(...); }
```

### 响应 VO 与脱敏（安全红线）

- 每个实体一个 `XxxVo`（放 `modules/xxx/vo/xxx.vo.ts`），字段抄 Prisma model + 中文 `@ApiProperty`。
- **敏感字段（password、passwordV、socketId、密钥等）绝不进 VO**。
- ⚠️ **VO 只是文档，不过滤运行时数据**：标了 `@ApiResult(UserVo)` 不代表响应真的不含 password。必须在 service/controller 用 Prisma `select` 白名单或解构排除敏感字段，让运行时返回与 VO 声明一致——否则就是"文档说没有、实际泄露"。

## 落地自检清单

| 检查项 | 方法 |
|--------|------|
| 自定义方法都有 `@ApiOperation` | `grep -c "@ApiOperation"` 对比方法数 |
| 无内联 `{}`/`any`/`Record` 入参 | `grep "@Body() .*: {\|: any\|: Record"` 应为空 |
| 每个 `@Param` 配 `@ApiParam` | 两者计数相等 |
| 每个方法都有响应装饰器 | 抓 `/docs-json` 确认无接口 200 响应为空 |
| 响应 VO 不含敏感字段，且运行时真的不返回 | 实际调接口看返回，不能只看 VO |
| 启动后访问 `/docs` 实际看一眼 | 字段、参数、摘要、响应都不为空 |
