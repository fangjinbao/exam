/**
 * 文件名称：mock/modules/exam.js - 考试模块 Mock 数据
 *
 * 功能描述：
 *   模拟考生端考试相关接口：考试列表、人脸核身、取卷、答案自动保存、
 *   交卷、切屏告警上报、人脸抓拍上传
 *
 * 使用方式：
 *   在 mock/index.js 中导入并注册
 */

import { exams, answerSheets, addWrongQuestion } from '../data/examData'
import { findQuestion, checkAnswer } from '../data/questions'
import { resolveExamStatus, EXAM_STATUS, QUESTION_TYPE } from '@/constants/exam'

/** 切屏告警记录（模拟上报服务端） */
const switchAlarms = []

/** 答卷自增 ID 起始值 */
let answerSheetSeed = 9100

/**
 * 从请求 URL 中解析查询参数
 * @param {string} url - 请求地址
 * @param {string} key - 参数名
 * @returns {string} 参数值，不存在返回空字符串
 */
const getQuery = (url, key) => {
  const matched = new RegExp(`[?&]${key}=([^&]*)`).exec(url || '')
  return matched ? decodeURIComponent(matched[1]) : ''
}

/**
 * 解析请求体
 * @param {Object} options - Mock 请求配置
 * @returns {Object} 请求体对象
 */
const parseBody = (options) => {
  if (!options || !options.body) return {}
  try {
    return JSON.parse(options.body)
  } catch {
    return {}
  }
}

/**
 * 查找指定考试的答卷
 * @param {number} examId - 考试 ID
 * @returns {Object|undefined} 答卷对象
 */
const findSheet = (examId) => answerSheets.find((item) => item.examId === Number(examId))

/**
 * 组装考试列表项（附带实时状态与考生作答情况）
 * @param {Object} exam - 考试原始数据
 * @returns {Object} 列表项
 */
const toExamItem = (exam) => {
  const sheet = findSheet(exam.id)
  return {
    id: exam.id,
    name: exam.name,
    description: exam.description,
    startTime: exam.startTime,
    endTime: exam.endTime,
    duration: exam.duration,
    passScore: exam.passScore,
    totalScore: exam.totalScore,
    questionCount: exam.questionIds.length,
    status: resolveExamStatus(exam.startTime, exam.endTime),
    submitted: sheet ? sheet.status === 'submitted' : false
  }
}

/**
 * 考试列表：GET /api/exam/list
 * @returns {Object} 已分配给该考生的考试列表
 */
export const getExamList = () => {
  return {
    code: 200,
    message: '获取成功',
    data: exams.map(toExamItem)
  }
}

/**
 * 考试详情：GET /api/exam/detail?id=
 * @param {Object} options - Mock 请求配置
 * @returns {Object} 考试详情
 */
export const getExamDetail = (options) => {
  const id = getQuery(options.url, 'id')
  const exam = exams.find((item) => item.id === Number(id))

  if (!exam) {
    return { code: 404, message: '考试不存在', data: null }
  }

  return { code: 200, message: '获取成功', data: toExamItem(exam) }
}

/**
 * 交卷结果：GET /api/exam/result?examId=
 * 含主观题时总分待阅卷，scoreReleased 为 false，此时分数字段为 null
 * @param {Object} options - Mock 请求配置
 * @returns {Object} 交卷详情与成绩（未发布时分数为 null）
 */
export const getExamResult = (options) => {
  const examId = Number(getQuery(options.url, 'examId'))
  const exam = exams.find((item) => item.id === examId)

  if (!exam) {
    return { code: 404, message: '考试不存在', data: null }
  }

  const sheet = findSheet(examId)
  if (!sheet || sheet.status !== 'submitted') {
    return { code: 403, message: '本场考试尚未交卷', data: null }
  }

  return {
    code: 200,
    message: '获取成功',
    data: {
      examId: exam.id,
      examName: exam.name,
      questionCount: exam.questionIds.length,
      passScore: exam.passScore,
      fullScore: exam.totalScore,
      submitTime: sheet.submitTime,
      switchCount: sheet.switchCount,
      scoreReleased: sheet.scoreReleased,
      objectiveScore: sheet.objectiveScore,
      subjectiveScore: sheet.subjectiveScore,
      totalScore: sheet.totalScore,
      passed: sheet.passed,
      // 重考机会：mock 数据没有多份答卷，按「已考 1 次」固定表达。
      // 字段必须齐备，否则结果页的重考入口在 mock 模式下恒不出现，
      // 与真实接口行为不一致，会被误当成 bug 排查。
      //
      // 两个条件都要判，与真实接口 getExamResult 的 canRetake 对齐：
      // 只判 retakeLimit 会让「已结束但配了重考次数」的场次在 mock 里显示可重考，
      // 而真实接口那里返回 false——这恰好是本次最该验的
      // 「结果页显示可重考、点进去被拒」场景，口径不齐就被 mock 自己挡住看不见了
      canRetake:
        resolveExamStatus(exam.startTime, exam.endTime) !== EXAM_STATUS.FINISHED &&
        (exam.retakeLimit ?? 0) > 0,
      submittedCount: 1,
      allowedAttempts: (exam.retakeLimit ?? 0) + 1,
      // 发证与真实接口同口径：仅成绩已发布且及格才带证书
      certificate:
        sheet.scoreReleased && sheet.passed && exam.certificate
          ? exam.certificate
          : null,
      // 该发未发（模板被删、编号冲突等），mock 数据里以 autoIssueCert 无证书表达
      certPending:
        sheet.scoreReleased &&
        !!sheet.passed &&
        !!exam.autoIssueCert &&
        !exam.certificate
    }
  }
}


