-- 题目纠错反馈表
--
-- 只建新表，不含任何既有表的变更。
-- 注意：`prisma migrate diff` 生成的脚本里会额外带出若干既有表的
-- RenameIndex（如 uniq_favorite_external → exam_question_favorite_...）
-- 与 exam_certificate 的 AddForeignKey，那些是存量迁移与 schema 的历史漂移，
-- 与本次无关且有害——代码里按 `uniq_favorite_external` 这个名字使用复合唯一键
-- （见 app-practice.service.ts 的 toggleFavorite），改名会直接让收藏功能报错。
-- 故本文件手写，只保留本次新增的表。

-- CreateTable
CREATE TABLE `exam_question_feedback` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `questionId` INTEGER NOT NULL,
    `practiceId` INTEGER NULL,
    `userType` VARCHAR(20) NOT NULL,
    `internalUserId` INTEGER NULL,
    `externalCandidateId` INTEGER NULL,
    `type` VARCHAR(20) NOT NULL,
    `content` VARCHAR(500) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `handleRemark` VARCHAR(500) NULL,
    `handleBy` INTEGER NULL,
    `handleTime` DATETIME(3) NULL,
    `tenantId` INTEGER NULL,
    `createTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updateTime` DATETIME(3) NOT NULL,

    INDEX `exam_question_feedback_questionId_idx`(`questionId`),
    INDEX `exam_question_feedback_status_idx`(`status`),
    INDEX `exam_question_feedback_practiceId_idx`(`practiceId`),
    INDEX `exam_question_feedback_tenantId_idx`(`tenantId`),
    -- 内外部各自唯一，MySQL 唯一索引允许多个 NULL，两条互不干扰。
    -- 判重靠这两条约束（插入撞约束即已反馈过），不用先查后插——
    -- 后者在同一人并发提交时会各插一条。
    UNIQUE INDEX `uniq_feedback_internal`(`userType`, `internalUserId`, `questionId`),
    UNIQUE INDEX `uniq_feedback_external`(`userType`, `externalCandidateId`, `questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `exam_question_feedback` ADD CONSTRAINT `exam_question_feedback_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `exam_question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 自主练习的范围标识落库
--
-- 原先自主练习的记录只存了 sourceName（题库名快照），带来三个问题：
-- 1) 断点续练按「practiceId + sourceType」找未完成记录，而自主练习这两列恒为
--    null/'self'，A 题库练一半再进 B 题库会串到 A 的题；
-- 2) allowRepeat 与展示开关都存在 SelfPracticeConfig（主键是 bankId），
--    靠题库名匹配时管理员一改名就静默失效；
-- 3) 提交接口无从反查自主练习的 showResultPerQuestion。
--
-- 两列可空：存量记录没有值，代码里按「回落到 sourceName 快照」兼容，
-- 不做数据回填——旧记录的题库可能已改名或删除，反推并不可靠。
ALTER TABLE `exam_practice_record`
  ADD COLUMN `selfBankId` INTEGER NULL,
  ADD COLUMN `selfKnowledgePointId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `exam_practice_record_selfBankId_idx` ON `exam_practice_record`(`selfBankId`);
