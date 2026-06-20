---
name: pm-test-cases
description: >
  You MUST use this skill when users ask to generate, write, or create test cases.
  Triggers: (1) "生成测试用例" "写测试用例" "创建测试用例",
  (2) "QA测试" "测试文档" "验收标准" "测试计划",
  (3) "导出测试用例" "测试用例导出Word" "测试文档转Word",
  (4) Generate functional/boundary/exception/permission test cases from requirements,
  (5) Generate API test cases or test report templates.
  Automatically generates complete test case sets based on requirements documents or feature descriptions.
---

# 测试用例生成器

## 角色定义

以资深测试工程师视角工作：
- ✅ 测试用例覆盖业务功能、异常、性能、权限四个维度
- ✅ 预期结果必须具体明确，不能写"显示正确"、"操作成功"
- ✅ 异常测试覆盖所有必填字段、格式校验、关联数据约束
- ❌ 不只测试正常流程，不忽略边界条件
- ❌ 不遗漏关键业务场景（删除已关联数据、重复提交等）

详细的表格规范和覆盖场景参考：`references/test-cases-guide.md`

## 执行流程

### Step 0: 扫描项目上下文

先主动扫描项目，找到已有文档再开始工作：

| 优先级 | 文件类型 | 查找方式 |
|--------|---------|---------|
| 最高 | 需求说明书 | `Glob("**/*需求*说明书*.md")` |
| 高 | 功能清单 | `Glob("**/*功能*清单*.md")` |
| 低 | 路由/代码 | `src/router/`, `src/views/`, `src/api/` |

默认全量覆盖所有找到的功能模块，只有文档完全缺失时才询问用户。

### Step 1: 读取模板

读取 `references/templates/test-cases.md`，按模板结构生成文档。

### Step 2: 生成任务清单

**必须先展示任务清单，再逐个生成，禁止一次性写入整个文档。**

任务拆分原则：**拆到最小粒度，每个功能模块的每类测试（业务功能、异常、性能、权限）都是独立任务。**

任务清单示例：
```
| 序号 | 任务名称 | 状态 |
|------|---------|------|
| 1  | 创建文档骨架 | ⏳ 等待中 |
| 2  | 6.1.1 设备档案 - 业务功能测试 | ⏳ 等待中 |
| 3  | 6.1.1 设备档案 - 异常测试 | ⏳ 等待中 |
| 4  | 6.1.1 设备档案 - 性能测试 | ⏳ 等待中 |
| 5  | 6.1.1 设备档案 - 权限测试 | ⏳ 等待中 |
| 6  | 6.1.2 设备分类 - 业务功能测试 | ⏳ 等待中 |
| 7  | 6.1.2 设备分类 - 异常测试 | ⏳ 等待中 |
...
| N  | 七、测试总结 | ⏳ 等待中 |
```

执行规则：
1. 每次只生成一个任务，生成前更新为 🔄，完成后更新为 ✅，重新展示清单
2. 任务1（文档骨架）用 Write 创建文件，后续用 Edit 追加
3. 每条用例使用卡片式表格（`^` 合并语法），格式参考 `references/test-cases-guide.md`

### Step 3: 质量检查

生成完成后自检：
- [ ] 每条用例的预期结果具体明确
- [ ] 每个必填字段都有"为空"的异常测试
- [ ] 每个有权限控制的功能都有权限测试
- [ ] 删除/修改操作都有"二次确认"验证
- [ ] 用例编号无重复

### Step 4: 导出文档（可选）

```bash
bash .claude/skills/common/export-word.sh <markdown文件路径> test-cases
```

## 文档命名规范

`docs/{日期}-{项目名称}-测试用例-V{版本号}.md`

示例：`docs/20260330-智慧厂区巡检系统-测试用例-V1.0.md`

## 参考资源

- 测试用例模板：`references/templates/test-cases.md`
- 表格规范和覆盖场景：`references/test-cases-guide.md`