/**
 * 进入作答取卷：GET /api/exam/paper?examId=
 * 依次校验：考试存在、未到开始时间、已交卷、需核身但未核身
 * @param {Object} options - Mock 请求配置
 * @returns {Object} 试题与作答进度
 */
export const getExamPaper = (options) => {
  const examId = Number(getQuery(options.url, 'examId'))
  const exam = exams.find((item) => item.id === examId)

  if (!exam) {
    return { code: 404, message: '考试不存在', data: null }
  }

  const status = resolveExamStatus(exam.startTime, exam.endTime)
  if (status === EXAM_STATUS.PUBLISHED) {
    return { code: 403, message: '考试尚未开始', data: null }
  }

  const sheet = findSheet(examId)
  if (sheet && sheet.status === 'submitted') {
    return { code: 403, message: '您已完成本场考试', data: null }
  }


  // 无答卷时创建作答中的答卷，支持中断后继续作答
  let current = sheet
  if (!current) {
    current = {
      id: (answerSheetSeed += 1),
      examId,
      status: 'answering',
      answers: {},
      objectiveScore: null,
      subjectiveScore: null,
      totalScore: null,
      passed: null,
      scoreReleased: false,
      submitTime: null,
      switchCount: 0,
      startedAt: new Date().toISOString()
    }
    answerSheets.push(current)
  }

  // 作答页不下发正确答案与解析，避免考生获取答案
  const questionList = exam.questionIds.map((qid) => {
    const question = findQuestion(qid)
    return {
      id: question.id,
      type: question.type,
      score: question.score,
      content: question.content,
      options: question.options
    }
  })

  // 剩余秒数取「考试结束时间」与「开考时长」两者的较小值
  const endLeft = Math.floor((new Date(exam.endTime).getTime() - Date.now()) / 1000)
  const durationLeft =
    exam.duration * 60 - Math.floor((Date.now() - new Date(current.startedAt).getTime()) / 1000)

  return {
    code: 200,
    message: '获取成功',
    data: {
      sheetId: current.id,
      examId: exam.id,
      examName: exam.name,
      remainSeconds: Math.max(0, Math.min(endLeft, durationLeft)),
      questions: questionList,
      answers: current.answers
    }
  }
}

/**
 * 答案自动保存：POST /api/exam/save-answer
 * @param {Object} options - Mock 请求配置
 * @returns {Object} 保存结果
 */
export const saveAnswer = (options) => {
  const { examId, questionId, answer } = parseBody(options)
  const sheet = findSheet(examId)

  if (!sheet) {
    return { code: 404, message: '答卷不存在', data: null }
  }
  if (sheet.status === 'submitted') {
    return { code: 403, message: '您已完成本场考试', data: null }
  }

  sheet.answers[questionId] = answer
  return { code: 200, message: '已保存', data: { savedAt: new Date().toISOString() } }
}

/**
 * 交卷：POST /api/exam/submit
 * 客观题自动判分，主观题置 0 待阅卷；错题写入错题本
 * @param {Object} options - Mock 请求配置
 * @returns {Object} 交卷结果
 */
export const submitExam = (options) => {
  const { examId } = parseBody(options)
  const exam = exams.find((item) => item.id === Number(examId))
  const sheet = findSheet(examId)

  if (!exam || !sheet) {
    return { code: 404, message: '答卷不存在', data: null }
  }
  if (sheet.status === 'submitted') {
    return { code: 403, message: '您已完成本场考试', data: null }
  }

  let objectiveScore = 0
  let hasSubjective = false

  exam.questionIds.forEach((qid) => {
    const question = findQuestion(qid)
    const userAnswer = sheet.answers[qid]

    // 主观题（问答/论述）不自动判分，交由阅卷中心处理；填空是客观题，走自动判分
    if (question.type === QUESTION_TYPE.QA || question.type === QUESTION_TYPE.ESSAY) {
      hasSubjective = true
      return
    }

    if (checkAnswer(question, userAnswer)) {
      objectiveScore += question.score
    } else {
      addWrongQuestion(qid, 'exam', exam.name, userAnswer)
    }
  })

  sheet.status = 'submitted'
  sheet.submitTime = new Date().toISOString()
  sheet.objectiveScore = objectiveScore
  // 含主观题时总分待阅卷完成后才产生，成绩暂不发布
  sheet.subjectiveScore = hasSubjective ? null : 0
  sheet.totalScore = hasSubjective ? null : objectiveScore
  sheet.passed = hasSubjective ? null : objectiveScore >= exam.passScore
  sheet.scoreReleased = !hasSubjective

  return {
    code: 200,
    message: '交卷成功',
    data: {
      sheetId: sheet.id,
      pendingReview: hasSubjective,
      objectiveScore,
      totalScore: sheet.totalScore
    }
  }
}

/**
 * 切屏告警上报：POST /api/exam/switch-alarm
 * 记录告警并累计切屏次数，模拟上报服务端
 * @param {Object} options - Mock 请求配置
 * @returns {Object} 上报结果
 */
export const reportSwitchAlarm = (options) => {
  const { examId } = parseBody(options)
  const sheet = findSheet(examId)

  if (sheet) {
    sheet.switchCount += 1
  }

  switchAlarms.push({
    examId: Number(examId),
    type: 'switch_screen',
    time: new Date().toISOString()
  })

  return {
    code: 200,
    message: '已记录',
    data: { switchCount: sheet ? sheet.switchCount : switchAlarms.length }
  }
}





