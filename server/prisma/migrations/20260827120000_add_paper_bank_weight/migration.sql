-- 随机试卷题库抽题权重
--
-- 每条抽题规则的抽取数量按各库权重拆分（最大余数法），避免题目多的库被抽光、
-- 其余库几乎不出题。随机卷各库权重合计为 1；固定卷不使用该字段。
--
-- 默认 0：存量数据与固定卷都是 0，抽题时按均分处理（见 allocateByWeight），
-- 与旧行为「各库不作区分」等价，不会因缺权重而组不出卷。
ALTER TABLE `exam_paper_bank` ADD COLUMN `weight` DOUBLE NOT NULL DEFAULT 0;
