/**
 * 文件名称：composables/useExamPaperLoader.js - 考试取卷组合式函数
 *
 * 功能描述：
 *   负责作答页取卷与取卷失败后的落地页决策
 *   取卷成功交由调用方回填试卷；失败时按是否已交卷决定进结果页还是回列表
 *
 * 使用方式：
 *   const { loading, loadError, loadPaper } = useExamPaperLoader(examId, { onLoaded, isStillOnPage })
 */

import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { getExamPaperApi, getExamDetailApi } from '@/api/modules/examApi'

/**
 * 取卷能力
 * @param {number|string} examId - 考试 ID
 * @param {Object} hooks - 回调集合
 * @param {Function} hooks.onLoaded - 取卷成功回调，入参为试卷数据
 * @param {Function} [hooks.isStillOnPage] - 判断考生是否仍在作答页，false 时放弃跳转。
 *   默认恒为 true（照常跳转）：漏传时若直接调用会在 catch 块内抛出未捕获 rejection，
 *   考生只看到空态页而无从排查，故给出保守默认值
 * @returns {Object} 加载状态与取卷方法
 */
export const useExamPaperLoader = (examId, { onLoaded, isStillOnPage = () => true }) => {
  /** 加载中 */
  const loading = ref(false)

  /** 加载失败提示 */
  const loadError = ref('')

  const router = useRouter()

  /**
   * 取卷失败后决定落地页
   *
   * 已交卷的考生直连或刷新作答页时也会走取卷失败（后端拦截），这类应进交卷详情而非列表。
   * 取卷拦截「未开始」与「已交卷」同为 403、拦截器又只透出文案，故不靠错误信息判别，
   * 改查一次详情读 submitted：字段是现成契约，比匹配提示文案可靠。
   *
   * 查详情要等一次网络往返，这期间考生可能自己点了返回。若不加判断，
   * 请求 resolve 后的 replace 会把已经离开的考生硬拽回来，故跳转前先核对是否仍在本页。
   * 判据用实时路由而非「已点过返回」的标志：深链或刷新进来时会话历史为空，
   * router.back() 会静默失败，人其实没走，用标志会把兜底跳转永久拦死。
   */
  const redirectOnLoadFail = async () => {
    try {
      const res = await getExamDetailApi(examId)
      if (!isStillOnPage()) return
      if (res.data?.submitted) {
        router.replace(`/exam/result/${examId}`)
        return
      }
    } catch {
      // 详情同样失败则不再追究原因，走下面的列表兜底
    }
    if (!isStillOnPage()) return
    router.replace('/exam/list')
  }

  /**
   * 取卷
   * 成功时把试卷数据交给调用方回填，失败时提示原因并退到合适的页面
   */
  const loadPaper = async () => {
    loading.value = true
    try {
      const res = await getExamPaperApi(examId)
      onLoaded(res.data)
    } catch (err) {
      // 拦截原因由响应拦截器提示，此处只决定退到哪一页
      loadError.value = err.message || '试卷加载失败'
      await redirectOnLoadFail()
    } finally {
      loading.value = false
    }
  }

  return { loading, loadError, loadPaper }
}
