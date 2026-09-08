/**
 * 文件名称：composables/useQuestionPages.js - 题目分页（材料题分组）
 *
 * 功能描述：
 *   把后端下发的扁平题目列表按材料题分组成「翻页单位」。
 *   材料题（type=composite）与其小题合成一页，一屏展示材料 + 全部小题；
 *   普通题各自成页。翻页以页为单位，不会把同一材料题的小题拆到不同屏。
 *
 * 使用方式：
 *   const { pages, answerableQuestions } = useQuestionPages(() => paper.questions)
 */

import { computed } from 'vue'
import { QUESTION_TYPE } from '@/constants/exam'

/**
 * 按材料题分组生成翻页单位
 *
 * 后端下发顺序是「材料题紧跟其小题」，故顺序扫描即可分组：
 * 遇到 composite 开启一组，随后 parentId 指向它的题目并入该组。
 *
 * @param {Function} getQuestions - 返回题目数组的取值函数（保持响应性）
 * @returns {{ pages: import('vue').ComputedRef, answerableQuestions: import('vue').ComputedRef }}
 */
export function useQuestionPages(getQuestions) {
  /**
   * 翻页单位列表
   *
   * 每项形如：
   * - { kind: 'single', question }                 普通题，单独一页
   * - { kind: 'group', parent, children: [...] }   材料题 + 其小题，合为一页
   */
  const pages = computed(() => {
    const list = getQuestions() || []
    const result = []
    let i = 0

    while (i < list.length) {
      const item = list[i]
      if (item.type === QUESTION_TYPE.COMPOSITE) {
        const children = []
        let j = i + 1
        // 收拢紧随其后、parentId 指向该材料题的小题
        while (j < list.length && list[j].parentId === item.id) {
          children.push(list[j])
          j++
        }
        result.push({ kind: 'group', parent: item, children })
        i = j
        continue
      }
      result.push({ kind: 'single', question: item })
      i++
    }
    return result
  })

  /**
   * 可作答题目列表（排除材料题本身）
   *
   * 材料题只承载材料、不产生作答位，计入会让「已答 N/M」的分母虚高。
   * 提交与进度统计都应以此列表为准。
   */
  const answerableQuestions = computed(() =>
    (getQuestions() || []).filter((q) => q.type !== QUESTION_TYPE.COMPOSITE)
  )

  return { pages, answerableQuestions }
}
