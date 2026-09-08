/**
 * 文件名称：mock/modules/profile.js - 我的模块 Mock 数据
 *
 * 功能描述：
 *   模拟个人信息更新、我的成绩列表与详情、我的证书列表与详情接口
 *   成绩仅返回已发布的记录
 *
 * 使用方式：
 *   在 mock/index.js 中导入并注册
 */

import { exams, answerSheets, certificates } from '../data/examData'
import { findQuestion } from '../data/questions'
import { CERT_STATUS_TEXT, QUESTION_TYPE, QUESTION_TYPE_TEXT } from '@/constants/exam'

/** 个人信息（模块级持久化，编辑后同一会话内保持） */
const profile = {
  name: '张建国',
  phone: '13800138000',
  email: 'zhangjianguo@example.com',
  idCard: '3301**********1234',
  company: '中国石化销售企业浙江分公司'
}

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
 * 获取个人信息：GET /api/profile/info
 * @returns {Object} 个人信息
 */
export const getProfile = () => {
  return { code: 200, message: '获取成功', data: { ...profile } }
}

/**
 * 更新个人信息：POST /api/profile/update
 * 校验姓名长度、手机号与邮箱格式
 * @param {Object} options - Mock 请求配置
 * @returns {Object} 更新结果
 */
export const updateProfile = (options) => {
  const { name, phone, email } = parseBody(options)

  const trimmedName = String(name || '').trim()
  if (trimmedName.length < 2 || trimmedName.length > 20) {
    return { code: 400, message: '姓名长度须为 2-20 字', data: null }
  }
  if (!/^1[3-9]\d{9}$/.test(String(phone || ''))) {
    return { code: 400, message: '请输入正确的手机号', data: null }
  }
  if (email) {
    if (String(email).length > 50) {
      return { code: 400, message: '电子邮箱最多 50 字', data: null }
    }
    if (!/^[\w.-]+@[\w-]+(\.[\w-]+)+$/.test(String(email))) {
      return { code: 400, message: '请输入正确的电子邮箱', data: null }
    }
  }

  profile.name = trimmedName
  profile.phone = phone
  profile.email = email || ''

  return { code: 200, message: '保存成功', data: { ...profile } }
}

/**
 * 答题用时（分钟）
 *
 * 与后端 AppProfileService.calcUsedMinutes 保持同一算法：按「开始作答 → 交卷」实算，
 * 缺任一时间或算出非正值（时钟回拨等异常数据）都按无效处理返回 null。
 * @param {string|null} startTime - 开始作答时间
 * @param {string|null} submitTime - 交卷时间
 * @returns {number|null} 用时分钟数，无效时为 null
 */
const calcUsedMinutes = (startTime, submitTime) => {
  if (!startTime || !submitTime) return null
  const ms = new Date(submitTime).getTime() - new Date(startTime).getTime()
  if (!(ms > 0)) return null
  return Math.ceil(ms / 60000)
}

/**
 * 我的成绩列表：GET /api/profile/score-list
 * 仅返回已发布成绩的答卷，按交卷时间倒序
 * @returns {Object} 成绩列表
 */
export const getScoreList = () => {
  const list = answerSheets
    // 与真实 service 一致：交了卷就列出，含成绩未发布的（待阅卷）。
    // 若按 scoreReleased 过滤，含主观题的考试交完卷后记录会直接消失，考生会以为成绩丢了。
    .filter((sheet) => sheet.status === 'submitted')
    .map((sheet) => {
      const exam = exams.find((item) => item.id === sheet.examId)
      const pendingReview = !sheet.scoreReleased
      return {
        sheetId: sheet.id,
        examId: sheet.examId,
        examName: exam ? exam.name : '未知考试',
        // 考场安排时段，与考生实际作答时间是两件事
        examStartTime: exam ? exam.startTime : null,
        examEndTime: exam ? exam.endTime : null,
        startTime: sheet.startTime ?? null,
        submitTime: sheet.submitTime,
        passScore: exam ? exam.passScore : null,
        // 满分取试卷总分，与真实接口同源；缺失时给 0 而非 null，前端要拿它拼「/100」
        fullScore: exam ? exam.totalScore : 0,
        usedMinutes: calcUsedMinutes(sheet.startTime, sheet.submitTime),
        // 待阅卷时分数与及格与否都还不存在，给 null 让前端显示「待阅卷」而非 0 分/不及格
        totalScore: pendingReview ? null : sheet.totalScore,
        passed: pendingReview ? null : sheet.passed,
        pendingReview
      }
    })
    .sort((a, b) => new Date(b.submitTime) - new Date(a.submitTime))

  return { code: 200, message: '获取成功', data: list }
}

