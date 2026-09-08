import { ApiProperty } from '@nestjs/swagger';
import { AppCertElementVo } from '@/modules/exam/vo/cert-element.vo';

/**
 * 考生端考试列表项
 *
 * 考试状态按当前时间实时判定，不直接用库里的 status 字段
 * （管理端发布后不会随时间改写状态，故考生端需惰性纠正）。
 */
export class AppExamItemVo {
  @ApiProperty({ description: '考试 ID' })
  id: number;

  @ApiProperty({ description: '考试名称' })
  name: string;

  @ApiProperty({ description: '开始时间', example: '2026-08-01 18:32:33' })
  startTime: string;

  @ApiProperty({ description: '结束时间', example: '2026-08-01 21:02:33' })
  endTime: string;

  @ApiProperty({ description: '考试时长（分钟）' })
  duration: number;

  @ApiProperty({ description: '实时状态：published 未开始 / ongoing 进行中 / finished 已结束' })
  status: string;

  @ApiProperty({ description: '本人是否已交卷' })
  submitted: boolean;

  @ApiProperty({ description: '考试说明', required: false })
  description?: string;

  @ApiProperty({ description: '及格分' })
  passScore: number;

  @ApiProperty({ description: '题目数量（取自试卷）' })
  questionCount: number;
}

/** 考生端考试详情（比列表项多出试卷总分与考试设置） */
export class AppExamDetailVo extends AppExamItemVo {
  @ApiProperty({ description: '试卷总分' })
  totalScore: number;

  @ApiProperty({
    description:
      '允许提前进入考场的分钟数，0 为到点才能进。' +
      '前端据此启用「进入考试」并提示可进入时刻；服务端取卷时用同一值校验',
  })
  earlyEnterMinutes: number;

  @ApiProperty({
    description:
      '进入作答前是否需签署考试承诺书。仅为开考前的一次确认，不留签署痕迹，' +
      '故服务端不校验此项（前端确认后直接取卷）；如需合规留证须另建签署记录表',
  })
  requireCommitment: boolean;

  @ApiProperty({ description: '最多重考次数，0 为不允许重考（总机会数 = 本值 + 1）' })
  retakeLimit: number;
}

/** 答题页单题结构（不含标准答案，避免考生端拿到答案） */
export class AppPaperQuestionVo {
  @ApiProperty({ description: '题目 ID' })
  id: number;

  @ApiProperty({
    description: '题型：single/multiple/judge/blank/qa/essay/composite（composite 为材料题，仅承载材料不作答）',
  })
  type: string;

  @ApiProperty({ description: '本题分值（材料题为 0，分值在其各小题上）' })
  score: number;

  @ApiProperty({ description: '题干' })
  stem: string;

  @ApiProperty({
    description: '选项数组（选择题有值，判断/填空/简答为空数组）',
    type: [String],
  })
  options: string[];

  @ApiProperty({
    description: '所属材料题 ID；独立题为 null。考生端据此把小题收拢到材料题下一屏作答',
    required: false,
    nullable: true,
  })
  parentId: number | null;

  @ApiProperty({
    description:
      '填空题的空位数（非填空题为 0）。考生端据此渲染对应数量的输入框，' +
      '与建题校验、判分切分同源，避免两端各算一套导致段数不等而判错',
  })
  blankCount: number;
}

/**
 * 取卷响应
 *
 * 首次取卷会创建答卷并记录开考时间，断线重连时返回同一份答卷与已答记录，
 * remainSeconds 取「开考时刻+时长」与「考试结束时间」的较早者。
 */
export class AppExamPaperVo {
  @ApiProperty({ description: '答卷 ID' })
  sheetId: number;

  @ApiProperty({ description: '考试 ID' })
  examId: number;

  @ApiProperty({ description: '考试名称' })
  examName: string;


  @ApiProperty({
    description:
      '是否开启切屏检测。为 false 时前端不得监听 visibilitychange，' +
      '否则未开防切屏的考试也会累计切屏次数并弹告警',
  })
  screenSwitchDetect: boolean;

  @ApiProperty({ description: '允许切屏次数，0 为不限（仅记录不强制交卷）' })
  allowSwitchTimes: number;

  @ApiProperty({ description: '已切屏次数' })
  switchCount: number;

