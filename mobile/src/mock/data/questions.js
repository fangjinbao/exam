/**
 * 文件名称：mock/data/questions.js - 题目种子数据
 *
 * 功能描述：
 *   考试作答、在线练习、错题本共用的题目数据
 *   模块级变量持久化，页面刷新前的增删改在同一会话内保持一致
 *
 * 使用方式：
 *   import { questions, questionBanks } from '@/mock/data/questions'
 */

import { QUESTION_TYPE } from '@/constants/exam'

/** 题库列表（在线练习按题库选题用） */
export const questionBanks = [
  { id: 1, name: '安全生产基础知识', questionCount: 4 },
  { id: 2, name: '危险化学品管理', questionCount: 3 },
  { id: 3, name: '消防与应急处置', questionCount: 2 }
]

/** 知识点列表（在线练习按知识点选题用） */
export const knowledgePoints = [
  { id: 11, bankId: 1, name: '安全生产法律法规', questionCount: 2 },
  { id: 12, bankId: 1, name: '劳动防护用品', questionCount: 2 },
  { id: 21, bankId: 2, name: '危化品储存规范', questionCount: 2 },
  { id: 22, bankId: 2, name: '泄漏应急处置', questionCount: 1 },
  { id: 31, bankId: 3, name: '初期火灾扑救', questionCount: 1 },
  { id: 32, bankId: 3, name: '疏散逃生常识', questionCount: 1 }
]

/**
 * 题目数据
 * answer 字段：单选/判断为字符串，多选为字符串数组，填空/简答为参考答案文本
 */
