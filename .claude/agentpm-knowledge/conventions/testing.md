---
updated: 2026-05-22
version: 3.0
scope: global
description: 测试规范，包含 TDD 工作流、测试类型、AAA 模式、Mock 规范、反模式、覆盖率要求
---
# 测试规范

## 最低覆盖率：80%

三种测试类型全部必需：
1. **单元测试** — 单个函数、工具函数、组件（Jest/Vitest）
2. **集成测试** — API 端点、数据库操作（supertest）
3. **E2E 测试** — 关键用户流程（Playwright）

## TDD 工作流（强制）

```
1. 先写测试（RED）    → 运行，应该失败
2. 写最小实现（GREEN）→ 运行，应该通过
3. 重构（IMPROVE）   → 运行，仍然通过
4. 验证覆盖率 ≥ 80%
```

## 必须覆盖的边界场景

每个功能点必须测试：
1. **null/undefined** 输入
2. **空数组/空字符串**
3. **非法类型**输入
4. **边界值**（最大值、最小值）
5. **错误路径**（网络失败、数据库错误）
6. **并发场景**（重复提交、并发操作）
7. **特殊字符**（Unicode、SQL 特殊字符）

## AAA 测试结构

```typescript
test('用户名重复时返回错误', async () => {
  // Arrange（准备）
  await createUser({ name: '张三' })

  // Act（执行）
  const res = await request(app).post('/api/users').send({ name: '张三' })

  // Assert（断言）
  expect(res.status).toBe(400)
  expect(res.body.message).toContain('已存在')
})
```

## 测试命名规范

用描述行为的名称，不描述实现：

```typescript
// 好
test('查询无匹配时返回空数组', () => {})
test('Token 过期时返回 401', () => {})
test('Redis 不可用时降级为数据库查询', () => {})

// 差
test('测试 getUsers 函数', () => {})
test('正常情况', () => {})
```

## 单元测试（Jest/Vitest）

```typescript
describe('UserService', () => {
  it('创建用户成功', async () => {
    const mockRepo = { create: jest.fn().mockResolvedValue({ id: 1, name: '张三' }) }
    const service = new UserService(mockRepo as any)

    const result = await service.createUser({ name: '张三' })

    expect(result.id).toBe(1)
    expect(mockRepo.create).toHaveBeenCalledWith({ name: '张三' })
  })

  it('用户名为空时抛出错误', async () => {
    const service = new UserService({} as any)
    await expect(service.createUser({ name: '' })).rejects.toThrow('用户名不能为空')
  })
})
```

## 集成测试（API 端点）

```typescript
describe('POST /api/users', () => {
  it('创建用户成功返回 201', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '张三', phone: '13800138000' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.id).toBeDefined()
  })

  it('未登录返回 401', async () => {
    const res = await request(app).post('/api/users').send({ name: '张三' })
    expect(res.status).toBe(401)
  })

  it('参数校验失败返回 400', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '' })  // 空名称

    expect(res.status).toBe(400)
  })
})
```

## E2E 测试（Playwright）

```typescript
test('用户可以创建并查看记录', async ({ page }) => {
  await page.goto('/users')

  // 点击新增
  await page.click('button:has-text("新增")')
  await expect(page.locator('.modal')).toBeVisible()

  // 填写表单
  await page.fill('input[name="name"]', '张三')
  await page.fill('input[name="phone"]', '13800138000')
  await page.click('button[type="submit"]')

  // 验证结果
  await expect(page.locator('text=新增成功')).toBeVisible()
  await expect(page.locator('table')).toContainText('张三')
})
```

## Mock 规范

```typescript
// Mock 外部服务，不 Mock 内部逻辑
jest.mock('@/utils/redis', () => ({
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
}))

// 每个测试前重置 Mock
beforeEach(() => {
  jest.clearAllMocks()
})
```

## 测试反模式（禁止）

```typescript
// 禁止：测试实现细节（内部状态）
expect(service._cache.size).toBe(1)  // 错误

// 正确：测试行为
expect(await service.getUser(1)).toEqual({ id: 1, name: '张三' })  // 正确

// 禁止：测试间共享可变状态
let sharedUser: User  // 错误，测试间互相影响

// 禁止：空断言
test('创建用户', async () => {
  await service.createUser({ name: '张三' })
  // 没有 expect，测试永远通过
})
```

### 高级反模式（来自实际踩坑）

| 反模式 | 为什么有害 | 正确做法 |
|--------|-----------|---------|
| Mock 了真实行为而非外部依赖 | 测试通过但生产崩溃 | 只 Mock 系统边界（网络、数据库、文件系统） |
| 为测试添加生产代码方法 | 污染 API 表面 | 通过公共接口测试 |
| Mock 不完整（缺少下游需要的字段） | 隐藏集成问题 | Mock 返回完整结构 |
| 测试依赖执行顺序 | 并行运行时随机失败 | 每个测试独立 setup/teardown |
| 在测试中写复杂逻辑 | 测试本身可能有 bug | 测试应该是直白的断言 |

### TDD 铁律

**没有失败的测试，就不写生产代码。**

如果发现自己先写了实现再补测试：
1. 删除刚写的实现代码
2. 先写测试，确认它失败
3. 再写实现让测试通过

这不是教条，而是防止"测试只是走过场"的唯一可靠方法。

## 覆盖率配置

```json
{
  "coverageThresholds": {
    "global": {
      "branches": 80,
      "functions": 80,
      "lines": 80,
      "statements": 80
    }
  }
}
```

## 测试完成检查清单

- [ ] 所有新功能有对应测试
- [ ] 覆盖率 ≥ 80%
- [ ] 边界值和异常场景已覆盖
- [ ] 权限控制已验证
- [ ] 外部依赖已 Mock
- [ ] 测试间无共享状态
- [ ] CI 流水线全部通过
