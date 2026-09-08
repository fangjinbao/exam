-- 考试设置扩展：防作弊配置表并入重考次数与考前/考中/考后设置，语义已非「仅防作弊」故改名
-- RenameTable
ALTER TABLE `exam_anti_cheat_config` RENAME TO `exam_setting`;

-- AlterTable：重考 + 考前 + 考中 + 考后
ALTER TABLE `exam_setting`
  ADD COLUMN `retakeLimit` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `earlyEnterMinutes` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `requireCommitment` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `allowEarlySubmit` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `minAnswerMinutes` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `showRemainingTime` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `allowBacktrack` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `allowViewScore` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `allowViewAnalysis` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `scorePublishMode` VARCHAR(20) NOT NULL DEFAULT 'afterGrading';

-- AlterTable：考试主表增加发证设置
ALTER TABLE `exam_exam`
  ADD COLUMN `autoIssueCert` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `certTemplateId` INTEGER NULL;
