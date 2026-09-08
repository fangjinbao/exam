-- 题目↔知识点：多对一 → 多对多；分值：可空整数 → 必填浮点(2 位小数在应用层限制)

-- 1) 新建多对多中间表
CREATE TABLE `exam_question_knowledge_point` (
    `questionId` INTEGER NOT NULL,
    `knowledgePointId` INTEGER NOT NULL,

    INDEX `exam_question_knowledge_point_knowledgePointId_idx`(`knowledgePointId`),
    PRIMARY KEY (`questionId`, `knowledgePointId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2) 迁移存量数据：把每题原单知识点搬入中间表
INSERT INTO `exam_question_knowledge_point` (`questionId`, `knowledgePointId`)
SELECT `id`, `knowledgePointId` FROM `exam_question`;

-- 3) 中间表外键（题目删除级联；知识点删除受保护 RESTRICT，与业务删除保护一致）
ALTER TABLE `exam_question_knowledge_point`
    ADD CONSTRAINT `exam_question_knowledge_point_questionId_fkey`
    FOREIGN KEY (`questionId`) REFERENCES `exam_question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `exam_question_knowledge_point`
    ADD CONSTRAINT `exam_question_knowledge_point_knowledgePointId_fkey`
    FOREIGN KEY (`knowledgePointId`) REFERENCES `exam_knowledge_point`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4) 删除 exam_question 旧知识点外键、索引与列
ALTER TABLE `exam_question` DROP FOREIGN KEY `exam_question_knowledgePointId_fkey`;
DROP INDEX `exam_question_knowledgePointId_idx` ON `exam_question`;
ALTER TABLE `exam_question` DROP COLUMN `knowledgePointId`;

-- 5) 分值：可空整数 → 必填浮点。先给存量 NULL 兜底为 1，再改列为 NOT NULL DOUBLE
UPDATE `exam_question` SET `suggestedScore` = 1 WHERE `suggestedScore` IS NULL;
ALTER TABLE `exam_question` MODIFY COLUMN `suggestedScore` DOUBLE NOT NULL;
