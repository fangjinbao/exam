-- DropForeignKey
ALTER TABLE `exam_setting` DROP FOREIGN KEY `exam_anti_cheat_config_examId_fkey`;

-- AlterTable
ALTER TABLE `exam_certificate_template` ADD COLUMN `backgroundImage` VARCHAR(255) NULL,
    ADD COLUMN `content` TEXT NULL,
    ADD COLUMN `size` INTEGER NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE `exam_cert_project` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `description` VARCHAR(500) NULL,
    `examId` INTEGER NOT NULL,
    `applyCondition` VARCHAR(500) NULL,
    `validMonths` INTEGER NOT NULL,
    `templateId` INTEGER NOT NULL,
    `status` INTEGER NOT NULL DEFAULT 1,
    `tenantId` INTEGER NULL,
    `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updateTime` DATETIME(3) NOT NULL,

    UNIQUE INDEX `exam_cert_project_name_key`(`name`),
    INDEX `exam_cert_project_examId_idx`(`examId`),
    INDEX `exam_cert_project_templateId_idx`(`templateId`),
    INDEX `exam_cert_project_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_cert_application` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `candidateType` VARCHAR(20) NOT NULL,
    `internalUserId` INTEGER NULL,
    `externalCandidateId` INTEGER NULL,
    `candidateName` VARCHAR(50) NOT NULL,
    `applyTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `reviewerId` INTEGER NULL,
    `reviewerName` VARCHAR(50) NULL,
    `rejectReason` VARCHAR(200) NULL,
    `reviewTime` DATETIME(3) NULL,
    `tenantId` INTEGER NULL,
    `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updateTime` DATETIME(3) NOT NULL,

    INDEX `exam_cert_application_projectId_idx`(`projectId`),
    INDEX `exam_cert_application_status_idx`(`status`),
    INDEX `exam_cert_application_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_proctor_assignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `examId` INTEGER NOT NULL,
    `proctorUserId` INTEGER NOT NULL,
    `proctorName` VARCHAR(50) NOT NULL,
    `tenantId` INTEGER NULL,
    `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `exam_proctor_assignment_examId_idx`(`examId`),
    INDEX `exam_proctor_assignment_proctorUserId_idx`(`proctorUserId`),
    INDEX `exam_proctor_assignment_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `exam_proctor_assignment_examId_proctorUserId_key`(`examId`, `proctorUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_abnormal_event` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `examId` INTEGER NOT NULL,
    `candidateType` VARCHAR(20) NOT NULL,
    `internalUserId` INTEGER NULL,
    `externalCandidateId` INTEGER NULL,
    `candidateName` VARCHAR(50) NOT NULL,
    `eventType` VARCHAR(30) NOT NULL,
    `occurTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `description` VARCHAR(500) NULL,
    `handleStatus` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `handleResult` VARCHAR(20) NULL,
    `handleOpinion` VARCHAR(200) NULL,
    `handlerId` INTEGER NULL,
    `handlerName` VARCHAR(50) NULL,
    `handleTime` DATETIME(3) NULL,
    `tenantId` INTEGER NULL,
    `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `exam_abnormal_event_examId_idx`(`examId`),
    INDEX `exam_abnormal_event_eventType_idx`(`eventType`),
    INDEX `exam_abnormal_event_handleStatus_idx`(`handleStatus`),
    INDEX `exam_abnormal_event_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_recording` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `examId` INTEGER NOT NULL,
    `candidateType` VARCHAR(20) NOT NULL,
    `internalUserId` INTEGER NULL,
    `externalCandidateId` INTEGER NULL,
    `candidateName` VARCHAR(50) NOT NULL,
    `duration` INTEGER NOT NULL DEFAULT 0,
    `recordStatus` VARCHAR(20) NOT NULL DEFAULT 'none',
    `videoUrl` VARCHAR(255) NULL,
    `tenantId` INTEGER NULL,
    `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updateTime` DATETIME(3) NOT NULL,

    INDEX `exam_recording_examId_idx`(`examId`),
    INDEX `exam_recording_recordStatus_idx`(`recordStatus`),
    INDEX `exam_recording_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_certificate` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `certNo` VARCHAR(50) NOT NULL,
    `projectId` INTEGER NOT NULL,
    `templateId` INTEGER NOT NULL,
    `candidateType` VARCHAR(20) NOT NULL,
    `internalUserId` INTEGER NULL,
    `externalCandidateId` INTEGER NULL,
    `candidateName` VARCHAR(50) NOT NULL,
    `answerSheetId` INTEGER NULL,
    `issueDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expireDate` DATETIME(3) NOT NULL,
    `tenantId` INTEGER NULL,
    `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updateTime` DATETIME(3) NOT NULL,

    UNIQUE INDEX `exam_certificate_certNo_key`(`certNo`),
    INDEX `exam_certificate_projectId_idx`(`projectId`),
    INDEX `exam_certificate_templateId_idx`(`templateId`),
    INDEX `exam_certificate_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `exam_setting` ADD CONSTRAINT `exam_setting_examId_fkey` FOREIGN KEY (`examId`) REFERENCES `exam_exam`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_cert_project` ADD CONSTRAINT `exam_cert_project_examId_fkey` FOREIGN KEY (`examId`) REFERENCES `exam_exam`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_cert_project` ADD CONSTRAINT `exam_cert_project_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `exam_certificate_template`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_cert_application` ADD CONSTRAINT `exam_cert_application_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `exam_cert_project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_proctor_assignment` ADD CONSTRAINT `exam_proctor_assignment_examId_fkey` FOREIGN KEY (`examId`) REFERENCES `exam_exam`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_abnormal_event` ADD CONSTRAINT `exam_abnormal_event_examId_fkey` FOREIGN KEY (`examId`) REFERENCES `exam_exam`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_recording` ADD CONSTRAINT `exam_recording_examId_fkey` FOREIGN KEY (`examId`) REFERENCES `exam_exam`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_certificate` ADD CONSTRAINT `exam_certificate_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `exam_cert_project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_certificate` ADD CONSTRAINT `exam_certificate_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `exam_certificate_template`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

