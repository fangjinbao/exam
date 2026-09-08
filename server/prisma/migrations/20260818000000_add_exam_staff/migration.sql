-- 新增「考试工作人员指派」表（监考 / 阅卷）
--
-- 背景：监考子系统此前已整体下线（见 20260816010000_remove_proctor_center，
-- exam_proctor_assignment 表与 proctor 角色均已删除）。本次不恢复监考中心菜单与监考端，
-- 仅在考试上重新支持「指派监考人员 / 阅卷人员」，故新建独立表而非复原旧表。
--
-- 设计：监考与阅卷两类名单字段完全相同，照 exam_exam_candidate 用 candidateType
-- 区分内外部的同款做法，用 role 判别列区分岗位，不拆两张表。
-- name 存姓名快照：人员改名或停用后名单仍可回溯，与考生姓名快照同理。
CREATE TABLE IF NOT EXISTS `exam_exam_staff` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `examId`     INT          NOT NULL,
  `role`       VARCHAR(20)  NOT NULL,
  `userId`     INT          NOT NULL,
  `name`       VARCHAR(50)  NOT NULL,
  `createTime` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  -- 同一人在同一场考试的同一岗位只应有一条记录，防重复指派
  UNIQUE INDEX `uniq_exam_staff`(`examId`, `role`, `userId`),
  -- 复合索引服务于阅卷中心「按指派过滤」的相关子查询（按 examId + role 命中）
  INDEX `exam_exam_staff_examId_role_idx`(`examId`, `role`),
  INDEX `exam_exam_staff_userId_idx`(`userId`),
  -- 外键写在建表语句内而非单独 ALTER：保证整条迁移幂等，
  -- 否则表已存在时 CREATE 被跳过、ALTER 仍会因约束名重复而报错
  CONSTRAINT `exam_exam_staff_examId_fkey`
    FOREIGN KEY (`examId`) REFERENCES `exam_exam`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