export const questions = [
  {
    id: 101,
    bankId: 1,
    knowledgePointId: 11,
    type: QUESTION_TYPE.SINGLE,
    score: 5,
    content: '《安全生产法》规定，生产经营单位的安全生产第一责任人是（  ）。',
    options: [
      { key: 'A', value: '安全管理部门负责人' },
      { key: 'B', value: '主要负责人' },
      { key: 'C', value: '分管安全的副职' },
      { key: 'D', value: '现场班组长' }
    ],
    answer: 'B',
    analysis: '《安全生产法》明确生产经营单位主要负责人对本单位安全生产工作负全面责任，是第一责任人。'
  }
  ,
  {
    id: 102,
    bankId: 1,
    knowledgePointId: 11,
    type: QUESTION_TYPE.JUDGE,
    score: 5,
    content: '从业人员发现直接危及人身安全的紧急情况时，有权停止作业或撤离作业场所。',
    options: [
      { key: 'true', value: '正确' },
      { key: 'false', value: '错误' }
    ],
    answer: 'true',
    analysis: '《安全生产法》赋予从业人员紧急情况下的停止作业权和撤离权，且不得因此降低其工资、福利待遇。'
  },
  {
    id: 103,
    bankId: 1,
    knowledgePointId: 12,
    type: QUESTION_TYPE.MULTIPLE,
    score: 8,
    content: '进入生产装置区作业，必须正确佩戴的劳动防护用品包括（  ）。',
    options: [
      { key: 'A', value: '安全帽' },
      { key: 'B', value: '防静电工作服' },
      { key: 'C', value: '防护眼镜' },
      { key: 'D', value: '棉纱手套' }
    ],
    answer: ['A', 'B', 'C'],
    analysis: '装置区需佩戴安全帽、防静电工作服与防护眼镜；棉纱手套易吸附油污引发静电，不属于装置区规定用品。'
  },
  {
    id: 104,
    bankId: 1,
    knowledgePointId: 12,
    type: QUESTION_TYPE.BLANK,
    score: 6,
    content: '劳动防护用品应做到「三定」，即定人、定期检查和________。',
    options: [],
    answer: '定点存放',
    analysis: '劳动防护用品管理的「三定」原则为定人保管、定点存放、定期检查，确保随时可用且状态完好。'
  }
  ,
  {
    id: 201,
    bankId: 2,
    knowledgePointId: 21,
    type: QUESTION_TYPE.SINGLE,
    score: 5,
    content: '易燃液体储罐区内动火作业前，可燃气体浓度检测应低于爆炸下限的（  ）。',
    options: [
      { key: 'A', value: '5%' },
      { key: 'B', value: '10%' },
      { key: 'C', value: '20%' },
      { key: 'D', value: '25%' }
    ],
    answer: 'A',
    analysis: '按动火作业安全规范，可燃气体浓度须低于爆炸下限的 5% 方可动火，超标须重新置换并复测。'
  },
  {
    id: 202,
    bankId: 2,
    knowledgePointId: 21,
    type: QUESTION_TYPE.MULTIPLE,
    score: 8,
    content: '危险化学品仓库储存管理要求包括（  ）。',
    options: [
      { key: 'A', value: '按性质分区分类储存' },
      { key: 'B', value: '氧化剂与还原剂可同库存放' },
      { key: 'C', value: '保持通风并控制温湿度' },
      { key: 'D', value: '配备相应消防器材' }
    ],
    answer: ['A', 'C', 'D'],
    analysis: '氧化剂与还原剂性质相互冲突，混存易发生剧烈反应，必须分库储存，故 B 错误。'
  },
  {
    id: 203,
    bankId: 2,
    knowledgePointId: 22,
    type: QUESTION_TYPE.ESSAY,
    score: 10,
    content: '简述发现液态危化品少量泄漏时的现场处置步骤。',
    options: [],
    answer:
      '一、立即报警并疏散无关人员，设置警戒区；二、切断泄漏源，关闭上下游阀门；三、佩戴相应防护装备进入处置；四、用砂土或专用吸附材料围堵吸附，禁用水直接冲洗；五、收集废弃物交有资质单位处置，并记录事件上报。',
    analysis: '处置核心为「报警—隔离—断源—围堵吸附—合规处置」，其中断源前须确认自身防护到位，避免二次伤害。'
  }
  ,
  {
    id: 301,
    bankId: 3,
    knowledgePointId: 31,
    type: QUESTION_TYPE.SINGLE,
    score: 5,
    content: '扑救带电设备火灾时，应优先选用的灭火器材是（  ）。',
    options: [
      { key: 'A', value: '清水灭火器' },
      { key: 'B', value: '泡沫灭火器' },
      { key: 'C', value: '二氧化碳灭火器' },
      { key: 'D', value: '消防水带' }
    ],
    answer: 'C',
    analysis: '二氧化碳不导电且无残留，适用于带电设备火灾；水与泡沫导电，未断电时使用会造成触电危险。'
  },
  {
    id: 302,
    bankId: 3,
    knowledgePointId: 32,
    type: QUESTION_TYPE.JUDGE,
    score: 5,
    content: '发生火灾时为节省时间，可以乘坐普通客用电梯快速撤离。',
    options: [
      { key: 'true', value: '正确' },
      { key: 'false', value: '错误' }
    ],
    answer: 'false',
    analysis: '火灾时电梯可能断电停运或成为烟气竖向通道，须走疏散楼梯撤离，不得乘坐普通客用电梯。'
  }
]

/**
 * 按 ID 查找题目
 * @param {number} id - 题目 ID
 * @returns {Object|undefined} 题目对象
 */
export const findQuestion = (id) => questions.find((item) => item.id === Number(id))

/**
 * 判断作答是否正确（多选需完全一致，其余按文本比对）
 * @param {Object} question - 题目对象
 * @param {string|string[]} userAnswer - 考生作答
 * @returns {boolean} 是否作答正确
 */
export const checkAnswer = (question, userAnswer) => {
  if (!question || userAnswer === undefined || userAnswer === null || userAnswer === '') return false

  // 多选题：忽略顺序，选项集合完全一致才算正确
  if (Array.isArray(question.answer)) {
    if (!Array.isArray(userAnswer) || userAnswer.length !== question.answer.length) return false
    return [...question.answer].sort().join(',') === [...userAnswer].sort().join(',')
  }

  return String(userAnswer).trim() === String(question.answer).trim()
}
