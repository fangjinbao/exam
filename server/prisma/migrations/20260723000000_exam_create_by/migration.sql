-- 考试增加创建人字段（列表展示创建人 + 创建时间）
-- AlterTable
ALTER TABLE `exam_exam` ADD COLUMN `createBy` INTEGER NULL;

-- CreateIndex
CREATE INDEX `exam_exam_createBy_idx` ON `exam_exam`(`createBy`);

-- 存量考试归属超级管理员（username='admin'），避免创建人列全空
UPDATE `exam_exam`
SET `createBy` = (SELECT `id` FROM `base_sys_user` WHERE `username` = 'admin' LIMIT 1)
WHERE `createBy` IS NULL;
