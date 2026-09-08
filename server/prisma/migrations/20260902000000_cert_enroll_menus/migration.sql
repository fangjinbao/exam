-- 技能鉴定：新增「鉴定报名」菜单，「报考审核」改名「报名审核」
--
-- 与 seed.service.ts 的关系：菜单的权威来源是 seedNavMenus（BootstrapService.syncNavMenus
-- 每次启动、所有环境都执行，且已按同一目标形态收敛并自愈）。本迁移只为走 migrate deploy
-- 的环境提前落到位，不承担收敛责任；两处逻辑必须都能单独跑、且任意顺序跑不出错。
--
-- 改名的理由：审的对象变了。原先设想是考生自主报考，但那条写入路径从未实现
-- （certApplication.create 全项目只有 seed 的演示数据用过）；现在实际来源是
-- 「鉴定报名」里各单位按名额报上来的人。只改显示名，router 与权限点不动——
-- 改那些要连带迁移菜单行、角色授权与前端整个目录，而它们是用户看不见的内部标识。

-- 1) 「报考审核」改名并让位到 orderNum 4（新的「鉴定报名」占 3）。
--    declVersion 提到 2，与 seed 声明一致：低于声明值时 seed 会重新下发外观字段，
--    高于或等于则跳过，故此处必须写 2 而非留空，否则两处来回覆盖。
UPDATE `base_sys_menu`
SET `name` = '报名审核', `orderNum` = 4, `declVersion` = 2
WHERE `router` = '/certification/application' AND `type` = 1 AND `declVersion` < 2;

-- 2) 建「鉴定报名」菜单，挂在「技能鉴定」目录下。
--    NOT EXISTS 保证重复执行不会插出第二行（router 上无唯一索引，只能这样兜）。
--    perms 必须落在 type=1 节点上：PermsSyncService 的 menuByGroup 只收 type=1，
--    否则 submit/cancel 会被判为孤儿权限点只记录不创建，除超管外无人可被授权。
INSERT INTO `base_sys_menu`
  (`parentId`, `name`, `type`, `router`, `perms`, `orderNum`, `isShow`, `keepAlive`, `declVersion`, `createTime`, `updateTime`)
SELECT
  (SELECT `id` FROM (SELECT `id` FROM `base_sys_menu` WHERE `router` = '/certification' LIMIT 1) AS d),
  '鉴定报名', 1, '/certification/enroll', 'exam:cert-enroll:list', 3, 1, 1, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (
  SELECT 1 FROM (SELECT `id` FROM `base_sys_menu` WHERE `router` = '/certification/enroll') AS t
);

-- 3) 修按钮显示名：review-batch 首次登记时 ACTION_LABELS 里还没有对应中文，
--    落成了英文原文。PermsSyncService 对已存在的权限点是跳过而非改名，不会自愈。
UPDATE `base_sys_menu`
SET `name` = '批量审核'
WHERE `perms` = 'exam:cert-application:review-batch' AND `type` = 2 AND `name` = 'review-batch';

-- 4) 角色授权：原先能审报考的角色，同样该能看到「鉴定报名」。
--    不补授的话，非超管角色侧边栏里没有这一项，等于功能只对超管可用。
INSERT INTO `base_sys_role_menu` (`roleId`, `menuId`)
SELECT rm.`roleId`, m.`id`
FROM `base_sys_role_menu` rm
CROSS JOIN `base_sys_menu` m
WHERE rm.`menuId` = (
    SELECT `id` FROM (
      SELECT `id` FROM `base_sys_menu` WHERE `router` = '/certification/application' LIMIT 1
    ) AS a
  )
  AND m.`router` = '/certification/enroll'
  AND NOT EXISTS (
    SELECT 1 FROM (SELECT `roleId`, `menuId` FROM `base_sys_role_menu`) AS x
    WHERE x.`roleId` = rm.`roleId` AND x.`menuId` = m.`id`
  );
