-- CreateTable
CREATE TABLE `exam_question_favorite` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NULL,
    `userType` VARCHAR(20) NOT NULL,
    `internalUserId` INTEGER NULL,
    `externalCandidateId` INTEGER NULL,
    `questionId` INTEGER NOT NULL,
    `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `exam_question_favorite_userType_internalUserId_idx`(`userType`, `internalUserId`),
    INDEX `exam_question_favorite_userType_externalCandidateId_idx`(`userType`, `externalCandidateId`),
    INDEX `exam_question_favorite_questionId_idx`(`questionId`),
    UNIQUE INDEX `uniq_favorite_internal`(`userType`, `internalUserId`, `questionId`),
    UNIQUE INDEX `uniq_favorite_external`(`userType`, `externalCandidateId`, `questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `exam_question_favorite` ADD CONSTRAINT `exam_question_favorite_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `exam_question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
