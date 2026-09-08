-- 下线「监考中心」整个模块（监考安排 + 异常事件）
-- 说明：该模块连同监考员角色、演示监考账号、事件类型字典一并移除。
-- 数据影响：监考安排与异常事件台账不可恢复。
-- 保留项：AnswerSheet.switchCount 仍在累加，防切屏「超次数强制交卷」不受影响，
--         仅不再留存逐条异常事件台账。

-- 1. 删除监考安排表
DROP TABLE IF EXISTS `exam_proctor_assignment`;

-- 2. 删除异常事件表
DROP TABLE IF EXISTS `exam_abnormal_event`;

-- 3. 清理监考中心菜单（目录 + 监考安排 + 异常事件 + 历史遗留的录像回放）
--    base_sys_role_menu 对 menuId 是级联删除，权限关联会自动清除
DELETE FROM `base_sys_menu` WHERE `router` LIKE '/proctor%';

-- 4. 仅清理演示监考账号 proctor01（user_role 关联级联删除）
--    注意：proctor 角色下还挂着真实员工账号，这些账号一律保留，
--    删除角色后他们会变成无角色用户，可另行分配角色，不能连账号一起删。
DELETE FROM `base_sys_user` WHERE `username` = 'proctor01';

-- 5. 清理监考员角色（role_menu / user_role 关联级联删除，员工账号本身不受影响）
DELETE FROM `base_sys_role` WHERE `label` = 'proctor';

-- 6. 清理事件类型字典（仅服务于已删除的异常事件）
DELETE FROM `dict_info` WHERE `typeId` IN (
  SELECT `id` FROM (SELECT `id` FROM `dict_type` WHERE `key` = 'event_type') AS t
);
DELETE FROM `dict_type` WHERE `key` = 'event_type';
