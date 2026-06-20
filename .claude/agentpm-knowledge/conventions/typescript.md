---
updated: 2026-05-19
version: 1.0
scope: global
description: TypeScript/JavaScript 编码规范，包含类型定义、不可变性、错误处理、输入验证
---
# TypeScript 规范

## 类型定义

### 公共 API 必须有明确类型

```typescript
// 错误：导出函数没有类型
export function formatUser(user) {
  return `${user.firstName} ${user.lastName}`
}

// 正确：公共 API 有明确类型
interface User {
  firstName: string
  lastName: string
}

export function formatUser(user: User): string {
  return `${user.firstName} ${user.lastName}`
}
```

### interface vs type

- `interface`：用于可扩展的对象结构
- `type`：用于联合类型、交叉类型、工具类型
- 优先用字符串字面量联合类型代替 `enum`

```typescript
interface User {
  id: string
  email: string
}

type UserRole = 'admin' | 'member'
type UserWithRole = User & { role: UserRole }
```

### 禁止使用 any

```typescript
// 错误
function getErrorMessage(error: any) {
  return error.message
}

// 正确：用 unknown 强制安全收窄
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return '未知错误'
}
```

## 不可变性

使用展开运算符进行不可变更新，禁止直接修改对象：

```typescript
// 错误：直接修改
function updateUser(user: User, name: string): User {
  user.name = name  // 禁止！
  return user
}

// 正确：返回新对象
function updateUser(user: Readonly<User>, name: string): User {
  return { ...user, name }
}
```

## 错误处理

使用 async/await + try-catch，安全收窄 unknown 错误：

```typescript
async function loadUser(userId: string): Promise<User> {
  try {
    return await riskyOperation(userId)
  } catch (error: unknown) {
    logger.error('操作失败', error)
    throw new Error(error instanceof Error ? error.message : '未知错误')
  }
}
```

## 输入验证

使用 Zod 进行 schema 验证，从 schema 推断类型：

```typescript
import { z } from 'zod'

const userSchema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0).max(150)
})

type UserInput = z.infer<typeof userSchema>
const validated: UserInput = userSchema.parse(input)
```

## 命名规范

- 变量/函数：`camelCase`
- 布尔值：`is`、`has`、`should`、`can` 前缀
- 接口/类型/组件：`PascalCase`
- 常量：`UPPER_SNAKE_CASE`
- 自定义 Hook：`use` 前缀

## 禁止

- 生产代码中禁止 `console.log`，使用日志库
- 禁止魔法数字，使用命名常量
- 禁止深层嵌套（>4 层），用提前返回代替
- 函数超过 50 行必须拆分
