-- 移除鉴定项目的「启用/停用」能力
--
-- 背景：本模块的生命周期只有「未发布 ↔ 已发布」，启用/停用与之重叠。
-- 要停止各单位报名应当用撤回（语义更准，且能回到可编辑态）；
-- 留着启停的害处是它能把项目改成 status=0，而界面上已无处恢复。
--
-- 代码侧已屏蔽 update-status 路由（覆写同名方法且不加装饰器，路由不注册），
-- 但权限同步服务只新增、不删除废弃权限点，故需显式清理。
--
-- 与 seed.service.ts 的清理清单并存、不是重复：seedNavMenus 每次启动都跑，
-- 负责长期兜底（含本次之后任何途径重新登记的情况）；本迁移负责 migrate deploy
-- 那一刻就把已部署库里的残留清掉，不必等应用起来。两处都是幂等的。
--
-- 数据影响：删除 1 条按钮权限点及其角色关联；exam_cert_project.status 列保留
-- （默认 1，发布前的校验仍会读它），仅去掉改动它的入口，故无需回填。

-- 1. 显式解除角色与该权限点的关联
--    base_sys_role_menu.menuId 的外键本就是 ON DELETE CASCADE，删父表会自动级联，
--    这一步并非必需；显式写出是为了不依赖级联行为，也让影响范围在 SQL 里看得见。
DELETE rm FROM `base_sys_role_menu` rm
  INNER JOIN `base_sys_menu` m ON m.`id` = rm.`menuId`
  WHERE m.`perms` = 'exam:cert-project:update-status';

-- 2. 删除权限点本身
DELETE FROM `base_sys_menu` WHERE `perms` = 'exam:cert-project:update-status';
