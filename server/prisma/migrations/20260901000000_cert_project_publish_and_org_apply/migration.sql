-- 鉴定项目发布 + 单位按名额报名
--
-- 两块改动：
-- 1. CertProject 加发布状态。与 status（启用/停用）是两回事：status 管这条
--    记录还算不算数，发布状态管各单位能否开始报名。已发布即锁定，要改先撤回。
-- 2. CertApplication 加单位归属与提交人。原表只服务「考生自主报考」，
--    没有单位维度，无法与 CertProjectQuota 的名额对账。
--    存量记录这几列留空，表示不占单位名额。

ALTER TABLE `exam_cert_project`
  ADD COLUMN `publishStatus` VARCHAR(20) NOT NULL DEFAULT 'unpublished',
  ADD COLUMN `publishTime` DATETIME(3) NULL,
  ADD COLUMN `publishBy` INTEGER NULL;

ALTER TABLE `exam_cert_application`
  ADD COLUMN `orgId` INTEGER NULL,
  ADD COLUMN `deptId` INTEGER NULL,
  ADD COLUMN `submitterId` INTEGER NULL,
  ADD COLUMN `submitterName` VARCHAR(50) NULL;

-- 数名额：按 projectId+orgId 统计已报人数
CREATE INDEX `exam_cert_application_projectId_orgId_status_idx`
  ON `exam_cert_application`(`projectId`, `orgId`, `status`);

-- 查「某人在本项目是否已报」
CREATE INDEX `exam_cert_application_projectId_internalUserId_idx`
  ON `exam_cert_application`(`projectId`, `internalUserId`);
