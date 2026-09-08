/**
 * 文件名称：mock/modules/practice.js - 在线练习 / 错题本 Mock 数据
 *
 * 功能描述：
 *   模拟按题库或知识点取练习题、提交练习作答返回对错与解析、
 *   错题列表与错题再练习
 *
 * 使用方式：
 *   在 mock/index.js 中导入并注册
 */

import { questions, questionBanks, knowledgePoints, findQuestion, checkAnswer } from '../data/questions'
import {
  wrongQuestions,
  practiceStat,
  addWrongQuestion,
  removeWrongQuestion
} from '../data/examData'
import { QUESTION_TYPE_TEXT } from '@/constants/exam'

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
 * 题库与知识点选项：GET /api/practice/options
 * @returns {Object} 题库列表与知识点列表
 */
export const getPracticeOptions = () => {
  return {
    code: 200,
    message: '获取成功',
    data: { banks: questionBanks, knowledgePoints }
  }
}

/**
 * 练习取题：GET /api/practice/questions?bankId=&knowledgePointId=
 * 按题库或知识点筛选，两者都为空时返回全部题目
 * @param {Object} options - Mock 请求配置
 * @returns {Object} 练习题列表（不含答案与解析，提交后单题返回）
 */
export const getPracticeQuestions = (options) => {
  const bankId = getQuery(options.url, 'bankId')
  const knowledgePointId = getQuery(options.url, 'knowledgePointId')

  let list = questions
  if (knowledgePointId) {
    list = list.filter((item) => item.knowledgePointId === Number(knowledgePointId))
  } else if (bankId) {
    list = list.filter((item) => item.bankId === Number(bankId))
  }

  return {
    code: 200,
    message: '获取成功',
    data: list.map((item) => ({
      id: item.id,
      type: item.type,
      typeText: QUESTION_TYPE_TEXT[item.type],
      score: item.score,
      content: item.content,
      options: item.options
    }))
  }
}

/**
 * 提交练习作答：POST /api/practice/submit
 * 即时返回对错判断与解析，答错写入错题本
 * @param {Object} options - Mock 请求配置
 * @returns {Object} 判定结果、正确答案与解析
 */
export const submitPractice = (options) => {
  const { questionId, answer, sourceName } = parseBody(options)
  const question = findQuestion(questionId)

  if (!question) {
    return { code: 404, message: '题目不存在', data: null }
  }

  const correct = checkAnswer(question, answer)
  practiceStat.answeredCount += 1

  // 答错记入错题本，答对则从错题本移除（错题再练习通过场景）
  if (correct) {
    removeWrongQuestion(questionId)
  } else {
    const bank = questionBanks.find((item) => item.id === question.bankId)
    addWrongQuestion(questionId, 'practice', sourceName || (bank ? bank.name : '在线练习'), answer)
  }

  return {
    code: 200,
    message: '提交成功',
    data: { correct, answer: question.answer, analysis: question.analysis }
  }
}

/**
 * 错题列表：GET /api/practice/wrong-list
 * @returns {Object} 错题列表（含题干、题型、来源与上次作答）
 */
export const getWrongList = () => {
  const list = wrongQuestions
    .map((item) => {
      const question = findQuestion(item.questionId)
      if (!question) return null
      return {
        id: item.id,
        questionId: item.questionId,
        type: question.type,
        typeText: QUESTION_TYPE_TEXT[question.type],
        content: question.content,
        source: item.source,
        sourceName: item.sourceName,
        userAnswer: item.userAnswer,
        wrongTime: item.wrongTime
      }
    })
    .filter(Boolean)

  return { code: 200, message: '获取成功', data: list }
}

/**
 * 错题再练习取题：GET /api/practice/wrong-questions
 * @returns {Object} 错题本内的题目列表（不含答案与解析）
 */
export const getWrongQuestions = () => {
  const list = wrongQuestions
    .map((item) => {
      const question = findQuestion(item.questionId)
      if (!question) return null
      return {
        id: question.id,
        type: question.type,
        typeText: QUESTION_TYPE_TEXT[question.type],
        score: question.score,
        content: question.content,
        options: question.options
      }
    })
    .filter(Boolean)

  return { code: 200, message: '获取成功', data: list }
}



