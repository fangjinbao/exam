-- 移除人脸核身、考中抓拍、音视频监控、回看修改四项功能
-- 说明：这四项开关及其配套的录像/抓拍存储整体下线，相关表与列一并删除。
-- 数据影响：exam_recording 与 exam_snapshot 内的历史记录不可恢复；
-- uploads/ 下已落盘的 face-* / snapshot-* 图片文件不受本迁移影响（如需清理请单独处理）。

-- 1. 删除考试录像表（依赖 avScreenMonitor 开关，无其他表引用）
DROP TABLE IF EXISTS `exam_recording`;

-- 2. 删除考中抓拍表（依赖 snapshotDuringExam 与 faceVerify 开关，无其他表引用）
DROP TABLE IF EXISTS `exam_snapshot`;

-- 3. 移除 exam_setting 上的四项开关及抓拍间隔配置
ALTER TABLE `exam_setting`
  DROP COLUMN `faceVerify`,
  DROP COLUMN `snapshotDuringExam`,
  DROP COLUMN `snapshotInterval`,
  DROP COLUMN `avScreenMonitor`,
  DROP COLUMN `allowBacktrack`;

-- 4. 移除考生分配上的人脸核验标记（人脸核身下线后恒为默认值，无保留意义）
ALTER TABLE `exam_exam_candidate`
  DROP COLUMN `faceVerified`,
  DROP COLUMN `faceVerifyTime`;
