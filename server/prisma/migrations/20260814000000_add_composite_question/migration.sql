-- 子母题（材料题）支持：Question 自引用出母题-小题层级
-- parentId 为 null 表示独立题或母题本身，非 null 表示挂在某道 composite 母题下的小题
-- stemText 是题干去 HTML 标签后的纯文本镜像，供搜索/导出/纯文本展示使用
--   （题干支持富文本后，搜索若仍打 stem 会命中标签名）

-- AlterTable
ALTER TABLE `exam_question`
    ADD COLUMN `parentId` INTEGER NULL,
    ADD COLUMN `sortNo` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `stemText` TEXT NULL;

-- CreateIndex
CREATE INDEX `exam_question_parentId_idx` ON `exam_question`(`parentId`);

-- AddForeignKey
-- 母题删除时级联删除其小题
ALTER TABLE `exam_question` ADD CONSTRAINT `exam_question_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `exam_question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 回填 stemText：存量题干本就是纯文本，直接复制即可
UPDATE `exam_question` SET `stemText` = `stem` WHERE `stemText` IS NULL;
