-- 题库增加创建人与共享属性（可见范围 + 权限级别）
-- AlterTable
ALTER TABLE `exam_question_bank`
  ADD COLUMN `createBy` INTEGER NULL,
  ADD COLUMN `visibleScope` VARCHAR(20) NOT NULL DEFAULT 'all',
  ADD COLUMN `shareLevel` VARCHAR(20) NOT NULL DEFAULT 'manage';

-- CreateIndex
CREATE INDEX `exam_question_bank_createBy_idx` ON `exam_question_bank`(`createBy`);

-- 存量题库归属超级管理员（username='admin'），保持全部可见且可管理，避免打断现有使用
UPDATE `exam_question_bank`
SET `createBy` = (SELECT `id` FROM `base_sys_user` WHERE `username` = 'admin' LIMIT 1)
WHERE `createBy` IS NULL;
