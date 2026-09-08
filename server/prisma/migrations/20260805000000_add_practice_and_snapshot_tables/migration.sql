-- AlterTable
ALTER TABLE `exam_answer_sheet` ADD COLUMN `startTime` DATETIME(3) NULL,
    ADD COLUMN `switchCount` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `exam_cert_project` ADD COLUMN `createBy` INTEGER NULL;

-- AlterTable
ALTER TABLE `exam_exam_candidate` ADD COLUMN `faceVerified` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `faceVerifyTime` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `exam_snapshot` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `examId` INTEGER NOT NULL,
    `answerSheetId` INTEGER NULL,
    `candidateType` VARCHAR(20) NOT NULL,
    `internalUserId` INTEGER NULL,
    `externalCandidateId` INTEGER NULL,
    `candidateName` VARCHAR(50) NOT NULL,
    `scene` VARCHAR(20) NOT NULL DEFAULT 'in_exam',
    `imageUrl` VARCHAR(255) NOT NULL,
    `captureTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenantId` INTEGER NULL,
    `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `exam_snapshot_examId_idx`(`examId`),
    INDEX `exam_snapshot_answerSheetId_idx`(`answerSheetId`),
    INDEX `exam_snapshot_candidateType_internalUserId_idx`(`candidateType`, `internalUserId`),
    INDEX `exam_snapshot_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_practice` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `description` VARCHAR(500) NULL,
    `drawMode` VARCHAR(20) NOT NULL DEFAULT 'sequential',
    `startTime` DATETIME(3) NULL,
    `endTime` DATETIME(3) NULL,
    `autoFinish` BOOLEAN NOT NULL DEFAULT false,
    `participantScope` VARCHAR(20) NOT NULL DEFAULT 'specified',
    `status` VARCHAR(20) NOT NULL DEFAULT 'unpublished',
    `createBy` INTEGER NULL,
    `tenantId` INTEGER NULL,
    `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updateTime` DATETIME(3) NOT NULL,

    UNIQUE INDEX `exam_practice_code_key`(`code`),
    INDEX `exam_practice_status_idx`(`status`),
    INDEX `exam_practice_tenantId_idx`(`tenantId`),
    INDEX `exam_practice_createBy_idx`(`createBy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_practice_bank` (
    `practiceId` INTEGER NOT NULL,
    `bankId` INTEGER NOT NULL,

    INDEX `exam_practice_bank_bankId_idx`(`bankId`),
    PRIMARY KEY (`practiceId`, `bankId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_practice_rule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `practiceId` INTEGER NOT NULL,
    `questionType` VARCHAR(20) NOT NULL,
    `difficulty` VARCHAR(20) NOT NULL,
    `knowledgePointId` INTEGER NOT NULL,
    `drawCount` INTEGER NOT NULL,

    INDEX `exam_practice_rule_practiceId_idx`(`practiceId`),
    INDEX `exam_practice_rule_knowledgePointId_idx`(`knowledgePointId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_practice_participant` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `practiceId` INTEGER NOT NULL,
    `participantType` VARCHAR(20) NOT NULL,
    `internalUserId` INTEGER NULL,
    `externalCandidateId` INTEGER NULL,
    `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `exam_practice_participant_practiceId_idx`(`practiceId`),
    INDEX `exam_practice_participant_internalUserId_idx`(`internalUserId`),
    INDEX `exam_practice_participant_externalCandidateId_idx`(`externalCandidateId`),
    UNIQUE INDEX `exam_practice_participant_practiceId_participantType_interna_key`(`practiceId`, `participantType`, `internalUserId`),
    UNIQUE INDEX `exam_practice_participant_practiceId_participantType_externa_key`(`practiceId`, `participantType`, `externalCandidateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_practice_setting` (
    `practiceId` INTEGER NOT NULL,
    `allowRepeat` BOOLEAN NOT NULL DEFAULT true,
    `allowFeedback` BOOLEAN NOT NULL DEFAULT false,
    `showResultPerQuestion` BOOLEAN NOT NULL DEFAULT true,
    `showAnswer` BOOLEAN NOT NULL DEFAULT true,
    `showAnalysis` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`practiceId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_self_practice_config` (
    `bankId` INTEGER NOT NULL,
    `isOpen` BOOLEAN NOT NULL DEFAULT false,
    `openScope` VARCHAR(20) NOT NULL DEFAULT 'all',
    `maxQuestionsPerRound` INTEGER NOT NULL DEFAULT 0,
    `allowRepeat` BOOLEAN NOT NULL DEFAULT true,
    `allowFeedback` BOOLEAN NOT NULL DEFAULT false,
    `showResultPerQuestion` BOOLEAN NOT NULL DEFAULT true,
    `showAnswer` BOOLEAN NOT NULL DEFAULT true,
    `showAnalysis` BOOLEAN NOT NULL DEFAULT true,
    `createBy` INTEGER NULL,
    `tenantId` INTEGER NULL,
    `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updateTime` DATETIME(3) NOT NULL,

    INDEX `exam_self_practice_config_tenantId_idx`(`tenantId`),
    INDEX `exam_self_practice_config_createBy_idx`(`createBy`),
    PRIMARY KEY (`bankId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_self_practice_user` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bankId` INTEGER NOT NULL,
    `userType` VARCHAR(20) NOT NULL,
    `internalUserId` INTEGER NULL,
    `externalCandidateId` INTEGER NULL,
    `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `exam_self_practice_user_bankId_idx`(`bankId`),
    INDEX `exam_self_practice_user_internalUserId_idx`(`internalUserId`),
    INDEX `exam_self_practice_user_externalCandidateId_idx`(`externalCandidateId`),
    UNIQUE INDEX `exam_self_practice_user_bankId_userType_internalUserId_key`(`bankId`, `userType`, `internalUserId`),
    UNIQUE INDEX `exam_self_practice_user_bankId_userType_externalCandidateId_key`(`bankId`, `userType`, `externalCandidateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_self_practice_kp` (
    `bankId` INTEGER NOT NULL,
    `knowledgePointId` INTEGER NOT NULL,

    INDEX `exam_self_practice_kp_knowledgePointId_idx`(`knowledgePointId`),
    PRIMARY KEY (`bankId`, `knowledgePointId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_practice_record` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `practiceId` INTEGER NULL,
    `sourceType` VARCHAR(20) NOT NULL DEFAULT 'assigned',
    `sourceName` VARCHAR(200) NOT NULL,
    `userType` VARCHAR(20) NOT NULL,
    `internalUserId` INTEGER NULL,
    `externalCandidateId` INTEGER NULL,
    `totalCount` INTEGER NOT NULL DEFAULT 0,
    `answeredCount` INTEGER NOT NULL DEFAULT 0,
    `correctCount` INTEGER NOT NULL DEFAULT 0,
    `finished` BOOLEAN NOT NULL DEFAULT false,
    `finishTime` DATETIME(3) NULL,
    `tenantId` INTEGER NULL,
    `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updateTime` DATETIME(3) NOT NULL,

    INDEX `exam_practice_record_practiceId_idx`(`practiceId`),
    INDEX `exam_practice_record_internalUserId_idx`(`internalUserId`),
    INDEX `exam_practice_record_externalCandidateId_idx`(`externalCandidateId`),
    INDEX `exam_practice_record_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_practice_answer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recordId` INTEGER NOT NULL,
    `questionId` INTEGER NOT NULL,
    `questionNo` INTEGER NOT NULL,
    `candidateAnswer` TEXT NULL,
    `standardAnswer` TEXT NULL,
    `isCorrect` BOOLEAN NULL,
    `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `exam_practice_answer_recordId_idx`(`recordId`),
    INDEX `exam_practice_answer_questionId_idx`(`questionId`),
    UNIQUE INDEX `exam_practice_answer_recordId_questionNo_key`(`recordId`, `questionNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_message_read` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userType` VARCHAR(20) NOT NULL,
    `internalUserId` INTEGER NULL,
    `externalCandidateId` INTEGER NULL,
    `messageKey` VARCHAR(64) NOT NULL,
    `readTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `exam_message_read_userType_internalUserId_idx`(`userType`, `internalUserId`),
    INDEX `exam_message_read_userType_externalCandidateId_idx`(`userType`, `externalCandidateId`),
    UNIQUE INDEX `exam_message_read_userType_internalUserId_messageKey_key`(`userType`, `internalUserId`, `messageKey`),
    UNIQUE INDEX `exam_message_read_userType_externalCandidateId_messageKey_key`(`userType`, `externalCandidateId`, `messageKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `exam_answer_sheet_candidateType_internalUserId_idx` ON `exam_answer_sheet`(`candidateType`, `internalUserId`);

-- CreateIndex
CREATE INDEX `exam_answer_sheet_candidateType_externalCandidateId_idx` ON `exam_answer_sheet`(`candidateType`, `externalCandidateId`);

-- CreateIndex
CREATE INDEX `exam_cert_project_createBy_idx` ON `exam_cert_project`(`createBy`);

-- CreateIndex
CREATE UNIQUE INDEX `exam_exam_candidate_examId_candidateType_internalUserId_key` ON `exam_exam_candidate`(`examId`, `candidateType`, `internalUserId`);

-- CreateIndex
CREATE UNIQUE INDEX `exam_exam_candidate_examId_candidateType_externalCandidateId_key` ON `exam_exam_candidate`(`examId`, `candidateType`, `externalCandidateId`);

-- AddForeignKey
ALTER TABLE `exam_snapshot` ADD CONSTRAINT `exam_snapshot_examId_fkey` FOREIGN KEY (`examId`) REFERENCES `exam_exam`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_practice_bank` ADD CONSTRAINT `exam_practice_bank_practiceId_fkey` FOREIGN KEY (`practiceId`) REFERENCES `exam_practice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_practice_bank` ADD CONSTRAINT `exam_practice_bank_bankId_fkey` FOREIGN KEY (`bankId`) REFERENCES `exam_question_bank`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_practice_rule` ADD CONSTRAINT `exam_practice_rule_practiceId_fkey` FOREIGN KEY (`practiceId`) REFERENCES `exam_practice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_practice_participant` ADD CONSTRAINT `exam_practice_participant_practiceId_fkey` FOREIGN KEY (`practiceId`) REFERENCES `exam_practice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_practice_participant` ADD CONSTRAINT `exam_practice_participant_externalCandidateId_fkey` FOREIGN KEY (`externalCandidateId`) REFERENCES `exam_external_candidate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_practice_setting` ADD CONSTRAINT `exam_practice_setting_practiceId_fkey` FOREIGN KEY (`practiceId`) REFERENCES `exam_practice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_self_practice_config` ADD CONSTRAINT `exam_self_practice_config_bankId_fkey` FOREIGN KEY (`bankId`) REFERENCES `exam_question_bank`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_self_practice_user` ADD CONSTRAINT `exam_self_practice_user_bankId_fkey` FOREIGN KEY (`bankId`) REFERENCES `exam_self_practice_config`(`bankId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_self_practice_user` ADD CONSTRAINT `exam_self_practice_user_externalCandidateId_fkey` FOREIGN KEY (`externalCandidateId`) REFERENCES `exam_external_candidate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_self_practice_kp` ADD CONSTRAINT `exam_self_practice_kp_bankId_fkey` FOREIGN KEY (`bankId`) REFERENCES `exam_self_practice_config`(`bankId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_self_practice_kp` ADD CONSTRAINT `exam_self_practice_kp_knowledgePointId_fkey` FOREIGN KEY (`knowledgePointId`) REFERENCES `exam_knowledge_point`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_practice_record` ADD CONSTRAINT `exam_practice_record_practiceId_fkey` FOREIGN KEY (`practiceId`) REFERENCES `exam_practice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_practice_answer` ADD CONSTRAINT `exam_practice_answer_recordId_fkey` FOREIGN KEY (`recordId`) REFERENCES `exam_practice_record`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_practice_answer` ADD CONSTRAINT `exam_practice_answer_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `exam_question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

