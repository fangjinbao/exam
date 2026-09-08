-- 鉴定项目重构：字段对齐实际业务表单（工种/级别/负责人/时间段/联系电话），
-- 并新增「名额分配」子表。
--
-- 移除 examId / templateId / validMonths：这三项属于「关联考试 + 自动发证」，
-- 当前业务不用，留着会让新表单里出现填不上的必填项。
-- 这是破坏性变更，对应数据不可恢复。
--
-- 手写而非 prisma migrate dev 生成：新增的列都是 NOT NULL，
-- 而表里已有 1 行数据，需要先建可空列、回填、再收紧约束，
-- 自动生成的迁移会直接加 NOT NULL 列而失败。

-- 1) 先加可空列
ALTER TABLE `exam_cert_project`
  ADD COLUMN `occupationId`  INTEGER NULL,
  ADD COLUMN `levelId`       INTEGER NULL,
  ADD COLUMN `managerId`     INTEGER NULL,
  ADD COLUMN `contactPhone`  VARCHAR(20) NULL,
  ADD COLUMN `applyDeadline` DATETIME(3) NULL,
  ADD COLUMN `startTime`     DATETIME(3) NULL,
  ADD COLUMN `endTime`       DATETIME(3) NULL;

-- 2) 回填历史行
--    工种/级别取现存最小 id 的一对（保证 levelId 属于 occupationId，满足业务约束）；
--    负责人取 admin；时间按「今天起」给一段占位区间，避免留下 1970 这种明显错值。
UPDATE `exam_cert_project` SET
  `occupationId` = (
    SELECT `occupationId` FROM (
      SELECT `occupationId` FROM `exam_cert_occupation_level` ORDER BY `id` LIMIT 1
    ) AS t
  ),
  `levelId` = (
    SELECT `id` FROM (
      SELECT `id` FROM `exam_cert_occupation_level` ORDER BY `id` LIMIT 1
    ) AS t2
  ),
  `managerId` = (
    SELECT `id` FROM (
      SELECT `id` FROM `base_sys_user` ORDER BY `id` LIMIT 1
    ) AS t3
  ),
  `contactPhone`  = '',
  `applyDeadline` = DATE_ADD(NOW(), INTERVAL 7 DAY),
  `startTime`     = DATE_ADD(NOW(), INTERVAL 14 DAY),
  `endTime`       = DATE_ADD(NOW(), INTERVAL 15 DAY)
WHERE `occupationId` IS NULL;

-- 3) 收紧为 NOT NULL
ALTER TABLE `exam_cert_project`
  MODIFY COLUMN `occupationId`  INTEGER NOT NULL,
  MODIFY COLUMN `levelId`       INTEGER NOT NULL,
  MODIFY COLUMN `managerId`     INTEGER NOT NULL,
  MODIFY COLUMN `contactPhone`  VARCHAR(20) NOT NULL,
  MODIFY COLUMN `applyDeadline` DATETIME(3) NOT NULL,
  MODIFY COLUMN `startTime`     DATETIME(3) NOT NULL,
  MODIFY COLUMN `endTime`       DATETIME(3) NOT NULL;

-- 4) 去掉旧外键与旧列
ALTER TABLE `exam_cert_project` DROP FOREIGN KEY `exam_cert_project_examId_fkey`;
ALTER TABLE `exam_cert_project` DROP FOREIGN KEY `exam_cert_project_templateId_fkey`;

DROP INDEX `exam_cert_project_examId_idx` ON `exam_cert_project`;
DROP INDEX `exam_cert_project_templateId_idx` ON `exam_cert_project`;

ALTER TABLE `exam_cert_project`
  DROP COLUMN `examId`,
  DROP COLUMN `templateId`,
  DROP COLUMN `validMonths`;

-- 5) 新列的索引与外键
CREATE INDEX `exam_cert_project_occupationId_idx` ON `exam_cert_project`(`occupationId`);
CREATE INDEX `exam_cert_project_levelId_idx` ON `exam_cert_project`(`levelId`);
CREATE INDEX `exam_cert_project_managerId_idx` ON `exam_cert_project`(`managerId`);

ALTER TABLE `exam_cert_project`
  ADD CONSTRAINT `exam_cert_project_occupationId_fkey`
  FOREIGN KEY (`occupationId`) REFERENCES `exam_cert_occupation`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `exam_cert_project`
  ADD CONSTRAINT `exam_cert_project_levelId_fkey`
  FOREIGN KEY (`levelId`) REFERENCES `exam_cert_occupation_level`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `exam_cert_project`
  ADD CONSTRAINT `exam_cert_project_managerId_fkey`
  FOREIGN KEY (`managerId`) REFERENCES `base_sys_user`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6) 名额分配表
CREATE TABLE `exam_cert_project_quota` (
  `id`         INTEGER NOT NULL AUTO_INCREMENT,
  `projectId`  INTEGER NOT NULL,
  `orgId`      INTEGER NOT NULL,
  `deptId`     INTEGER NOT NULL,
  `quota`      INTEGER NOT NULL,
  `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updateTime` DATETIME(3) NOT NULL,

  UNIQUE INDEX `exam_cert_project_quota_projectId_orgId_deptId_key`(`projectId`, `orgId`, `deptId`),
  INDEX `exam_cert_project_quota_projectId_idx`(`projectId`),
  INDEX `exam_cert_project_quota_orgId_idx`(`orgId`),
  INDEX `exam_cert_project_quota_deptId_idx`(`deptId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `exam_cert_project_quota`
  ADD CONSTRAINT `exam_cert_project_quota_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `exam_cert_project`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `exam_cert_project_quota`
  ADD CONSTRAINT `exam_cert_project_quota_orgId_fkey`
  FOREIGN KEY (`orgId`) REFERENCES `base_sys_department`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `exam_cert_project_quota`
  ADD CONSTRAINT `exam_cert_project_quota_deptId_fkey`
  FOREIGN KEY (`deptId`) REFERENCES `base_sys_department`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
