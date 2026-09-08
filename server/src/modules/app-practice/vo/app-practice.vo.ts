import { ApiProperty } from '@nestjs/swagger';

/** 岗位练兵列表项 */
export class AppPracticeItemVo {
  @ApiProperty({ description: '练习 ID' })
  id: number;

  @ApiProperty({ description: '练习名称' })
  name: string;

  @ApiProperty({ description: '练习说明', required: false })
  description?: string;

  @ApiProperty({ description: '题库名称（多个以 / 连接）' })
  bankNames: string;

  @ApiProperty({ description: '题目总数' })
  totalCount: number;

  @ApiProperty({ description: '开始时间（不限时为空）', required: false })
  startTime?: string;

  @ApiProperty({ description: '结束时间（不限时为空）', required: false })
  endTime?: string;

  @ApiProperty({ description: '真实状态：ongoing 进行中 / finished 已结束' })
  status: string;

  @ApiProperty({ description: '我的练习进度：已答题数' })
  answeredCount: number;

  @ApiProperty({ description: '我是否已练完' })
  finished: boolean;

  @ApiProperty({
    description: '我上次练习的时间（从未练过时为空）',
    required: false,
  })
  lastPracticeTime?: string;

  @ApiProperty({ description: '是否可进入练习（结束或不允许重练时为 false）' })
  canPractice: boolean;

  @ApiProperty({ description: '不可练习的原因（canPractice=false 时有值）', required: false })
  blockReason?: string;
}

/** 练习题目（练习为即时反馈，答案与解析是否下发由 PracticeSetting 决定） */
export class AppPracticeQuestionVo {
  @ApiProperty({ description: '题目 ID' })
  id: number;

  @ApiProperty({ description: '题序（从 1 开始）' })
  questionNo: number;

  @ApiProperty({ description: '题型 value' })
  type: string;

  @ApiProperty({ description: '题型中文名' })
  typeText: string;

  @ApiProperty({ description: '题干' })
  content: string;

  @ApiProperty({ description: '选项列表（非选择题为空数组）', type: [Object] })
  options: { key: string; value: string }[];

  @ApiProperty({ description: '标准答案（showAnswer 关闭时为空串）' })
  answer: string;

  @ApiProperty({ description: '解析（showAnalysis 关闭时不下发）', required: false })
  analysis?: string;

  @ApiProperty({ description: '我上次的作答（断点续练回填，未答为空串）' })
  userAnswer: string;
}

/** 练习设置（前端据此决定答题交互） */
export class AppPracticeSettingVo {
  @ApiProperty({ description: '单题作答后展示对错' })
  showResultPerQuestion: boolean;

  @ApiProperty({ description: '展示答案' })
  showAnswer: boolean;

  @ApiProperty({ description: '展示解析' })
  showAnalysis: boolean;
}

/** 取题响应 */
export class AppPracticeQuestionsVo {
  @ApiProperty({ description: '练习记录 ID（提交时回传）' })
  recordId: number;

  @ApiProperty({ description: '练习名称' })
  name: string;

  @ApiProperty({ description: '题目列表', type: [AppPracticeQuestionVo] })
  questions: AppPracticeQuestionVo[];

  @ApiProperty({ description: '练习设置', type: AppPracticeSettingVo })
  setting: AppPracticeSettingVo;

  @ApiProperty({ description: '断点续练起始题序（全部未答为 1）' })
  resumeNo: number;
}

/** 单题提交结果（即时反馈） */
export class AppPracticeAnswerVo {
  @ApiProperty({ description: '是否答对（showResultPerQuestion 关闭时为 null）', required: false })
  isCorrect?: boolean | null;

  @ApiProperty({ description: '已答题数' })
  answeredCount: number;

  @ApiProperty({ description: '累计答对数' })
  correctCount: number;
}

/** 整份练习提交结果 */
export class AppPracticeSubmitVo {
  @ApiProperty({ description: '练习记录 ID' })
  recordId: number;

  @ApiProperty({ description: '题目总数' })
  totalCount: number;

  @ApiProperty({ description: '答对题数' })
  correctCount: number;

  @ApiProperty({ description: '正确率（百分比，保留一位小数）' })
  accuracy: number;
}

/**
 * 自主练习范围选项
 * 只以题库为维度：考核点在管理端是题库设置内的范围限定项，不是并列的练习入口，
 * 取题时由服务端按开放范围自动过滤，不需要客户端选择。
 */
export class AppPracticeOptionsVo {
  @ApiProperty({
    description:
      '可练题库（questionCount 为本轮实际会练到的题数，已按考核点范围与单轮上限算过；' +
      'canPractice=false 时为已练完且不允许重练，blockReason 为置灰原因）',
    type: [Object],
  })
  banks: {
    id: number;
    name: string;
    questionCount: number;
    canPractice: boolean;
    blockReason: string;
  }[];
}

/**
 * 我的练习概览
 * 供练习首屏四格数据条使用，四项都从我的练习记录聚合，不含他人数据。
 */
export class AppPracticeStatsVo {
  @ApiProperty({ description: '累计已答题数（含岗位练兵、自主练习与错题重练）' })
  answeredCount: number;

  @ApiProperty({ description: '累计正确率（百分比整数，无作答记录时为 0）' })
  accuracy: number;

  @ApiProperty({ description: '进行中练习数（已开练但未练完的记录数）' })
  ongoingCount: number;
}

/** AI 答疑结果 */
export class AppPracticeAiAskVo {
  @ApiProperty({ description: 'AI 答复正文' })
  answer: string;
}

/** 错题本条目 */
export class AppWrongItemVo {
  @ApiProperty({ description: '列表主键（同题目 ID，供前端列表 key 使用）' })
  id: number;

  @ApiProperty({ description: '题目 ID' })
  questionId: number;

  @ApiProperty({ description: '题型中文名' })
  typeText: string;

  @ApiProperty({ description: '题干' })
  content: string;

  @ApiProperty({ description: '来源类型：exam 考试 / practice 练习' })
  source: string;

  @ApiProperty({ description: '来源名称（考试或练习名称）' })
  sourceName: string;

  @ApiProperty({ description: '最近一次的错误作答' })
  userAnswer: string;

  @ApiProperty({ description: '最近一次答错时间' })
  wrongTime: string;

  @ApiProperty({ description: '答错次数' })
  wrongCount: number;
}

/** 收藏翻转结果 */
export class AppFavoriteToggleVo {
  @ApiProperty({ description: '翻转后的收藏态：true 已收藏，false 已取消' })
  favorited: boolean;
}

/** 收藏列表项 */
export class AppFavoriteItemVo {
  @ApiProperty({ description: '列表主键（同题目 ID，供前端列表 key 使用）' })
  id: number;

  @ApiProperty({ description: '题目 ID' })
  questionId: number;

  @ApiProperty({ description: '题型中文名' })
  typeText: string;

  @ApiProperty({ description: '题干' })
  content: string;

  @ApiProperty({ description: '收藏时间' })
  favoriteTime: string;
}
