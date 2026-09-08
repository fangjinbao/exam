/**
 * 文件名称：mock/data/examData.js - 考试域业务种子数据
 *
 * 功能描述：
 *   考试、答卷、错题、成绩、证书、消息的共享 Mock 数据
 *   模块级变量持久化，作答/交卷/已读等写操作在同一会话内保持状态
 *
 * 使用方式：
 *   import { exams, answerSheets, messages } from '@/mock/data/examData'
 */

import { MESSAGE_TYPE, CERT_STATUS } from '@/constants/exam'

/** 一天的毫秒数，用于构造相对当前时间的考试起止时间 */
const DAY = 24 * 60 * 60 * 1000

/**
 * 构造相对当前时间的时间字符串
 * @param {number} offsetMs - 相对当前时间的毫秒偏移（负数为过去）
 * @returns {string} ISO 格式时间字符串
 */
const relativeTime = (offsetMs) => new Date(Date.now() + offsetMs).toISOString()

/**
 * 考试列表
 * 三场考试分别覆盖「未开始」「进行中」「已结束」三种状态，状态由起止时间实时判定
 * needFaceVerify 为 true 时进入作答前须完成人脸核身
 */
export const exams = [
  {
    id: 1,
    name: '2026年度安全生产知识考核',
    description: '覆盖安全生产法律法规与劳动防护用品使用规范，及格分 60 分。',
    startTime: relativeTime(-30 * 60 * 1000),
    endTime: relativeTime(2 * 60 * 60 * 1000),
    duration: 60,
    passScore: 60,
    totalScore: 100,
    needFaceVerify: true,
    needSnapshot: true,
    snapshotInterval: 60,
    // 允许重考 1 次（总机会 2 次）：交卷一次后仍留在待考提醒里并标「可重考 / 已考 1 次」
    retakeLimit: 1,
    questionIds: [101, 102, 103, 104]
  },
  {
    id: 2,
    name: '危险化学品管理专项考试',
    description: '危化品储存规范与泄漏应急处置，含简答题，及格分 60 分。',
    startTime: relativeTime(2 * DAY),
    endTime: relativeTime(2 * DAY + 90 * 60 * 1000),
    duration: 90,
    passScore: 60,
    totalScore: 100,
    needFaceVerify: false,
    needSnapshot: false,
    snapshotInterval: 0,
    // 不允许重考（总机会 1 次）：交卷后即从待考提醒移除
    retakeLimit: 0,
    questionIds: [201, 202, 203]
  },
  {
    id: 3,
    name: '消防安全应急处置考核',
    description: '初期火灾扑救与疏散逃生常识，本场考试已结束。',
    startTime: relativeTime(-5 * DAY),
    endTime: relativeTime(-5 * DAY + 60 * 60 * 1000),
    duration: 60,
    passScore: 60,
    totalScore: 100,
    needFaceVerify: false,
    needSnapshot: false,
    snapshotInterval: 0,
    // 不允许重考（总机会 1 次）：本场已结束，status 被判为 finished，无论是否交卷都不进待考
    retakeLimit: 0,
    questionIds: [301, 302]
  },
  /*
    已通过并发证的场次。补这条是因为原先两条答卷分别是「未及格」与「待阅卷」，
    「已发布且及格」这个状态在本地跑不出来，结果页的证书卡也就无法验证。
    autoIssueCert 与 certificate 对应真实接口的 Exam.autoIssueCert 与
    按 answerSheetId 反查到的证书；把 certificate 置 null 只留 autoIssueCert
    即可复现「该发未发」的 certPending 分支。
  */
  {
    id: 4,
    name: '特种作业操作证复审考核',
    description: '特种作业人员定期复审，通过后换发操作证，及格分 60 分。',
    startTime: relativeTime(-3 * DAY),
    endTime: relativeTime(-3 * DAY + 60 * 60 * 1000),
    duration: 60,
    /*
      总分与及格分按 questionIds 的实际分值给：题 101/102/103 分别 5/5/8 分，
      合计 18。写成 100/60 会与逐题得分脱节——成绩详情页的分数是按 checkAnswer
      实算的，结果页却回显答卷上写死的值，两页会显示互相矛盾的分数。
    */
    passScore: 11,
    totalScore: 18,
    needFaceVerify: false,
    needSnapshot: false,
    snapshotInterval: 0,
    retakeLimit: 0,
    questionIds: [101, 102, 103],
    // 通过后自动发证
    autoIssueCert: true,
    certificate: {
      // id 必须与下方 certificates 数组不冲突：结果页点整卡跳
      // /profile/certificates/:id，mock 的证书详情按该 id 在 certificates 里查，
      // 撞号会让点进去看到的是另一张证书。6001/6002 已被占用。
      id: 6003,
      name: '特种作业操作资格证书',
      code: 'TZ-2026-000317',
      issuer: '中国石化销售企业培训中心',
      issueDate: '2026-08-17',
      validPeriod: '2026-08-17 至 2029-08-16',
      // 模板未配底图时为 null，前端回退到纯色占位
      backgroundImage: null
    }
  }
]

