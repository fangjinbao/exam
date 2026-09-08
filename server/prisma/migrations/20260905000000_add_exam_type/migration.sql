-- 考试新增「考试类型」：普通考试 / 技能鉴定考试
--
-- 背景：原先「关联鉴定项目」藏在发证设置里，作为发证方式的一个选项（按认证项目发证）。
-- 但鉴定项目表上既没有证书模板字段、也没有有效期字段，而发证逻辑
-- （grading.service.ts issueCertificate）只认 exam.certTemplateId，无模板直接抛错。
-- 也就是说选「按认证项目」必然发不出证——界面上写着「取项目的模板与有效期」，
-- 后端没有一行代码从项目取这两样东西。该选项本身不成立，故下线。
--
-- 改后语义：项目关联上移为考试的顶层类型。examType=skill 时必须绑定鉴定项目，
-- 考生名单由该项目审核通过（status=approved）的报名记录全量派生、不接受手工增删。
-- 发证与类型解耦：技能鉴定考试要发证同样得单独指定证书模板，两者不再互斥。
--
-- 数据影响：certProjectId 列保留复用（语义完全同一，避免再加一个表达同件事的列）。
-- 存量 6 场考试该列全为 NULL，从未被使用过，故无需回填或清理，也不会有
-- 「普通考试却挂着项目」的脏数据。

-- 1. 加列。默认 normal，存量行由 MySQL 直接填上默认值，天然归为普通考试
ALTER TABLE `exam_exam`
  ADD COLUMN `examType` VARCHAR(20) NOT NULL DEFAULT 'normal' AFTER `id`;

-- 2. 显式回填。上一步的默认值已经覆盖存量行，这一步是幂等兜底：
--    防止日后有人把列默认值挪走后重跑迁移，留下空串
UPDATE `exam_exam` SET `examType` = 'normal' WHERE `examType` = '' OR `examType` IS NULL;

-- 3. 按类型筛考试列表用（列表页要把两类考试区分开，它们的可操作性不同）
CREATE INDEX `exam_exam_examType_idx` ON `exam_exam`(`examType`);
