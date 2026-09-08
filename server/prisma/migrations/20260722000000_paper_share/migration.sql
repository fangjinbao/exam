-- 试卷增加创建人与共享属性（可见范围 + 权限级别），规则与题库一致
-- AlterTable
ALTER TABLE `exam_paper`
  ADD COLUMN `createBy` INTEGER NULL,
  ADD COLUMN `visibleScope` VARCHAR(20) NOT NULL DEFAULT 'all',
  ADD COLUMN `shareLevel` VARCHAR(20) NOT NULL DEFAULT 'manage';

-- CreateIndex
CREATE INDEX `exam_paper_createBy_idx` ON `exam_paper`(`createBy`);

-- 存量试卷归属超级管理员（username='admin'），保持全部可见且可管理，避免打断现有使用
UPDATE `exam_paper`
SET `createBy` = (SELECT `id` FROM `base_sys_user` WHERE `username` = 'admin' LIMIT 1)
WHERE `createBy` IS NULL;