  @ApiProperty({
    description: '是否限制复制粘贴/右键/长按选择等操作',
  })
  operationRestrict: boolean;

  @ApiProperty({
    description: '是否允许提前交卷。为 false 时前端应隐藏交卷入口，到点自动交卷',
  })
  allowEarlySubmit: boolean;

  @ApiProperty({
    description:
      '最短作答时长（分钟），0 为不限。未满时长时交卷会被服务端拒绝，' +
      '前端应据 elapsedSeconds 提前置灰交卷按钮并提示还需多久',
  })
  minAnswerMinutes: number;

  @ApiProperty({ description: '答题页是否显示剩余时间倒计时' })
  showRemainingTime: boolean;

  @ApiProperty({
    description:
      '本份答卷已作答秒数（服务端计算）。前端据此判断最短作答时长是否已满，' +
      '不要用本地时钟算——改系统时间即可绕过',
  })
  elapsedSeconds: number;

  @ApiProperty({ description: '剩余作答秒数' })
  remainSeconds: number;

  @ApiProperty({ description: '题目列表', type: [AppPaperQuestionVo] })
  questions: AppPaperQuestionVo[];

  @ApiProperty({
    description: '已作答记录，键为题目 ID、值为作答内容（断线重连回填）',
    example: { '1': 'A', '2': 'A,B' },
  })
  answers: Record<string, string>;
}

/** 答案保存结果 */
export class AppSaveAnswerVo {
  @ApiProperty({ description: '保存时间', example: '2026-08-01 19:20:00' })
  savedAt: string;
}

/**
 * 交卷结果
 *
 * 客观题即时判分；含主观题时总分待阅卷后才完整，
 * 故成绩是否可见由 scorePublished 决定。
 */
export class AppSubmitExamVo {
  @ApiProperty({ description: '答卷 ID' })
  sheetId: number;

  @ApiProperty({
    description:
      '客观题得分。本场设置不对考生公开成绩（allowViewScore=false）时为 null——' +
      '交卷这一刻纯客观题卷已判分，此处若照发，抓包即可拿到本该不公开的分数。' +
      '成绩展示一律走结果页（getExamResult），那里有完整的发布/公开判定。',
    nullable: true,
  })
  objectiveScore: number | null;

  @ApiProperty({ description: '是否含待阅卷的主观题' })
  hasSubjective: boolean;

  @ApiProperty({ description: '成绩是否已发布（未发布时前端不展示分数）' })
  scorePublished: boolean;
}

/**
 * 结果页上的本场所发证书
 *
 * 带完整版式：结果页的证书小样与证书详情页是同一张证书，长得必须一样。
 * 早先此处只回底图，前端渲成了一个没有任何文字的空白框，与点进去看到的
 * 证书判若两物。渲染语义统一在 modules/exam/utils/cert-render.ts，
 * 两边共用，不存在双份维护。
 * 字段命名对齐 AppCertificateItemVo 与证书详情（name/code/validPeriod/
 * canvasWidth/canvasHeight/elements），避免同一张证书在两个接口里叫不同名字。
 */
export class AppExamResultCertVo {
  @ApiProperty({ description: '证书 ID（前端据此跳证书详情页）' })
  id: number;

  @ApiProperty({ description: '证书名称（取自模板标题）' })
  name: string;

  @ApiProperty({ description: '证书编号' })
  code: string;

  @ApiProperty({ description: '颁发机构' })
  issuer: string;

  @ApiProperty({ description: '颁发日期', example: '2026-08-20' })
  issueDate: string;

  @ApiProperty({ description: '有效期，形如 2026-08-20 至 2029-08-20' })
  validPeriod: string;

  @ApiProperty({
    description: '证书底图 URL，未配置时为 null（前端此时回退到纯色占位）',
    nullable: true,
  })
  backgroundImage: string | null;

  @ApiProperty({ description: '印章图片 URL，未配置时为 null', nullable: true })
  sealImage: string | null;

  @ApiProperty({ description: '画布宽（px，A4 基准 2px/mm）', example: 420 })
  canvasWidth: number;

  @ApiProperty({ description: '画布高（px，A4 基准 2px/mm）', example: 594 })
  canvasHeight: number;

  @ApiProperty({
    description: '版式元素（占位符已在服务端填好值，前端只按坐标摆放）',
    type: () => [AppCertElementVo],
  })
  elements: AppCertElementVo[];
}

