-- 新增「考试详情」隐藏菜单（考试列表「详情」按钮跳转的独立页 /exam-detail）
--
-- 为什么要写成迁移：菜单声明在 seed.service.ts，但整体种子只在「库里没有用户」时才执行
-- （BootstrapService.seedIfEmpty / dev-setup.sh 的 init_seed 都以已有数据为由整体跳过），
-- 已有数据的环境不会自动补进新增菜单。而路由是后端菜单驱动的
-- （非 mock 模式下前端 routeModules 不参与注册，实际路由来自 /admin/open/permmenu），
-- 菜单缺失的表现就是页面 404 且前端构建无任何报错。故与「下线监考中心」同款，走迁移落库。
--
-- 不挂 perms：成绩分页与导出接口复用 exam:exam:detail 权限点，已由「考试管理」菜单节点承载。
-- isShow=0：仅供列表页跳转，不出现在侧边栏。
-- 幂等：按 router 去重，重复执行不会产生第二条。
INSERT INTO `base_sys_menu` (`parentId`, `name`, `router`, `perms`, `type`, `icon`, `orderNum`, `keepAlive`, `isShow`, `createTime`, `updateTime`)
-- keepAlive 显式写 1（与列默认值一致），与 /exam-edit、/practice-detail 两条既有隐藏菜单保持一致
SELECT NULL, '考试详情', '/exam-detail', NULL, 1, NULL, 32, 1, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (
  SELECT 1 FROM (SELECT `id` FROM `base_sys_menu` WHERE `router` = '/exam-detail') AS t
);
