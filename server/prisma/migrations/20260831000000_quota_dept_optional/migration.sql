-- 名额分配：部门改为选填。
--
-- 起因是「单位」的定义修正：单位是公司节点（集团公司/省公司/分公司），
-- 不是「部门树的顶层节点」。改用 type 判断后，44 个分公司成了可选单位，
-- 而其中 32 个下面并没有再设部门——部门若仍必填，这些单位根本分不了名额。
--
-- deptId 留空表示该名额分给整个单位、不细分到部门。
-- 外键保持 RESTRICT：部门被引用时不允许删除。

ALTER TABLE `exam_cert_project_quota` DROP FOREIGN KEY `exam_cert_project_quota_deptId_fkey`;

ALTER TABLE `exam_cert_project_quota` MODIFY COLUMN `deptId` INTEGER NULL;

ALTER TABLE `exam_cert_project_quota`
  ADD CONSTRAINT `exam_cert_project_quota_deptId_fkey`
  FOREIGN KEY (`deptId`) REFERENCES `base_sys_department`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
