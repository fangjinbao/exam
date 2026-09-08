/**
 * 报名审核状态常量
 *
 * 单独成文件而非挂在某个 service 上：cert-enroll（数名额）与 cert-project
 * （判断能否撤回项目）都要用同一个口径，而项目比报名更基础，让 cert-project
 * 反向依赖 cert-enroll 不合适。
 */

/** 审核状态全集 */
export const APPLICATION_STATUS = ['pending', 'approved', 'rejected'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUS)[number];

/**
 * 占名额的状态：待审核与已通过都算占用，被驳回的释放名额
 *
 * 即驳回后该名额可以补报别人，也可以补报同一个人。
 */
export const OCCUPYING_STATUS: ApplicationStatus[] = ['pending', 'approved'];

/**
 * 审核通过
 *
 * 技能鉴定考试的考生名单按此状态从报名记录派生（见 ExamService
 * buildCandidatesFromCertProject）。单列成常量而不在那边裸写字符串，
 * 是因为这个文件的存在理由就是「状态口径只有一处」。
 */
export const APPROVED_STATUS: ApplicationStatus = 'approved';