/**
 * 答卷记录
 * status: answering 作答中 / submitted 已交卷
 * answers: { [questionId]: 考生作答 }
 * scoreReleased 为 true 时考生可在「我的成绩」查看得分
 */
export const answerSheets = [
  {
    id: 9001,
    examId: 3,
    status: 'submitted',
    answers: { 301: 'C', 302: 'true' },
    objectiveScore: 5,
    subjectiveScore: 0,
    totalScore: 5,
    passed: false,
    scoreReleased: true,
    // startTime 与 submitTime 成对：成绩列表的「答题用时」按两者之差实算
    startTime: relativeTime(-5 * DAY),
    submitTime: relativeTime(-5 * DAY + 40 * 60 * 1000),
    switchCount: 1
  },
  /*
    待阅卷答卷（scoreReleased: false）。真实接口对「交了卷但成绩未发布」的记录
    照样返回，只是分数与及格判定为 null，前端显示「待阅卷」。
    mock 里原先只有一条已发布记录，这条状态在本地跑不出来。
  */
  {
    id: 9002,
    examId: 1,
    status: 'submitted',
    answers: { 101: 'B' },
    objectiveScore: null,
    subjectiveScore: null,
    totalScore: null,
    passed: null,
    scoreReleased: false,
    // 跨小时用时，用来验证「5 小时 36 分钟」这类进位文案
    startTime: relativeTime(-2 * DAY),
    submitTime: relativeTime(-2 * DAY + 336 * 60 * 1000),
    switchCount: 0
  },
  /*
    已发布且及格的答卷，对应考试 4（配了自动发证）。
    结果页的证书卡只在这个状态下出现，缺这条则该分支本地不可达。
  */
  {
    id: 9003,
    examId: 4,
    status: 'submitted',
    /*
      作答值必须符合各题型的格式，否则成绩详情页按 checkAnswer 实算会全判错：
      101 单选取选项键、102 判断题只接受 'true'/'false'、103 多选必须是数组。
      三题全对 = 5 + 5 + 8 = 18 分，与下方分数字段一致。
    */
    answers: { 101: 'B', 102: 'true', 103: ['A', 'B', 'C'] },
    objectiveScore: 18,
    subjectiveScore: 0,
    totalScore: 18,
    passed: true,
    scoreReleased: true,
    startTime: relativeTime(-3 * DAY),
    submitTime: relativeTime(-3 * DAY + 45 * 60 * 1000),
    switchCount: 0
  }
]

/**
 * 错题记录
 * source: exam 来自考试 / practice 来自练习
 */
export const wrongQuestions = [
  {
    id: 7001,
    questionId: 302,
    source: 'exam',
    sourceName: '消防安全应急处置考核',
    userAnswer: 'true',
    wrongTime: relativeTime(-5 * DAY + 40 * 60 * 1000)
  },
  {
    id: 7002,
    questionId: 202,
    source: 'practice',
    sourceName: '危险化学品管理',
    userAnswer: ['A', 'B'],
    wrongTime: relativeTime(-2 * DAY)
  },
  {
    id: 7003,
    questionId: 104,
    source: 'practice',
    sourceName: '安全生产基础知识',
    userAnswer: '定期更换',
    wrongTime: relativeTime(-1 * DAY)
  }
]

