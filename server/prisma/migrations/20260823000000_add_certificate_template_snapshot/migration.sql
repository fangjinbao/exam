-- 证书新增「模板快照」列：已下发的证书不再随模板改版而变
--
-- 此前证书详情是联表读 exam_certificate_template 的当前值，模板一改标题/底图/版式，
-- 已经发到考生手上的证书跟着变。证书是凭据，凭据不能事后变形。
-- 改为发证时把模板中参与渲染的字段整份留存，读取一律以快照为准。
-- 与 exam_certificate.candidateName「发证时冗余留存」是同一条原则。
--
-- 列可空而非非空：存量证书发证时还没有这一列，无从补出它们当初的样子。
-- 读取侧对 NULL 有回退（读模板当前值），故不需要 NOT NULL 约束。

-- 1) 建列
ALTER TABLE `exam_certificate` ADD COLUMN `templateSnapshot` TEXT NULL;

-- 2) 回填存量证书：按模板「当前」值定格
--
-- 这不是还原它们最初发出时的样子——那份数据从未留存，已不可恢复。
-- 回填的意义是就地定格：从此这些证书不再随模板继续漂移。
-- 字段顺序与结构须与 modules/exam/utils/cert-template-snapshot.ts 的
-- CertTemplateSnapshot 一致；content 作为字符串嵌入（它本身是版式 JSON 文本）。
UPDATE `exam_certificate` `c`
JOIN `exam_certificate_template` `t` ON `t`.`id` = `c`.`templateId`
SET `c`.`templateSnapshot` = JSON_OBJECT(
  'title', `t`.`title`,
  'issuingOrg', `t`.`issuingOrg`,
  'description', `t`.`description`,
  'size', `t`.`size`,
  'backgroundImage', `t`.`backgroundImage`,
  'sealImage', `t`.`sealImage`,
  'content', `t`.`content`
)
WHERE `c`.`templateSnapshot` IS NULL;
