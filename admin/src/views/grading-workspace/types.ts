/** 阅卷工作台共享类型 */

import type { SheetQuestionItem } from '@/api/grading'

/**
 * 批阅行：接口题目 + 本地待提交的评分
 *
 * 与接口字段分开存：score 是「已保存的分」，draftScore 是「本次输入未提交的分」，
 * 合并成一个字段会导致输入后立刻显示为已评、无法区分哪些题还没提交。
 */
export interface GradingRow extends SheetQuestionItem {
  /** 本次输入的分数，null 表示本次未改动该题 */
  draftScore: number | null
  /** 本次输入的评语（选填） */
  draftComment: string
}

/** 按题型分组后的大题（含组内连续小题号，供答题卡与卷面共用） */
export interface GradingSection {
  /** 题型字典 value */
  type: string
  /** 组内题数 */
  count: number
  /** 组内合计满分 */
  totalScore: number
  /** 组内题目，附「本大题内第几小题」 */
  items: Array<GradingRow & { indexInSection: number }>
}
