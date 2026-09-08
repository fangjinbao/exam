-- AlterTable
ALTER TABLE `exam_question` ADD COLUMN `scoringCriteria` TEXT NULL;

-- CreateTable
CREATE TABLE `exam_certificate_template` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `title` VARCHAR(100) NOT NULL,
    `issuingOrg` VARCHAR(100) NOT NULL,
    `description` VARCHAR(500) NULL,
    `sealImage` VARCHAR(255) NULL,
    `numberRule` VARCHAR(50) NOT NULL,
    `status` INTEGER NOT NULL DEFAULT 1,
    `tenantId` INTEGER NULL,
    `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updateTime` DATETIME(3) NOT NULL,

    UNIQUE INDEX `exam_certificate_template_name_key`(`name`),
    INDEX `exam_certificate_template_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_paper` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
    `totalScore` DOUBLE NOT NULL DEFAULT 0,
    `questionCount` INTEGER NOT NULL DEFAULT 0,
    `suggestDuration` INTEGER NOT NULL,
    `knowledgeDistribution` VARCHAR(500) NULL,
    `tenantId` INTEGER NULL,
    `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updateTime` DATETIME(3) NOT NULL,

    INDEX `exam_paper_type_idx`(`type`),
    INDEX `exam_paper_status_idx`(`status`),
    INDEX `exam_paper_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_paper_bank` (
    `paperId` INTEGER NOT NULL,
    `bankId` INTEGER NOT NULL,

    INDEX `exam_paper_bank_bankId_idx`(`bankId`),
    PRIMARY KEY (`paperId`, `bankId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_paper_question` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `paperId` INTEGER NOT NULL,
    `questionId` INTEGER NOT NULL,
    `score` DOUBLE NOT NULL,
    `sortNo` INTEGER NOT NULL DEFAULT 0,

    INDEX `exam_paper_question_paperId_idx`(`paperId`),
    INDEX `exam_paper_question_questionId_idx`(`questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_paper_rule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `paperId` INTEGER NOT NULL,
    `questionType` VARCHAR(20) NOT NULL,
    `difficulty` VARCHAR(20) NOT NULL,
    `knowledgePointId` INTEGER NOT NULL,
    `drawCount` INTEGER NOT NULL,
    `scorePerQuestion` DOUBLE NOT NULL,

    INDEX `exam_paper_rule_paperId_idx`(`paperId`),
    INDEX `exam_paper_rule_knowledgePointId_idx`(`knowledgePointId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_exam` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `description` VARCHAR(500) NULL,
    `paperId` INTEGER NOT NULL,
    `startTime` DATETIME(3) NOT NULL,
    `endTime` DATETIME(3) NOT NULL,
    `duration` INTEGER NOT NULL,
    `passScore` DOUBLE NOT NULL,
    `certProjectId` INTEGER NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'unpublished',
    `tenantId` INTEGER NULL,
    `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updateTime` DATETIME(3) NOT NULL,

    INDEX `exam_exam_paperId_idx`(`paperId`),
    INDEX `exam_exam_status_idx`(`status`),
    INDEX `exam_exam_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_exam_candidate` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `examId` INTEGER NOT NULL,
    `candidateType` VARCHAR(20) NOT NULL,
    `internalUserId` INTEGER NULL,
    `externalCandidateId` INTEGER NULL,
    `examSiteId` INTEGER NULL,
    `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `exam_exam_candidate_examId_idx`(`examId`),
    INDEX `exam_exam_candidate_internalUserId_idx`(`internalUserId`),
    INDEX `exam_exam_candidate_externalCandidateId_idx`(`externalCandidateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_anti_cheat_config` (
    `examId` INTEGER NOT NULL,
    `screenSwitchDetect` BOOLEAN NOT NULL DEFAULT false,
    `allowSwitchTimes` INTEGER NOT NULL DEFAULT 0,
    `faceVerify` BOOLEAN NOT NULL DEFAULT false,
    `snapshotDuringExam` BOOLEAN NOT NULL DEFAULT false,
    `snapshotInterval` INTEGER NOT NULL DEFAULT 60,
    `avScreenMonitor` BOOLEAN NOT NULL DEFAULT false,
    `shuffleQuestions` BOOLEAN NOT NULL DEFAULT false,
    `operationRestrict` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`examId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_answer_sheet` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `examId` INTEGER NOT NULL,
    `candidateType` VARCHAR(20) NOT NULL,
    `internalUserId` INTEGER NULL,
    `externalCandidateId` INTEGER NULL,
    `candidateName` VARCHAR(50) NOT NULL,
    `objectiveScore` DOUBLE NULL,
    `subjectiveScore` DOUBLE NULL,
    `totalScore` DOUBLE NULL,
    `gradingStatus` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `scorePublished` BOOLEAN NOT NULL DEFAULT false,
    `passed` BOOLEAN NULL,
    `submitTime` DATETIME(3) NULL,
    `tenantId` INTEGER NULL,
    `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updateTime` DATETIME(3) NOT NULL,

    INDEX `exam_answer_sheet_examId_idx`(`examId`),
    INDEX `exam_answer_sheet_gradingStatus_idx`(`gradingStatus`),
    INDEX `exam_answer_sheet_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_answer_item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `answerSheetId` INTEGER NOT NULL,
    `questionId` INTEGER NOT NULL,
    `questionNo` INTEGER NOT NULL,
    `questionCategory` VARCHAR(20) NOT NULL,
    `fullScore` DOUBLE NOT NULL,
    `candidateAnswer` TEXT NULL,
    `standardAnswer` TEXT NULL,
    `scoringCriteria` TEXT NULL,
    `score` DOUBLE NULL,
    `isCorrect` BOOLEAN NULL,
    `aiScore` DOUBLE NULL,
    `aiComment` TEXT NULL,
    `finalScore` DOUBLE NULL,
    `aiGradeFailed` BOOLEAN NOT NULL DEFAULT false,

    INDEX `exam_answer_item_answerSheetId_idx`(`answerSheetId`),
    INDEX `exam_answer_item_questionId_idx`(`questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_review_record` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `answerSheetId` INTEGER NOT NULL,
    `answerItemId` INTEGER NOT NULL,
    `reviewerId` INTEGER NOT NULL,
    `reviewerName` VARCHAR(50) NOT NULL,
    `scoreBefore` DOUBLE NULL,
    `scoreAfter` DOUBLE NOT NULL,
    `reviewComment` VARCHAR(500) NOT NULL,
    `reviewTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `exam_review_record_answerSheetId_idx`(`answerSheetId`),
    INDEX `exam_review_record_answerItemId_idx`(`answerItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `exam_paper_bank` ADD CONSTRAINT `exam_paper_bank_paperId_fkey` FOREIGN KEY (`paperId`) REFERENCES `exam_paper`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_paper_bank` ADD CONSTRAINT `exam_paper_bank_bankId_fkey` FOREIGN KEY (`bankId`) REFERENCES `exam_question_bank`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_paper_question` ADD CONSTRAINT `exam_paper_question_paperId_fkey` FOREIGN KEY (`paperId`) REFERENCES `exam_paper`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_paper_question` ADD CONSTRAINT `exam_paper_question_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `exam_question`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_paper_rule` ADD CONSTRAINT `exam_paper_rule_paperId_fkey` FOREIGN KEY (`paperId`) REFERENCES `exam_paper`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_exam` ADD CONSTRAINT `exam_exam_paperId_fkey` FOREIGN KEY (`paperId`) REFERENCES `exam_paper`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_exam_candidate` ADD CONSTRAINT `exam_exam_candidate_examId_fkey` FOREIGN KEY (`examId`) REFERENCES `exam_exam`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_exam_candidate` ADD CONSTRAINT `exam_exam_candidate_externalCandidateId_fkey` FOREIGN KEY (`externalCandidateId`) REFERENCES `exam_external_candidate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_anti_cheat_config` ADD CONSTRAINT `exam_anti_cheat_config_examId_fkey` FOREIGN KEY (`examId`) REFERENCES `exam_exam`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_answer_sheet` ADD CONSTRAINT `exam_answer_sheet_examId_fkey` FOREIGN KEY (`examId`) REFERENCES `exam_exam`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_answer_item` ADD CONSTRAINT `exam_answer_item_answerSheetId_fkey` FOREIGN KEY (`answerSheetId`) REFERENCES `exam_answer_sheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_answer_item` ADD CONSTRAINT `exam_answer_item_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `exam_question`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_review_record` ADD CONSTRAINT `exam_review_record_answerSheetId_fkey` FOREIGN KEY (`answerSheetId`) REFERENCES `exam_answer_sheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

