-- 知识点分类新增「知识点编号」列（全局唯一、非空）
--
-- 编号规则与题库编码（exam_question_bank.code）保持一致：可手填、留空由后端自动生成、
-- 全局唯一。刻意不做层级编码（如 01.01.02）——父级移动或删除会牵连整棵子树的编号重算，
-- 而本表支持任意层级的新增子级，代价不对等。
--
-- 分三步而不是一条 ALTER 带 NOT NULL：存量行没有编号，直接建非空唯一列会因
-- 默认空串重复而报 Duplicate entry。故先建可空列 → 回填 → 再收紧为非空 + 唯一。

-- 1) 先建可空列，存量行暂为 NULL
ALTER TABLE `exam_knowledge_point` ADD COLUMN `code` VARCHAR(30) NULL;

-- 2) 回填存量行：KP + 至少 8 位左补零的主键，天然唯一且稳定（同一行重跑结果一致）
--
-- 补零宽度取 GREATEST(8, LENGTH(id)) 而不是写死 8：MySQL 的 LPAD(str, len, pad) 在
-- str 比 len 长时是「截断」而非保留原值，写死 8 会让 id 达到 9 位后
-- 123456789 与 123456780 都被截成 12345678，两行回填出同一个编号——
-- UPDATE 阶段不校验唯一性，要等下面第 3 步建唯一索引时才报 Duplicate entry，
-- 即在生产迁移执行中途失败。取 GREATEST 后永不截断，位数不足才补零。
UPDATE `exam_knowledge_point`
SET `code` = CONCAT('KP', LPAD(`id`, GREATEST(8, LENGTH(`id`)), '0'))
WHERE `code` IS NULL OR `code` = '';

-- 3) 收紧约束：回填完成后再置为非空并加唯一索引
ALTER TABLE `exam_knowledge_point` MODIFY COLUMN `code` VARCHAR(30) NOT NULL;

CREATE UNIQUE INDEX `exam_knowledge_point_code_key` ON `exam_knowledge_point`(`code`);