/* AppCertElementVo 见 exam/vo/cert-element.vo.ts，与证书详情页共用同一份定义 */

/** 交卷结果详情（考生端结果页） */
export class AppExamResultVo {
  @ApiProperty({ description: '考试名称' })
  examName: string;

  @ApiProperty({
    description:
      '成绩是否可见（已发布 且 考试设置允许考生查看）。为 false 时不下发任何分数字段，' +
      '前端需结合 scoreWithheld 区分「待阅卷」与「本场不公开成绩」',
  })
  scoreReleased: boolean;

  @ApiProperty({
    description:
      '成绩是否被设置挡住：已发布但考试设置关闭了「查看成绩」时为 true。' +
      '此时不是待阅卷，提示应为「本场成绩不对考生公开」，' +
      '不可说成「稍后可查」——那个结果永远不会来。' +
      '注意证书不受此开关影响，仍会正常下发：证书是已发放的凭证，' +
      '且在「我的证书」列表本就可见，结果页单独藏起来只是半途而废',
  })
  scoreWithheld: boolean;

  @ApiProperty({ description: '总得分（成绩未发布为 null）', nullable: true })
  totalScore: number | null;

  @ApiProperty({ description: '客观题得分（未判分为 null）', nullable: true })
  objectiveScore: number | null;

  @ApiProperty({ description: '主观题得分（无主观题或未阅卷为 null）', nullable: true })
  subjectiveScore: number | null;

  @ApiProperty({
    description: '是否及格（成绩发布后有值；为 null 时前端不显示合格结论）',
    nullable: true,
  })
  passed: boolean | null;

  @ApiProperty({ description: '交卷时间' })
  submitTime: string;

  @ApiProperty({ description: '试卷题目数量' })
  questionCount: number;

  @ApiProperty({ description: '试卷总分' })
  fullScore: number;

  @ApiProperty({ description: '及格分' })
  passScore: number;

  @ApiProperty({ description: '切屏次数' })
  switchCount: number;

  @ApiProperty({
    description:
      '本场所发证书；未及格、未开启自动发证、或成绩未发布时为 null',
    type: AppExamResultCertVo,
    nullable: true,
  })
  certificate: AppExamResultCertVo | null;

  @ApiProperty({
    description:
      '发证待出：本场开了自动发证且考生已及格，但证书尚未查到。' +
      '发证在成绩发布时触发（GradingService.issueCertificate），失败不回滚成绩，' +
      '故该状态真实存在。两类成因的可观测性不同：' +
      '模板被删或未配可用模板会抛错并被 publishScore 记日志；' +
      '而证书编号流水号撞号走的是 P2002 分支、被当作「已发出」直接 return，' +
      '既没有证书落库也没有日志留痕，运维无法主动发现，只能靠考生反馈。' +
      '另注：成绩一经发布不可重发，且没有独立的补发证入口，' +
      '故本字段一旦为真通常不会自行转假。前端因此不能静默不显示——' +
      '考生看到合格却没有任何证书线索只会以为系统漏发，' +
      '文案需给出「长时间未出请联系管理员」这类可行动的出口。',
  })
  certPending: boolean;

  @ApiProperty({
    description:
      '本场对该考生是否还有作答机会（可重考）。判定与取卷闸门 startExam 逐条对齐：' +
      '考试未结束、且已交卷次数 < 总机会数。前端据此在结果页给出重考入口——' +
      '两处口径若不一致，会出现「显示可重考、点了被拒」，比不给入口更糟。' +
      '与阅卷进度无关：含主观题的卷待阅卷期间同样可以重考。',
  })
  canRetake: boolean;

  @ApiProperty({ description: '本场已交卷次数（含本次）' })
  submittedCount: number;

  @ApiProperty({
    description: '本场总机会数 = 考试设置的 retakeLimit + 1。与 submittedCount 配合展示「已考 M/N 次」',
  })
  allowedAttempts: number;
}

/** 切屏告警上报结果 */
export class AppSwitchAlarmVo {
  @ApiProperty({ description: '已累计切屏次数' })
  switchCount: number;

  @ApiProperty({ description: '是否已超出允许次数（超出则前端应强制交卷）' })
  exceeded: boolean;
}

