import { ApiProperty } from '@nestjs/swagger';
import { AppCertElementVo } from '@/modules/exam/vo/cert-element.vo';

// 证书版式元素定义已挪到 exam 模块共用（结果页小样也用它），此处转出以免调用方改引用
export { AppCertElementVo };

/**
 * 考生端成绩列表项
 *
 * 只包含已发布成绩的答卷：未阅卷完成的成绩不能提前让考生看到。
 * totalScore 可为 null（含主观题待阅卷时），前端显示占位符。
 */
export class AppScoreItemVo {
  @ApiProperty({ description: '答卷 ID' })
  sheetId: number;

  @ApiProperty({ description: '考试名称' })
  examName: string;

  @ApiProperty({
    description:
      '考场安排的开始时间。与考生实际作答时间是两件事：前者是这场考试对所有人开放的' +
      '时段，后者是本人何时进场交卷，考生要靠前者核对自己考的是哪一场',
    example: '2026-08-01 19:00:00',
    required: false,
  })
  examStartTime?: string | null;

  @ApiProperty({
    description: '考场安排的结束时间',
    example: '2026-08-01 21:00:00',
    required: false,
  })
  examEndTime?: string | null;

  @ApiProperty({
    description:
      '本人开始作答时间。与交卷时间成对下发：只有交卷时间时，考生无法核对自己' +
      '何时进的考场。历史答卷无 startTime 时为 null',
    example: '2026-08-01 19:30:00',
    required: false,
  })
  startTime?: string | null;

  @ApiProperty({ description: '交卷时间', example: '2026-08-01 20:15:00' })
  submitTime: string;

  @ApiProperty({ description: '及格分' })
  passScore: number;

  @ApiProperty({
    description:
      '试卷满分。列表必须下发：只给「20 分」看不出是满分 60 的 20 还是满分 100 的 20，' +
      '分数失去参照就无法判断考得怎么样',
  })
  fullScore: number;

  @ApiProperty({
    description: '答题用时（分钟）。历史答卷无 startTime 时为 null',
    required: false,
  })
  usedMinutes?: number | null;

  @ApiProperty({ description: '总分，待阅卷或本场不公开成绩时为 null', required: false })
  totalScore?: number | null;

  @ApiProperty({ description: '是否及格，待阅卷或本场不公开成绩时为 null', required: false })
  passed?: boolean | null;

  @ApiProperty({ description: '是否待阅卷（成绩尚未发布）' })
  pendingReview: boolean;

  @ApiProperty({
    description:
      '本场考试设置了不对考生公开成绩（allowViewScore=false）。' +
      '与 pendingReview 是并列的两种「无分可看」，但原因不同：' +
      '前者永远不会有分数可看，后者阅卷后就有。前端文案须区分，' +
      '否则会把「不公开」说成「待阅卷」，让考生一直等一个不会来的结果。',
  })
  scoreHidden: boolean;
}

/** 成绩详情里的单题回顾（含标准答案与解析，仅成绩发布后可见） */
export class AppScoreQuestionVo {
  @ApiProperty({ description: '题目 ID' })
  id: number;

  @ApiProperty({ description: '题型：single/multiple/judge/blank/qa' })
  type: string;

  @ApiProperty({ description: '题型中文名，如「单选题」' })
  typeText: string;

  @ApiProperty({ description: '题干' })
  content: string;

  @ApiProperty({
    description:
      '选项列表，形如 ["A. xxx", "B. yyy"]。判断/填空/问答题无选项，返回空数组。' +
      '复盘必须下发：只给「正确答案 A,C,D」而不给选项内容，考生无法知道选的是什么',
    type: [String],
  })
  options: string[];

  @ApiProperty({ description: '考生作答' })
  userAnswer: string;

  @ApiProperty({
    description:
      '标准答案。本场考试仍可重考时为空串（见 AppScoreDetailVo.answerHidden）',
  })
  answer: string;

  @ApiProperty({
    description: '答案解析。本场考试仍可重考时不返回（同 answer）',
    required: false,
  })
  analysis?: string;

  @ApiProperty({
    description: '本题得分。主观题未阅卷、或本场不公开成绩时为 null',
    required: false,
  })
  score?: number | null;

  @ApiProperty({
    description:
      '批阅人姓名。仅主观题且已人工评分时有值；客观题（系统自动判分）、' +
      '主观题未阅、本场不公开成绩时均为 null',
    nullable: true,
  })
  reviewerName: string | null;

  @ApiProperty({
    description:
      '阅卷评语。评语选填，未写时为 null（不区分「没评过」与「评了但没写话」，' +
      '两者在展示上是同一件事）。与得分同受「查看成绩」开关约束——' +
      '评语常含扣分说明，藏了分数却放出评语等于把扣分过程说了一遍',
    nullable: true,
  })
  reviewComment: string | null;

  @ApiProperty({
    description: '批阅时间，形如 2026-08-01 20:15:00。同 reviewerName 的取值条件',
    nullable: true,
  })
  reviewTime: string | null;
}

/**
 * 成绩详情
 *
 * 逐题回顾用于错题复盘，因此包含标准答案与解析——这与考试中的取卷接口
 * 相反（取卷绝不下发答案）。前提是成绩已发布，未发布时接口直接拒绝。
 */
