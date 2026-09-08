-- 清理阅卷中心的 5 个孤儿权限点（新增/修改/改状态/删除/批量删除）
--
-- 由来：GradingController 声明了 @CrudController({ api: [] })，但 api 字段只写进类元数据、
-- 从未被用于拦截路由注册，故基类 CrudControllerBase 的 CRUD 路由仍沿原型链注册。
-- perms-sync 扫描路由时把它们当成真接口，自动建出了这 5 个权限点。
-- 现已在 GradingController 内无装饰器覆写 add/update/updateStatus/delete/batchDelete
-- 取消这 5 条路由（答卷由考生交卷产生，不该被后台增删改），权限点随之失去对应接口。
--
-- 为什么必须清理：perms-sync 只有 create 分支、不清理孤儿；MenuService.getTree 无条件
-- 返回全部菜单、不校验路由是否存在。留着会让角色授权树上继续显示这 5 个可勾选项，
-- 管理员勾选并保存后毫无效果，误以为授出了系统实际不具备的能力。
--
-- 安全性：无路由的权限点是惰性的，不构成可利用面，故此迁移只解决运维误导，不修漏洞。
-- 数据影响：base_sys_role_menu 中指向这些菜单的关联行会随外键级联删除
-- （见 schema.prisma SysRoleMenu.menu onDelete: Cascade）。
-- 这些授权本就无接口可调，删除不会使任何人失去实际能力。
--
-- 按 perms 字符串删除而非按主键：菜单 ID 由各环境自增产生，本地为 121-125，
-- 线上不保证一致，硬编码 ID 会误删其他模块的权限点。
--
-- ⚠️ 部署顺序：本迁移必须与取消路由的代码一同生效，且以代码部署成功为准。
-- perms-sync（bootstrap.service.ts 在每次应用启动时执行）只有 create 分支、不清理孤儿，
-- 因此若迁移已跑而代码回滚到旧镜像（或仍有旧实例重启），旧代码的继承 @Perms
-- 会被重新发现，这 5 个权限点将原地复活且无任何告警，清理白做。
-- 反向顺序（先部署代码、后跑迁移）只是孤儿权限点多存在一会儿，无害。
-- 重跑本迁移是安全的：DELETE 天然幂等，权限点已复活时再执行即可再次清掉。
DELETE FROM `base_sys_menu` WHERE `perms` IN (
  'exam:grading:add',
  'exam:grading:update',
  'exam:grading:update-status',
  'exam:grading:delete',
  'exam:grading:batch-delete'
);
