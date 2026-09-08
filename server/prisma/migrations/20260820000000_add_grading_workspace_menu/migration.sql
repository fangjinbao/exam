-- 新增「阅卷工作台」隐藏菜单（阅卷中心列表「阅卷」按钮跳转的独立页 /grading-workspace）
--
-- 背景：阅卷中心列表本轮由「一份答卷一行」改为「一场考试一行 + 待阅份数」，
-- 点「阅卷」进入工作台（左侧考生名单 + 右侧答卷，考试 id 走 query）。
--
-- 为什么要写成迁移：菜单声明在 seed.service.ts，但整体种子只在「库里没有用户」时才执行
-- （BootstrapService.seedIfEmpty / dev-setup.sh 的 init_seed 都以已有数据为由整体跳过），
-- 已有数据的环境不会自动补进新增菜单。而路由是后端菜单驱动的
-- （VITE_ACCESS_MODE=backend 时前端 routeModules 不参与注册，实际路由来自 /admin/open/permmenu），
-- 菜单缺失的表现就是页面 404 且前端构建无任何报错。故与「考试详情」同款，走迁移落库。
--
-- 不挂 perms：工作台内的取名单/AI 阅卷/提交复核/发布撤回接口复用 exam:grading:* 权限点，
-- 已由「阅卷中心」菜单节点承载。
-- isShow=0：仅供列表页跳转，不出现在侧边栏。
-- keepAlive=0：换考试进来必须重新拉考生名单，缓存会残留上一场的人（故此处不取列默认值 1）。
-- 非超管角色的可见性由 MenuService.getUserMenuTree 的伴随隐藏页逻辑保证：
-- 有 /grading 权限即自动带出 /grading-workspace（该处已加 `-workspace` 后缀）。
-- 幂等：按 router 去重，重复执行不会产生第二条。
INSERT INTO `base_sys_menu` (`parentId`, `name`, `router`, `perms`, `type`, `icon`, `orderNum`, `keepAlive`, `isShow`, `createTime`, `updateTime`)
SELECT NULL, '阅卷工作台', '/grading-workspace', NULL, 1, NULL, 71, 0, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (
  SELECT 1 FROM (SELECT `id` FROM `base_sys_menu` WHERE `router` = '/grading-workspace') AS t
);
