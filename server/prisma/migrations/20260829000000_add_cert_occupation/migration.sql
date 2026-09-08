-- 技能鉴定：新增「鉴定工种」与「鉴定级别」两张表，并把模块菜单由「资格认证」改名为「技能鉴定」
--
-- 为什么工种与级别分两张表、而不是像 exam_knowledge_point 那样自引用：
-- 工种→级别的层级恒为两层，自引用表在结构上允许「级别下再挂级别」，只能靠校验拦；
-- 且两者字段本就不同（工种有编号与启停状态，级别只有名称与排序）。
-- 分表把这个约束变成结构性的，前端树形表格照旧由 levels 关系组装成 children。
--
-- 级别随工种级联删除（ON DELETE CASCADE）：级别没有独立于工种的生命周期，
-- 工种删了留着孤儿级别没有意义。级别也不开独立的增删改接口，
-- 由工种的 add/update 整组提交、服务端全量替换。

CREATE TABLE `exam_cert_occupation` (
  `id`          INT          NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(50)  NOT NULL COMMENT '工种名称（≤50 字，唯一）',
  `code`        VARCHAR(30)  NOT NULL COMMENT '工种编号（≤30 字，唯一；留空时由系统按 GZ+序号 生成）',
  `description` VARCHAR(500) NULL     COMMENT '工种说明',
  `orderNum`    INT          NOT NULL DEFAULT 0 COMMENT '排序号（列表内升序）',
  `status`      INT          NOT NULL DEFAULT 1 COMMENT '状态 1=启用 0=停用',
  `tenantId`    INT          NULL     COMMENT '租户 ID',
  `createTime`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updateTime`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `exam_cert_occupation_tenantId_idx` (`tenantId`)
) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COMMENT = '鉴定工种（技能鉴定基础数据，如加油工、电工）';

CREATE TABLE `exam_cert_occupation_level` (
  `id`           INT          NOT NULL AUTO_INCREMENT,
  `occupationId` INT          NOT NULL COMMENT '所属工种 ID',
  `name`         VARCHAR(50)  NOT NULL COMMENT '级别名称（同一工种内唯一）',
  `orderNum`     INT          NOT NULL DEFAULT 0 COMMENT '排序号（同工种内升序，表达级别高低次序）',
  `description`  VARCHAR(500) NULL     COMMENT '级别说明',
  `createTime`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updateTime`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `exam_cert_occupation_level_occupationId_idx` (`occupationId`),
  CONSTRAINT `exam_cert_occupation_level_occupationId_fkey`
    FOREIGN KEY (`occupationId`) REFERENCES `exam_cert_occupation` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COMMENT = '鉴定级别（隶属某一工种，如加油工的初级/中级/高级）';

-- 菜单：模块改名 + 新增「鉴定工种管理」子菜单。
--
-- 只改显示名。router 仍是 /certification、权限点仍是 exam:cert-*、前端视图目录仍是
-- views/certification：改这些要连带迁移菜单行 router、角色授权、每个 @Perms 的前缀
-- 与前端整个目录，而它们都是用户看不见的内部标识，动了只增加出错面。
--
-- 与 seed.service.ts 的关系同练习菜单那轮：菜单的权威来源是 seedNavMenus
-- （每次启动、所有环境都执行）。本迁移只为走 migrate deploy 的环境提前落位，
-- 两处都需能单独跑、任意顺序跑不出错，故此处一律带幂等守卫。
UPDATE `base_sys_menu` SET `name` = '技能鉴定', `declVersion` = 1
WHERE `router` = '/certification' AND `type` = 0;

-- 原有两个子菜单顺序后移，给「鉴定工种管理」让出 orderNum=1
UPDATE `base_sys_menu` SET `orderNum` = 2, `declVersion` = 1 WHERE `router` = '/certification/project';
UPDATE `base_sys_menu` SET `orderNum` = 3, `declVersion` = 1 WHERE `router` = '/certification/application';

-- NOT EXISTS 保证重复执行不会插出第二条（router 上无唯一索引，只能这样兜）；
-- parentId 按 router 子查询取目录 id，不用 LAST_INSERT_ID()——上面两条 UPDATE 之后
-- LAST_INSERT_ID() 会是上一次无关插入的值。
INSERT INTO `base_sys_menu` (`parentId`, `name`, `router`, `perms`, `type`, `orderNum`, `isShow`, `keepAlive`, `declVersion`, `createTime`, `updateTime`)
SELECT
  (SELECT `id` FROM (SELECT `id` FROM `base_sys_menu` WHERE `router` = '/certification' AND `type` = 0 LIMIT 1) AS d),
  '鉴定工种管理', '/certification/occupation', 'exam:cert-occupation:list', 1, 1, 1, 1, 0, NOW(3), NOW(3)
WHERE NOT EXISTS (
  SELECT 1 FROM (SELECT `id` FROM `base_sys_menu` WHERE `router` = '/certification/occupation') AS t
);
