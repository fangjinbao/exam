-- 技能鉴定：新增「鉴定项目详情」隐藏菜单
--
-- 认证项目列表的「详情」按钮跳这一页，页内汇总报名 / 审核 / 考试各阶段进展。
--
-- 为什么必须落库：路由是后端菜单驱动的（非 mock 模式下前端 routeModules 不参与注册，
-- 实际路由来自 /admin/open/permmenu）。前端加了静态路由也不生效，
-- 表现是点「详情」报 "No match for name CertificationProjectDetail"，
-- 而前端类型检查与构建都不会报任何错——与「考试详情」当初同款。
--
-- 与 seed.service.ts 的关系：菜单的权威来源是 seedNavMenus（BootstrapService.syncNavMenus
-- 每次启动、所有环境都执行）。本迁移只为走 migrate deploy 的环境提前落到位，
-- 不承担收敛责任；两处必须都能单独跑、任意顺序跑不出错。

-- 挂在「技能鉴定」目录下，isShow=0 只供列表跳转、不进侧边栏（与「题目管理」同款）。
--
-- 不挂 perms：progress 接口复用 exam:cert-project:detail，已由「认证项目」节点承载。
-- 这里留 NULL 而非空串——PermsSyncService 按 perms 分组同步权限点，
-- 空串会被当成一个名为空的分组。
--
-- keepAlive=0：各阶段人数是实时值，缓存回来会显示过期数据。
--
-- NOT EXISTS 保证重复执行不插第二行（router 上无唯一索引，只能这样兜）。
INSERT INTO `base_sys_menu`
  (`parentId`, `name`, `type`, `router`, `perms`, `orderNum`, `isShow`, `keepAlive`, `declVersion`, `createTime`, `updateTime`)
SELECT
  (SELECT `id` FROM (SELECT `id` FROM `base_sys_menu` WHERE `router` = '/certification' LIMIT 1) AS d),
  '鉴定项目详情', 1, '/certification/project-detail', NULL, 5, 0, 0, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (
  SELECT 1 FROM (SELECT `id` FROM `base_sys_menu` WHERE `router` = '/certification/project-detail') AS t
);
