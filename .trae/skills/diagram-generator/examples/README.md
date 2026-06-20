# draw.io 图表模板库

生成图表时，**必须先读取对应场景的模板文件**，以模板结构为骨架替换业务内容。

## 模板索引

### 业务流程图 `business-flow/`

适用：跨部门/跨角色协作流程、业务流程建模、泳道图

| 文件 | 适用场景 |
|------|---------|
| `business-flow/business-flow.xml` | 完整业务主流程（多角色泳道，实际项目示例） |
| `business-flow/cross-functional.xml` | 跨职能协作流程（通用模板） |
| `business-flow/business-process.xml` | BPMN 业务流程建模（含网关） |

### 系统架构图 `system-architecture/`

适用：分层架构、技术栈、组织结构

| 文件 | 适用场景 |
|------|---------|
| `system-architecture/system-architecture.xml` | 分层系统架构（实际项目示例，5层结构） |
| `system-architecture/system-arch.xml` | 分层架构通用模板 |
| `system-architecture/org-structure.xml` | 组织结构/部门层级 |

### 用户操作流程图 `operation-flow/`

适用：单功能操作步骤、审批流程、用户交互流程

| 文件 | 适用场景 |
|------|---------|
| `operation-flow/refinery-mgmt-flow.xml` | 功能操作流程（实际项目示例，管理员+系统泳道） |
| `operation-flow/approval-flow.xml` | 多步审批流程（含驳回循环） |
| `operation-flow/basic-flow.xml` | 基本操作流程（开始→步骤→判断→结束） |

### UML 图 `uml/`

适用：用例图、类图、时序图、ER图

| 文件 | 适用场景 |
|------|---------|
| `uml/refinery-mgmt-usecase.xml` | 用例图（实际项目示例，多角色+include关系） |
| `uml/system-interaction.xml` | 时序图（系统间交互、API调用链） |
| `uml/uml-class.xml` | 类图（数据模型、继承关系） |
| `uml/entity-relationship.xml` | ER图（数据库表关系） |

## 渲染方式

```bash
# 使用渲染脚本（支持 png/jpg/svg 输出）
.claude/skills/diagram-generator/scripts/render-diagram.sh <源文件.xml> <输出.jpg>

# 直接调用 API
curl -X POST "https://draw.axuremart.com/api/export" \
  -H "Content-Type: application/json" \
  -d '{"xml":"...","format":"png","scale":2}' \
  --output output.png
```

## 使用规则

1. 根据业务场景找到对应目录
2. 优先参考标注"实际项目示例"的文件
3. 读取模板 XML，理解节点布局和样式
4. 以模板为骨架替换为实际业务内容
5. 保存 XML 源文件到 `docs/images/src/`
6. 渲染为 JPG 保存到 `docs/images/`
7. 在文档中插入 `![描述](images/文件名.jpg)`