export class AppScoreDetailVo {
  @ApiProperty({ description: '考试名称' })
  examName: string;

  @ApiProperty({ description: '交卷时间', example: '2026-08-01 20:15:00' })
  submitTime: string;

  @ApiProperty({ description: '总分', required: false })
  totalScore?: number | null;

  @ApiProperty({ description: '客观题得分', required: false })
  objectiveScore?: number | null;

  @ApiProperty({ description: '主观题得分', required: false })
  subjectiveScore?: number | null;

  @ApiProperty({ description: '及格分' })
  passScore: number;

  @ApiProperty({ description: '试卷满分（取自试卷总分）' })
  fullScore: number;

  @ApiProperty({
    description:
      '答题用时（分钟，向上取整）。历史答卷缺 startTime 时为 null，前端隐去该项',
    required: false,
  })
  usedMinutes?: number | null;

  @ApiProperty({ description: '是否及格。本场不公开成绩时为 null' })
  passed: boolean | null;

  @ApiProperty({
    description:
      '本场考试设置了不对考生公开成绩（allowViewScore=false）。为 true 时' +
      'totalScore/objectiveScore/subjectiveScore/passed 以及 questions 里的 score 全为 null。' +
      '与 answerHidden 是两个互不相干的开关：前者管分数（查看成绩），' +
      '后者管标准答案与解析（查看解析），可任意组合。',
  })
  scoreHidden: boolean;

  @ApiProperty({
    description:
      '标准答案与解析是否被隐去，为 true 时 questions 里的 answer/analysis 为空。' +
      '两种情形会隐去：本场仍有作答机会（可重考，避免借复盘套答案后重考）、' +
      '或考试设置关闭了「查看解析」',
  })
  answerHidden: boolean;

  @ApiProperty({
    description:
      '隐去原因：retake 仍可重考（考完即可见）/ setting 考试设置不公开解析（始终不可见）。' +
      'answerHidden 为 false 时是 null。前端据此给出不同提示，' +
      '不可把「始终不公开」说成「考完可见」',
    nullable: true,
    enum: ['retake', 'setting'],
  })
  answerHiddenReason: 'retake' | 'setting' | null;

  @ApiProperty({ description: '逐题回顾', type: [AppScoreQuestionVo] })
  questions: AppScoreQuestionVo[];
}

/**
 * 考生端证书列表项
 *
 * status 按有效期实时判定（valid 有效 / expired 已过期），不存库——
 * 证书不会因为过期而被改写，到期与否是读取时按当前时间算出来的。
 */
export class AppCertificateItemVo {
  @ApiProperty({ description: '证书 ID' })
  id: number;

  @ApiProperty({ description: '证书名称（取自模板标题）' })
  name: string;

  @ApiProperty({ description: '证书编号' })
  code: string;

  @ApiProperty({ description: '状态：valid 有效 / expired 已过期' })
  status: string;

  @ApiProperty({ description: '状态中文名' })
  statusText: string;

  @ApiProperty({ description: '有效期，形如 2026-08-01 至 2029-08-01' })
  validPeriod: string;
}

/** 证书详情 */
export class AppCertificateDetailVo extends AppCertificateItemVo {
  @ApiProperty({ description: '持证人姓名' })
  holderName: string;

  @ApiProperty({ description: '颁发日期', example: '2026-08-01' })
  issueDate: string;

  @ApiProperty({
    description:
      '有效期截止日。与 validPeriod 的后半段同值，单独下发是因为详情页' +
      '已单列发证日期，再显示完整区间会把起始日重复一遍，且区间字符串在窄列里会折行',
    example: '2029-08-01',
  })
  expireDate: string;

  @ApiProperty({ description: '颁发机构' })
  issuer: string;

  @ApiProperty({ description: '版式方向：1=A4 横版（594×420）/ 2=A4 竖版（420×594）' })
  size: number;

  @ApiProperty({ description: '画布宽度（px），前端按屏宽等比缩放的基准' })
  canvasWidth: number;

  @ApiProperty({ description: '画布高度（px）' })
  canvasHeight: number;

  @ApiProperty({ description: '证书底图 URL，未配置时为 null', required: false })
  backgroundImage?: string | null;

  @ApiProperty({ description: '印章图片 URL，未配置时为 null', required: false })
  sealImage?: string | null;

  @ApiProperty({
    description:
      '版式元素。模板未配置版式时为空数组，前端此时回退到纯文字卡片展示',
    type: [AppCertElementVo],
  })
  elements: AppCertElementVo[];
}

/**
 * 证书下载结果
 *
 * 当前只返回建议文件名：项目尚未接入证书 PDF 渲染服务，
 * 真实文件生成需要模板套打能力，接入后在此补 url 字段即可。
 */
export class AppCertificateDownloadVo {
  @ApiProperty({ description: '建议保存的文件名' })
  fileName: string;

  @ApiProperty({ description: '证书编号' })
  code: string;

  @ApiProperty({
    description:
      '文件是否真的可下载。PDF 套打尚未接入，当前恒为 false，' +
      '前端应提示「暂未开放」而不是「已开始下载」',
  })
  available: boolean;
}
