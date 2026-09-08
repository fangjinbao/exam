-- 菜单声明版本号：门控 seedNavMenus 是否回写外观字段
--
-- seedNavMenus 每次启动执行。此前它无条件回写 name/icon/orderNum/isShow，
-- 会把管理员在菜单管理页的手工调整静默还原；改为一律不回写后，
-- 代码里新调的排序又对已建库永久无效（本轮的一级菜单重排就撞上这个）。
-- 加此列后按版本号门控：仅当代码声明版本 > 库中值时回写外观字段。
ALTER TABLE `base_sys_menu` ADD COLUMN `declVersion` INT NOT NULL DEFAULT 0;

-- 一级菜单重排：外部考生管理与练习管理原先都声明 orderNum=6，
-- 侧边栏相对顺序由次级排序决定，属未定义行为。
-- 此处按「练习排到 7、后续依次递增」校正，并同步把 declVersion 置为 1，
-- 使 seed 的新声明与库中现状一致，避免下次启动重复回写。
UPDATE `base_sys_menu` SET `orderNum` = 6,  `declVersion` = 1 WHERE `router` = '/external';
UPDATE `base_sys_menu` SET `orderNum` = 7,  `declVersion` = 1 WHERE `router` = '/practice';
UPDATE `base_sys_menu` SET `orderNum` = 8,  `declVersion` = 1 WHERE `router` = '/grading';
UPDATE `base_sys_menu` SET `orderNum` = 9,  `declVersion` = 1 WHERE `router` = '/analytics';
UPDATE `base_sys_menu` SET `orderNum` = 10, `declVersion` = 1 WHERE `router` = '/certificate';
UPDATE `base_sys_menu` SET `orderNum` = 11, `declVersion` = 1 WHERE `router` = '/organization';
UPDATE `base_sys_menu` SET `orderNum` = 12, `declVersion` = 1 WHERE `router` = '/permission';
UPDATE `base_sys_menu` SET `orderNum` = 13, `declVersion` = 1 WHERE `router` = '/system';
