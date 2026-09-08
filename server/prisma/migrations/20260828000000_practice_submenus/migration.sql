-- 练习管理改为「目录 + 两个二级菜单」：岗位练兵 / 自主练习
--
-- 原先 /practice 是单页一级菜单，页内用 Tab 切两种练习形态。
-- 改为目录后侧边栏直接展开两项，去掉那层 Tab。
--
-- 与 seed.service.ts 的关系：菜单的权威来源是 seedNavMenus（BootstrapService.syncNavMenus
-- 每次启动、所有环境都执行，且已按同一目标形态收敛并自愈）。本迁移只是为走 migrate deploy
-- 的环境提前落到位，不承担收敛责任；两处逻辑必须都能单独跑、且任意顺序跑不出错。
--
-- 为什么必须复用现有两行、不能新建后删旧行：
-- - 旧 /practice 行（perms=exam:practice:list）挂着 9 个 type=2 按钮（详情/新增/修改/
--   分配人员/发布/撤回/结束/删除/批量删除），parentId 全部指向它；
-- - 旧 /practice-self 行（isShow=0，仅作按钮挂载点）挂着 2 个按钮（修改/删除）。
-- 新建行会让这 11 个按钮留在错误的父节点下，前端 v-auth 从当前路由 meta.authList
-- 取不到权限点，整排操作按钮消失；PermsSyncService 对已存在的权限点是跳过而非重挂，不会自愈。
--
-- 另一处约束：目录（type=0）不进 PermsSyncService 的 menuByGroup 索引（它只收 type=1），
-- 故 exam:practice:list 必须留在 type=1 的子节点上，即改名后的「岗位练兵」。

-- 1) 旧的单页菜单降为「岗位练兵」二级菜单。
--    type = 1 是关键守卫：本迁移若在 seed 已收敛后重复执行，此时 /practice 已是目录(type=0)，
--    没有这个条件会把目录本身改名成岗位练兵。
UPDATE `base_sys_menu`
SET `name` = '岗位练兵', `router` = '/practice/assigned', `orderNum` = 1, `isShow` = 1, `declVersion` = 3
WHERE `router` = '/practice' AND `type` = 1;

-- 2) 旧的隐藏挂载点转正为「自主练习」二级菜单
UPDATE `base_sys_menu`
SET `name` = '自主练习', `router` = '/practice/self', `orderNum` = 2, `isShow` = 1, `declVersion` = 1
WHERE `router` = '/practice-self';

-- 3) 建 /practice 目录。放在改名之后：先插会让上面两条 UPDATE 命中新目录行。
--    NOT EXISTS 保证重复执行不会插出第二个目录（router 上无唯一索引，只能这样兜）。
INSERT INTO `base_sys_menu` (`name`, `type`, `router`, `icon`, `orderNum`, `isShow`, `keepAlive`, `declVersion`, `createTime`, `updateTime`)
SELECT '练习管理', 0, '/practice', 'Notebook', 7, 1, 1, 1, NOW(3), NOW(3)
WHERE NOT EXISTS (
  SELECT 1 FROM (SELECT `id` FROM `base_sys_menu` WHERE `router` = '/practice') AS t
);

-- 4) 两个二级菜单挂到目录下。
--    按 router 子查询取目录 id，不用 LAST_INSERT_ID()：上一步在目录已存在时不插入，
--    LAST_INSERT_ID() 会是上一次无关插入的值，把子菜单挂到错误的父节点上。
UPDATE `base_sys_menu`
SET `parentId` = (SELECT `id` FROM (SELECT `id` FROM `base_sys_menu` WHERE `router` = '/practice' LIMIT 1) AS d)
WHERE `router` IN ('/practice/assigned', '/practice/self');

-- 5) 角色授权：把原先授到 /practice 的角色补授到目录与两个子菜单。
--    改名保留了行 id，故原授权仍指向「岗位练兵」；目录与另一子菜单需要补，
--    否则非超管角色看不到这一级（前端 filterEmptyMenus 会把无子项的目录整个丢掉）。
INSERT INTO `base_sys_role_menu` (`roleId`, `menuId`)
SELECT rm.`roleId`, m.`id`
FROM `base_sys_role_menu` rm
CROSS JOIN `base_sys_menu` m
WHERE rm.`menuId` = (SELECT `id` FROM (SELECT `id` FROM `base_sys_menu` WHERE `router` = '/practice/assigned' LIMIT 1) AS a)
  AND m.`router` IN ('/practice', '/practice/self')
  AND NOT EXISTS (
    SELECT 1 FROM (SELECT `roleId`, `menuId` FROM `base_sys_role_menu`) AS x
    WHERE x.`roleId` = rm.`roleId` AND x.`menuId` = m.`id`
  );
