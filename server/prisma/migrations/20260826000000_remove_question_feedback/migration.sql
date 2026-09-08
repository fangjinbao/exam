-- 移除「题目反馈」功能：删表、删练习设置的开关列、清理菜单与权限点
--
-- 由来：需求方确认该功能整体不再需要。管理端页面（views/question-feedback）、
-- 服务端模块（exam/services/question-feedback.service 及其 controller/dto）、
-- 移动端纠错弹窗（QuestionFeedbackPopup）与提交接口均已随本次改动一并删除。
--
-- 执行前已确认数据为空：exam_question_feedback 0 行，
-- exam_practice_setting 中 allowFeedback=true 的行 0 条，故本迁移不丢失任何业务数据。

-- 1) 删除反馈表
-- 该表通过 questionId 外键指向 exam_question（onDelete: Cascade），
-- 直接 DROP 会连带移除该外键约束，无需先手工解绑。
DROP TABLE IF EXISTS `exam_question_feedback`;

-- 2) 删除两处练习设置里的开关列
-- 该列只用于控制移动端是否露出纠错入口，入口已删除，列即失去全部读取方。
-- 用存储过程包装：MySQL 的 DROP COLUMN 不支持 IF EXISTS，
-- 而迁移需要可重跑（本地库与各环境的列状态可能不一致）。
DROP PROCEDURE IF EXISTS `drop_col_if_exists`;
CREATE PROCEDURE `drop_col_if_exists`(IN tbl VARCHAR(64), IN col VARCHAR(64))
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', tbl, '` DROP COLUMN `', col, '`');
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END;

CALL `drop_col_if_exists`('exam_practice_setting', 'allowFeedback');
CALL `drop_col_if_exists`('exam_self_practice_config', 'allowFeedback');

DROP PROCEDURE IF EXISTS `drop_col_if_exists`;

-- 3) 清理菜单与权限点
-- 与 20260821000000_remove_grading_ai_perm 同款做法，理由也相同：
-- perms-sync（bootstrap.service.ts 每次启动执行）只有 create 分支、不清理孤儿，
-- MenuService.getTree 也不校验路由是否存在。留着会让角色授权树继续显示可勾选的
-- 「题目反馈」及其子权限，管理员勾选后毫无效果，还误以为系统仍具备该能力。
--
-- 按 perms 前缀与 router 删除而非硬编码主键：菜单 ID 由各环境自增产生，
-- 线上不保证与本地一致，写死 ID 会误删其他模块。
-- base_sys_role_menu 中指向这些菜单的关联行随外键级联删除
-- （见 schema.prisma SysRoleMenu.menu onDelete: Cascade）。
--
-- 先删子权限点再删父菜单：子节点靠 perms 前缀匹配，与 parentId 无关，
-- 两条语句顺序其实不影响结果，但保持「先叶子后父」的习惯读起来更清楚。
DELETE FROM `base_sys_menu` WHERE `perms` LIKE 'exam:question-feedback:%';
DELETE FROM `base_sys_menu` WHERE `router` = '/question-bank/feedback';

-- 重跑安全性：DROP TABLE / DROP COLUMN 均带存在性判断，DELETE 天然幂等。
--
-- ⚠️ 部署顺序：本迁移应与删除上述代码的版本一同生效。
-- 若迁移已跑而代码回滚到旧镜像，旧代码启动时 perms-sync 会把
-- @Perms('question-feedback') 系列权限点重新写回 base_sys_menu（原地复活且无告警），
-- 且旧代码读写 allowFeedback 列与反馈表会直接报错。
-- 反向顺序（先部署代码、后跑迁移）只是孤儿菜单多留一会儿，无害。
