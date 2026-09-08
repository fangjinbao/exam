/**
 * 题目编辑相关的表单类型
 *
 * 单独成文件而不是从 SFC 导出：Vue 的 `<script setup>` 不支持导出类型。
 */

/** 材料题下的一个小题（表单模型） */
export interface CompositeChild {
  /** 既有小题的 ID；新增时为空。后端据此判断原地更新还是新建 */
  id?: number
  /** 题型（不含 composite，禁止嵌套） */
  type: string
  /** 小题题干（富文本 HTML） */
  stem: string
  /** 选项列表（选择题用），value 为纯文本——选项是短文本，不做富文本 */
  options: { key: string; value: string }[]
  /** 标准答案：单选存字母、多选存逗号分隔字母、判断存正确/错误、其余存文本 */
  answer: string
  /**
   * 答案解析（选填）
   *
   * 后端按富文本存（上限 20000），但表单用纯文本输入——
   * 卡片里已有题干编辑器，再加一个会让工具栏堆叠。纯文本也是合法的富文本内容。
   */
  analysis: string
  difficulty: string
  /** 小题分值；材料题分值由各小题之和派生 */
  suggestedScore: number
}