/**
 * 成绩详情：GET /api/profile/score-detail?sheetId=
 * 返回逐题作答、正确答案与解析
 * @param {Object} options - Mock 请求配置
 * @returns {Object} 单次考试的作答与得分详情
 */
export const getScoreDetail = (options) => {
  const sheetId = Number(getQuery(options.url, 'sheetId'))
  const sheet = answerSheets.find((item) => item.id === sheetId)

  if (!sheet || !sheet.scoreReleased) {
    return { code: 404, message: '成绩不存在或未发布', data: null }
  }

  const exam = exams.find((item) => item.id === sheet.examId)
  const questionIds = exam ? exam.questionIds : []
  const questionList = questionIds
    .map((qid) => {
      const question = findQuestion(qid)
      if (!question) return null
      const userAnswer = sheet.answers[qid]
      const isSubjective =
        question.type === QUESTION_TYPE.QA || question.type === QUESTION_TYPE.ESSAY
      // 客观题按是否答对给分；主观题需人工阅卷，此处按未阅卷返回 null
      const normalize = (value) =>
        Array.isArray(value) ? [...value].sort().join(',') : String(value ?? '')
      return {
        id: question.id,
        type: question.type,
        typeText: QUESTION_TYPE_TEXT[question.type],
        // score 是「本题得分」而非题目满分，与服务端 AppScoreQuestionVo 口径一致；
        // 曾错误地返回 question.score（满分），导致本地看到的答错题也显示满分
        score: isSubjective
          ? null
          : normalize(userAnswer) === normalize(question.answer)
            ? question.score
            : 0,
        content: question.content,
        options: question.options,
        userAnswer: userAnswer === undefined ? '' : userAnswer,
        answer: question.answer,
        analysis: question.analysis
      }
    })
    .filter(Boolean)

  return {
    code: 200,
    message: '获取成功',
    data: {
      sheetId: sheet.id,
      examName: exam ? exam.name : '未知考试',
      totalScore: sheet.totalScore,
      objectiveScore: sheet.objectiveScore,
      subjectiveScore: sheet.subjectiveScore,
      passScore: exam ? exam.passScore : null,
      passed: sheet.passed,
      submitTime: sheet.submitTime,
      questions: questionList
    }
  }
}

/**
 * 我的证书列表：GET /api/profile/certificate-list
 * @returns {Object} 证书列表
 */
export const getCertificateList = () => {
  const list = certificates.map((item) => ({
    id: item.id,
    name: item.name,
    code: item.code,
    validPeriod: item.validPeriod,
    status: item.status,
    statusText: CERT_STATUS_TEXT[item.status]
  }))

  return { code: 200, message: '获取成功', data: list }
}

/**
 * 证书详情：GET /api/profile/certificate-detail?id=
 * @param {Object} options - Mock 请求配置
 * @returns {Object} 证书详情
 */
export const getCertificateDetail = (options) => {
  const id = Number(getQuery(options.url, 'id'))
  const target = certificates.find((item) => item.id === id)

  if (!target) {
    return { code: 404, message: '证书不存在', data: null }
  }

  return {
    code: 200,
    message: '获取成功',
    data: { ...target, statusText: CERT_STATUS_TEXT[target.status], holderName: profile.name }
  }
}

/**
 * 证书下载：POST /api/profile/certificate-download
 * 模拟生成下载文件名，实际文件由后端出证服务提供
 * @param {Object} options - Mock 请求配置
 * @returns {Object} 下载结果
 */
export const downloadCertificate = (options) => {
  const { id } = parseBody(options)
  const target = certificates.find((item) => item.id === Number(id))

  if (!target) {
    return { code: 404, message: '证书不存在', data: null }
  }

  return {
    code: 200,
    message: '下载成功',
    data: { fileName: `${target.name}_${target.code}.pdf` }
  }
}