/** 练习作答记录数（首页「练习题数」统计用） */
export const practiceStat = { answeredCount: 26 }

/** 消息通知 */
export const messages = [
  {
    id: 5001,
    title: '您有一场安全生产知识考核待参加',
    type: MESSAGE_TYPE.EXAM_NOTICE,
    time: relativeTime(-60 * 60 * 1000),
    isRead: false,
    content:
      '您被分配参加「2026年度安全生产知识考核」，考试时长 60 分钟，及格分 60 分。本场考试开启人脸核身，请提前准备好本人身份核验。请在考试时间内进入工作台完成作答。'
  },
  {
    id: 5002,
    title: '危险化学品管理专项考试报考审核已通过',
    type: MESSAGE_TYPE.APPLY_RESULT,
    time: relativeTime(-1 * DAY),
    isRead: false,
    content:
      '您提交的「危险化学品管理专项考试」报考申请已通过审核。考试将于两日后开始，请留意考试时间并按时参加。'
  },
  {
    id: 5003,
    title: '消防安全应急处置考核成绩已发布',
    type: MESSAGE_TYPE.SCORE_RELEASE,
    time: relativeTime(-4 * DAY),
    isRead: true,
    content:
      '您参加的「消防安全应急处置考核」成绩已发布，本场得分 5 分，未达到及格分 60 分。可在「我的-我的成绩」查看作答详情，并在错题本中针对错题再次练习。'
  }
]

/** 错题记录自增 ID 起始值 */
let wrongSeed = 7100

/**
 * 写入错题本（同一题目已存在时只更新最近一次作答，不重复堆积）
 * @param {number} questionId - 题目 ID
 * @param {string} source - 来源：exam 考试 / practice 练习
 * @param {string} sourceName - 来源名称（考试名或题库名）
 * @param {string|string[]} userAnswer - 考生作答
 */
export const addWrongQuestion = (questionId, source, sourceName, userAnswer) => {
  const existed = wrongQuestions.find((item) => item.questionId === Number(questionId))
  const wrongTime = new Date().toISOString()

  if (existed) {
    existed.userAnswer = userAnswer
    existed.wrongTime = wrongTime
    existed.source = source
    existed.sourceName = sourceName
    return
  }

  wrongQuestions.push({
    id: (wrongSeed += 1),
    questionId: Number(questionId),
    source,
    sourceName,
    userAnswer,
    wrongTime
  })
}

/**
 * 答对后从错题本移除
 * @param {number} questionId - 题目 ID
 */
export const removeWrongQuestion = (questionId) => {
  const index = wrongQuestions.findIndex((item) => item.questionId === Number(questionId))
  if (index > -1) {
    wrongQuestions.splice(index, 1)
  }
}

/** 已获证书 */
export const certificates = [
  {
    id: 6001,
    name: '安全生产基础知识合格证书',
    code: 'AQ-2026-000128',
    validPeriod: '2026-03-01 至 2029-02-28',
    status: CERT_STATUS.VALID,
    issueDate: '2026-03-01',
    // 与 validPeriod 后半段同值：列表页展示区间，详情页单列截止日
    expireDate: '2029-02-28',
    issuer: '中国石化销售企业培训中心'
  },
  {
    id: 6002,
    name: '特种作业操作资格证书',
    code: 'TZ-2023-004512',
    validPeriod: '2023-05-10 至 2026-05-09',
    status: CERT_STATUS.EXPIRED,
    issueDate: '2023-05-10',
    expireDate: '2026-05-09',
    issuer: '中国石化销售企业培训中心'
  },
  /*
    考试 4 通过后所发的证书，与该考试 certificate 字段的 id/编号/有效期保持一致。
    补这条是因为结果页的证书卡点进去查的是本数组：只在考试上挂 certificate
    而这里没有对应记录，跳过去会 404。两处数据必须对得上。
  */
  {
    id: 6003,
    name: '特种作业操作资格证书',
    code: 'TZ-2026-000317',
    validPeriod: '2026-08-17 至 2029-08-16',
    status: CERT_STATUS.VALID,
    issueDate: '2026-08-17',
    expireDate: '2029-08-16',
    issuer: '中国石化销售企业培训中心'
  }
]


