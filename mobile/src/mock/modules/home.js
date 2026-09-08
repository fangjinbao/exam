/**
 * 文件名称：mock/modules/home.js - 首页 Mock 数据
 *
 * 功能描述：
 *   模拟首页待考提醒与数据概览接口
 *   待考提醒状态由当前时间与考试起止时间实时判定
 *
 * 使用方式：
 *   在 mock/index.js 中导入并注册
 */

import { exams, answerSheets, wrongQuestions, certificates, practiceStat } from '../data/examData'
import { resolveExamStatus, EXAM_STATUS } from '@/constants/exam'

/**
 * 待考提醒：GET /api/home/upcoming
 *
 * 只返回「考生还需要行动」的考试：未开始或进行中，且本人作答机会未用尽。
 * 机会用尽的（不允许重考且交过、或重考次数用尽）不属于待考，从列表移除——
 * 这类考试仍可在考试列表页查看。交过但仍可重考的保留，带 attemptCount 供前端标注。
 *
 * 口径与服务端 AppHomeService.getUpcomingExams 一致，两处不能分叉。
 *
 * @returns {Object} 待考列表
 */
export const getUpcomingExams = () => {
  const list = exams
    .map((exam) => {
      // 已交卷次数：mock 每场只存一条答卷，故最多为 1
      const attemptCount = answerSheets.filter(
        (item) => item.examId === exam.id && item.status === 'submitted'
      ).length
      return {
        id: exam.id,
        name: exam.name,
        startTime: exam.startTime,
        endTime: exam.endTime,
        status: resolveExamStatus(exam.startTime, exam.endTime),
        attemptCount,
        // 总机会数 = 重考次数 + 1（retakeLimit=0 表示仅一次机会）
        exhausted: attemptCount >= (exam.retakeLimit ?? 0) + 1
      }
    })
    .filter(
      (item) =>
        !item.exhausted &&
        (item.status === EXAM_STATUS.PUBLISHED || item.status === EXAM_STATUS.ONGOING)
    )
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    // exhausted 仅用于过滤，不下发（服务端也不下发该字段）
    .map(({ exhausted: _exhausted, ...item }) => item)

  return { code: 200, message: '获取成功', data: list }
}

/**
 * 数据概览：GET /api/home/overview
 * 无数据时各项指标为 0，不隐藏区域
 * @returns {Object} 四项统计指标
 */
export const getOverview = () => {
  const examCount = answerSheets.filter((item) => item.status === 'submitted').length

  return {
    code: 200,
    message: '获取成功',
    data: {
      examCount,
      practiceCount: practiceStat.answeredCount,
      certificateCount: certificates.length,
      wrongCount: wrongQuestions.length
    }
  }
}
