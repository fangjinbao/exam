-- 独立发证场景（考试只配 certTemplateId、不挂认证项目）没有项目可依，projectId 放开为可空
ALTER TABLE `exam_certificate` MODIFY COLUMN `projectId` INTEGER NULL;

-- 自动发证幂等：同一份答卷只应产出一张证书（MySQL 唯一索引允许多个 NULL，手工发证不受影响）
CREATE UNIQUE INDEX `exam_certificate_answerSheetId_key` ON `exam_certificate`(`answerSheetId`);
