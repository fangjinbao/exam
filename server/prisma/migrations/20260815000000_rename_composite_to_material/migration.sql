-- 题型字典改名：「母题（材料题）」→「材料题」
--
-- 「材料题」是这类题的通行叫法，「母题」只在实现层描述父子结构。
-- 字典项的 value（composite）不变，仅改展示名，故不影响任何存量题目数据。
--
-- 按 value 定位而非按旧名匹配：管理员可能已在数据字典页手工改过名字，
-- 用旧名做条件会漏掉这种库。
UPDATE `dict_info` di
JOIN `dict_type` dt ON dt.`id` = di.`typeId`
SET di.`name` = '材料题'
WHERE dt.`key` = 'question_type'
  AND di.`value` = 'composite'
  AND di.`name` <> '材料题';
