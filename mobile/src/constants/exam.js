/**
 * 文件名称：constants/exam.js - 考试域枚举与状态判定
 *
 * 功能描述：
 *   集中定义考试、答卷、消息、证书等业务状态枚举与展示文案
 *   取值与后端 Prisma schema 保持一致，全项目复用，不得另起名
 *
 * 使用方式：
 *   import { EXAM_STATUS, getExamStatusText } from '@/constants/exam'
 */

/**
 * 考试状态枚举
 * 与后端 Exam.status 一致：published 到开始时间进入 ongoing、到结束时间进入 finished
 */
export const EXAM_STATUS = {
  UNPUBLISHED: 'unpublished', // 未发布（考生端不可见）
  PUBLISHED: 'published', // 已发布，未到开始时间
  ONGOING: 'ongoing', // 进行中
  FINISHED: 'finished' // 已结束
}

/** 考试状态展示文案（考生视角） */
export const EXAM_STATUS_TEXT = {
  [EXAM_STATUS.PUBLISHED]: '未开始',
  [EXAM_STATUS.ONGOING]: '进行中',
  [EXAM_STATUS.FINISHED]: '已结束'
}

/** 考试状态对应的 Vant 标签类型 */
export const EXAM_STATUS_TAG = {
  [EXAM_STATUS.PUBLISHED]: 'warning',
  [EXAM_STATUS.ONGOING]: 'success',
  [EXAM_STATUS.FINISHED]: 'default'
}

/**
 * 阅卷状态枚举（与后端 AnswerSheet.gradeStatus 一致）
 */
export const GRADE_STATUS = {
  PENDING: 'pending', // 待阅卷
  AI_GRADING: 'ai_grading', // AI阅卷中
  PENDING_REVIEW: 'pending_review', // 待复核
  COMPLETED: 'completed' // 已完成
}

/** 题型枚举（与后端 Question.type 一致） */
/**
 * 题型枚举
 * 取值必须与后端字典 question_type 一致（single/multiple/judge/blank/qa/essay），
 * 不是直觉的 fill/short——填空是 blank、问答是 qa，写错会导致题型分支匹配不上，
 * 输入框渲染成选择题。
 */
export const QUESTION_TYPE = {
  SINGLE: 'single', // 单选题
  MULTIPLE: 'multiple', // 多选题
  JUDGE: 'judge', // 判断题
  BLANK: 'blank', // 填空题
  QA: 'qa', // 问答题
  ESSAY: 'essay', // 论述题
  // 材料题：只承载共享材料，本身不可作答，作答位由其小题产生。
  // 后端取卷时会把材料题与其小题一同下发，小题带 parentId 指回材料题。
  COMPOSITE: 'composite'
}

/** 题型展示文案 */
export const QUESTION_TYPE_TEXT = {
  [QUESTION_TYPE.SINGLE]: '单选题',
  [QUESTION_TYPE.MULTIPLE]: '多选题',
  [QUESTION_TYPE.JUDGE]: '判断题',
  [QUESTION_TYPE.BLANK]: '填空题',
  [QUESTION_TYPE.QA]: '问答题',
  [QUESTION_TYPE.ESSAY]: '论述题',
  [QUESTION_TYPE.COMPOSITE]: '材料题'
}

/** 消息类型枚举（SRS 3.5.16.3） */
export const MESSAGE_TYPE = {
  EXAM_NOTICE: 'exam_notice', // 考试通知
  APPLY_RESULT: 'apply_result', // 报考审核结果
  SCORE_RELEASE: 'score_release' // 成绩发布
}

/** 消息类型展示文案 */
export const MESSAGE_TYPE_TEXT = {
  [MESSAGE_TYPE.EXAM_NOTICE]: '考试通知',
  [MESSAGE_TYPE.APPLY_RESULT]: '报考审核结果',
  [MESSAGE_TYPE.SCORE_RELEASE]: '成绩发布'
}

/** 消息类型对应的 Vant 标签类型 */
export const MESSAGE_TYPE_TAG = {
  [MESSAGE_TYPE.EXAM_NOTICE]: 'primary',
  [MESSAGE_TYPE.APPLY_RESULT]: 'warning',
  [MESSAGE_TYPE.SCORE_RELEASE]: 'success'
}

/** 证书状态枚举（SRS 3.5.16.4） */
export const CERT_STATUS = {
  VALID: 'valid', // 有效
  EXPIRED: 'expired' // 已过期
}

/** 证书状态展示文案 */
export const CERT_STATUS_TEXT = {
  [CERT_STATUS.VALID]: '有效',
  [CERT_STATUS.EXPIRED]: '已过期'
}

/**
 * 按当前时间与考试起止时间判定考试状态
 * SRS 3.5.16.1 业务规则：状态由系统自动判定，不支持人工调整
 * @param {string} startTime - 考试开始时间
 * @param {string} endTime - 考试结束时间
 * @returns {string} EXAM_STATUS 中的状态值
 */
export const resolveExamStatus = (startTime, endTime) => {
  // 时间缺失时回退为「未开始」。此判断专为 null 而设：new Date(null) 得到纪元 0
  // 而非 NaN，单靠下方 NaN 守卫会让缺时间的考试一路走到时间比较、被误判为「已结束」
  //（undefined 与空串解析即为 NaN，本就由下方守卫兜住）。
  // 用 == null 而非 falsy 判断，避免误伤数字时间戳 0（1970-01-01 是合法时间）
  if (startTime == null || endTime == null) return EXAM_STATUS.PUBLISHED

  const now = Date.now()
  const start = new Date(startTime).getTime()
  const end = new Date(endTime).getTime()

  if (Number.isNaN(start) || Number.isNaN(end)) return EXAM_STATUS.PUBLISHED
  if (now < start) return EXAM_STATUS.PUBLISHED
  if (now > end) return EXAM_STATUS.FINISHED
  return EXAM_STATUS.ONGOING
}

/**
 * 获取考试状态展示文案
 * @param {string} status - 考试状态值
 * @returns {string} 展示文案，未知状态返回「未知」
 */
export const getExamStatusText = (status) => {
  return EXAM_STATUS_TEXT[status] || '未知'
}

/**
 * 获取考试状态标签类型
 * @param {string} status - 考试状态值
 * @returns {string} Vant Tag 的 type 值
 */
export const getExamStatusTag = (status) => {
  return EXAM_STATUS_TAG[status] || 'default'
}


