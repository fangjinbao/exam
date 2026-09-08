import {
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  MethodNotAllowedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiOkResponse } from '@nestjs/swagger';
import { CrudController, CrudControllerFactory } from '@/common/crud';
import { ApiOkVoid, ApiPageResult, Perms, OperationLog, Admin } from '@/common/decorators';
import { ResultDto } from '@/common/dto/result.dto';
import { GradingService } from '../../services/grading.service';
import { GradingSheetService } from '../../services/grading-sheet.service';
import { AdminPayload } from '../../services/org-scope.service';
import { SubmitReviewDto } from '../../dto/grading.dto';
import {
  GradingTaskVo,
  GradingExamVo,
  GradingCandidateVo,
  GradingBatchPublishVo,
  GradingBatchWithdrawVo,
} from '../../vo/grading.vo';

/**
 * 阅卷中心控制器
 *
 * 两层粒度：
 * - 考试维度（exams / exams/:examId/candidates / exams/:examId/publish|withdraw）：
 *   阅卷入口按场次组织，看整场待阅份数、按场次批量发布或撤回。
 * - 答卷维度（list / tasks/:sheetId/*）：整卷详情、主观题人工评分、单份发布/撤回。
 *
 * 客观题交卷即自动判分（此处提供补算入口）；主观题只做人工逐题评分，无 AI 阅卷。
 */
@ApiTags('阅卷中心')
@CrudController({
  // ⚠️ api: [] 并不能阻止基类 CRUD 路由注册——该字段只写进类元数据，
  // 全项目仅消费 prefix 与 pageQueryOp，从未用它做条件注册。
  // 因此基类的 detail/add/update/update-status/delete/batch-delete 仍会沿原型链挂上来，
  // 本类通过逐个覆写来收口（detail 补挂指派守卫，5 个写接口无装饰器覆写以取消注册）。
  prefix: 'admin/exam/grading',
  api: [],
})
export class GradingController extends CrudControllerFactory(GradingTaskVo) {
  constructor(
    private readonly gradingService: GradingService,
    private readonly gradingSheetService: GradingSheetService,
  ) {
    super(gradingService);
  }

  /**
   * 解析当前用户的阅卷指派范围
   * 超管返回 undefined（不受约束）；非超管返回其用户 ID，
   * 身份识别不出时返回 -1 这个不存在的用户 ID —— 返回 undefined 会让约束整体失效，属权限放大。
   */
  private resolveAssignedTo(admin?: AdminPayload): number | undefined {
    // 超管判定沿用项目既有做法，见 base/controllers/open.controller.ts
    return admin?.username === 'admin' ? undefined : (admin?.userId ?? -1);
  }

  /**
   * 阅卷指派守卫：非超管访问未指派给自己的答卷时拒绝
   *
   * 列表已按指派过滤，但按 sheetId 的接口若不校验，
   * 拿到（或猜到）ID 就能绕过列表读取明细、改分、发布成绩，属水平越权，故此处逐个接口拦。
   * 答卷不存在与无权访问统一返回同一提示，避免按 ID 探测答卷是否存在。
   *
   * @returns 通过返回 null；未通过返回可直接 return 的失败响应
   */
  private async denyIfNotAssigned(sheetId: number, admin?: AdminPayload) {
    const assignedTo = this.resolveAssignedTo(admin);
    const allowed = await this.gradingService.canGradeSheet(sheetId, assignedTo);
    return allowed ? null : this.fail('答卷不存在或未指派给你阅卷');
  }

  /**
   * 考试维度的阅卷指派守卫
   *
   * 按 examId 取数的接口不能用 denyIfNotAssigned（那个按 sheetId 判），
   * 否则拿到 examId 就能读取别人负责考试的考生名单、或批量发布/撤回其成绩。
   * 考试不存在与无权访问同样返回一个提示，避免按 ID 探测考试是否存在。
   *
   * @returns 通过返回 null；未通过返回可直接 return 的失败响应
   */
  private async denyIfExamNotAssigned(examId: number, admin?: AdminPayload) {
    const assignedTo = this.resolveAssignedTo(admin);
    const allowed = await this.gradingService.canGradeExam(examId, assignedTo);
    return allowed ? null : this.fail('考试不存在或未指派给你阅卷');
  }

  /**
   * 考试维度阅卷列表（阅卷中心首屏）
   *
   * 路由放在 list 之前声明，避免与基类继承的通配路由抢匹配。
   * 权限点复用 list：这两个接口是同一份数据的两种视图，
   * 单独造一个权限码只会让已授权的角色突然看不到列表。
   */
  @Get('exams')
  @Perms('list')
  @ApiOperation({ summary: '考试维度阅卷列表（带待阅/已发布份数）' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiQuery({ name: 'examName', required: false, description: '考试名称（模糊）' })
  @ApiQuery({
    name: 'progress',
    required: false,
    description: '整场进度：pending 尚有未阅完 / completed 全部阅完 / published 全部已发布',
  })
  @ApiPageResult(GradingExamVo)
  async exams(@Query() query: Record<string, any>, @Admin() admin?: AdminPayload) {
    const assignedTo = this.resolveAssignedTo(admin);
    const data = await this.gradingService.examPageList(
      {
        examName: query.examName,
        progress: query.progress,
        assignedTo,
      },
      query.page ? Number(query.page) : undefined,
      query.pageSize ? Number(query.pageSize) : undefined,
    );
    return this.ok(data);
  }

  /**
   * 某场考试的考生名单（阅卷工作台左侧切换用，不分页）
   */
  @Get('exams/:examId/candidates')
  @Perms('list')
  @ApiOperation({ summary: '某场考试的答卷名单（阅卷工作台切换考生用）' })
  @ApiParam({ name: 'examId', description: '考试 ID', type: Number })
  @ApiOkResponse({ type: [GradingCandidateVo] })
  async examCandidates(
    @Param('examId', ParseIntPipe) examId: number,
    @Admin() admin?: AdminPayload,
  ) {
    const denied = await this.denyIfExamNotAssigned(examId, admin);
    if (denied) return denied;
    const data = await this.gradingService.getExamCandidates(examId);
    return this.ok(data);
  }

  /**
   * 整场发布成绩
   * 主观题未阅完的答卷会被跳过而非整场失败，返回体带跳过份数与原因。
   */
  @Post('exams/:examId/publish')
  @Perms('publish')
  @OperationLog({ target: '阅卷中心', type: '编辑', content: '整场发布成绩' })
  @ApiOperation({ summary: '整场发布成绩（跳过不满足条件的答卷）' })
  @ApiParam({ name: 'examId', description: '考试 ID', type: Number })
  @ApiOkResponse({ type: GradingBatchPublishVo })
  async publishExam(
    @Param('examId', ParseIntPipe) examId: number,
    @Admin() admin?: AdminPayload,
  ) {
    const denied = await this.denyIfExamNotAssigned(examId, admin);
    if (denied) return denied;
    const data = await this.gradingService.publishExamScores(examId);
    return this.ok(data);
  }

  /**
   * 整场撤回成绩
   */
  @Post('exams/:examId/withdraw')
  @Perms('withdraw')
  @OperationLog({ target: '阅卷中心', type: '编辑', content: '整场撤回成绩' })
  @ApiOperation({ summary: '整场撤回成绩' })
  @ApiParam({ name: 'examId', description: '考试 ID', type: Number })
  @ApiOkResponse({ type: GradingBatchWithdrawVo })
  async withdrawExam(
    @Param('examId', ParseIntPipe) examId: number,
    @Admin() admin?: AdminPayload,
  ) {
    const denied = await this.denyIfExamNotAssigned(examId, admin);
    if (denied) return denied;
    const data = await this.gradingService.withdrawExamScores(examId);
    return this.ok(data);
  }

  /**
   * 阅卷任务分页列表（答卷维度，工作台内按考试筛选时仍在用）
   * 支持考试名称模糊、阅卷状态、考生关键词筛选。
   */
  @Get('list')
  @Perms('list')
  @ApiOperation({ summary: '阅卷任务分页列表（考试名/状态/考生筛选）' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiQuery({ name: 'examName', required: false, description: '考试名称（模糊）' })
  @ApiQuery({ name: 'gradingStatus', required: false, description: '阅卷状态' })
  @ApiQuery({ name: 'candidateKeyword', required: false, description: '考生姓名（模糊）' })
  // 覆写会遮蔽工厂类的 @ApiPageResult(vo)，须自己补上。
  // 与 detail 不同，这里标 GradingTaskVo 是名副其实的：
  // pageList 现算的 examName/objectiveCount/subjectiveCount 正是该 VO 的字段。
  @ApiPageResult(GradingTaskVo)
  override async list(@Query() query: Record<string, any>, @Admin() admin?: AdminPayload) {
    // 超管看全部；其余人只看指派给自己的（以及尚无阅卷人指派的考试）
    const assignedTo = this.resolveAssignedTo(admin);
    const data = await this.gradingService.pageList(
      {
        examName: query.examName,
        gradingStatus: query.gradingStatus,
        candidateKeyword: query.candidateKeyword,
        assignedTo,
      },
      query.page ? Number(query.page) : undefined,
      query.pageSize ? Number(query.pageSize) : undefined,
    );
    return this.ok(data);
  }

  /**
   * 答卷详情（覆写基类继承的 detail，补挂指派守卫）
   *
   * 必须覆写：@CrudController 的 api: [] 只是元数据，全项目没有任何地方用它拦截路由注册，
   * 故 CrudControllerFactory 的 GET detail/:id 仍会沿原型链注册。
   * 它与 objective/subjective/review-records 同为 @Perms('detail')，
   * 即阅卷人干活必备的 exam:grading:detail —— 不挂守卫就能凭该权限直接读任意答卷。
   */
  @Get('detail/:id')
  @Perms('detail')
  @ApiOperation({ summary: '答卷详情（受阅卷指派约束）' })
  @ApiParam({ name: 'id', description: '答卷 ID', type: Number })
  // 沿用基类的不承诺结构写法，不能标 @ApiResult(GradingTaskVo)：
  // 本类未配 pageQueryOp，super.detail 经 BaseService.info 返回 answerSheet 单表原始行，
  // 而 GradingTaskVo 含 examName/objectiveCount/subjectiveCount 三个 pageList 现算字段，
  // 标上去等于给前端一个假的结构承诺。
  @ApiOkResponse({ type: ResultDto, description: '答卷详情' })
  override async detail(@Param('id', ParseIntPipe) id: number, @Admin() admin?: AdminPayload) {
    const denied = await this.denyIfNotAssigned(id, admin);
    if (denied) return denied;
    return super.detail(id);
  }

  /**
   * 以下 5 个基类写接口在阅卷模块无意义且危险，故无装饰器覆写以取消路由注册：
   * 答卷由考生交卷产生，不该被后台增删改；delete/batch-delete 更是直接销毁考生答卷。
   * 覆写后子类实现上没有 path 元数据，Nest 按方法名解析到最派生实现，该路由即不再注册。
   *
   * override 关键字是必需的护栏而非装饰：这套取消注册依赖方法名与基类精确匹配，
   * 基类日后重命名（如 updateStatus → patchStatus）会让覆写静默退化成无人调用的新方法，
   * 基类那条带 @Perms 的路由随之重新注册且无守卫 —— 加 override 后这种改名直接编译报错。
   * 方法体抛 MethodNotAllowedException 而非裸 Error：后者经全局过滤器变成 500 并写错误日志，
   * 把编程错误伪装成服务故障；也不能用 this.fail()，那会返回 code:400 的 200 外壳，
   * 反而把编程错误伪装成一次正常的业务失败。
   */
  private static readonly UNSUPPORTED = '阅卷模块不支持该操作';

  override async add(): Promise<never> {
    throw new MethodNotAllowedException(GradingController.UNSUPPORTED);
  }

  override async update(): Promise<never> {
    throw new MethodNotAllowedException(GradingController.UNSUPPORTED);
  }

  override async updateStatus(): Promise<never> {
    throw new MethodNotAllowedException(GradingController.UNSUPPORTED);
  }

  override async delete(): Promise<never> {
    throw new MethodNotAllowedException(GradingController.UNSUPPORTED);
  }

  override async batchDelete(): Promise<never> {
    throw new MethodNotAllowedException(GradingController.UNSUPPORTED);
  }

  /**
   * 整卷阅卷详情（卷头信息 + 全部题目，客观题只读、主观题可评分）
   *
   * 客观题若尚未判分则先补算一次，保证卷面得分对用户可见。
   * 不拆成客观题/主观题两个接口：工作台按题型分大题展示，
   * 分两次拉会让「第几大题」的序号在两个响应之间对不齐。
   */
  @Get('tasks/:sheetId/sheet')
  @Perms('detail')
  @ApiOperation({ summary: '整卷阅卷详情（未判分时自动补算客观题）' })
  @ApiParam({ name: 'sheetId', description: '答卷 ID', type: Number })
  async sheetDetail(@Param('sheetId', ParseIntPipe) sheetId: number, @Admin() admin?: AdminPayload) {
    const denied = await this.denyIfNotAssigned(sheetId, admin);
    if (denied) return denied;
    const sheet = await this.gradingService.getSheet(sheetId);
    if (!sheet) return this.fail('答卷不存在');
    if (sheet.objectiveScore === null) {
      await this.gradingService.autoGradeObjective(sheetId);
    }
    const detail = await this.gradingSheetService.getSheetDetail(sheetId);
    if (!detail) return this.fail('答卷不存在');
    return this.ok(detail);
  }

  /**
   * 提交人工评分
   * 逐题写不可删改的评分记录并回写最终分；全部主观题评完后答卷进入已完成。
   */
  @Post('tasks/:sheetId/review')
  @Perms('review')
  @ApiOperation({ summary: '提交人工评分（写评分记录 + 回写最终分）' })
  @OperationLog({ target: '阅卷中心', type: '编辑', content: '人工评分' })
  @ApiParam({ name: 'sheetId', description: '答卷 ID', type: Number })
  @ApiOkVoid()
  async review(
    @Param('sheetId', ParseIntPipe) sheetId: number,
    @Body() dto: SubmitReviewDto,
    @Admin() admin: AdminPayload,
  ) {
    const denied = await this.denyIfNotAssigned(sheetId, admin);
    if (denied) return denied;
    const sheet = await this.gradingService.getSheet(sheetId);
    if (!sheet) return this.fail('答卷不存在');
    if (sheet.scorePublished) return this.fail('成绩已发布，如需修改请先撤回成绩');
    // 评分留痕须记录真实阅卷人，缺失身份时拒绝（append-only 审计不接受兜底 0/系统）
    if (!admin?.userId) return this.fail('无法识别阅卷人身份，请重新登录后再试');
    try {
      await this.gradingService.submitReview(sheetId, dto.items, {
        id: admin.userId,
        name: admin.username ?? `用户${admin.userId}`,
      });
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '评分失败');
    }
    return this.ok(null, '评分已保存');
  }

  /**
   * 评分记录查看（append-only 留痕，不可删改）
   *
   * 前端阅卷工作台已不展示该记录，但接口保留：评分改动的审计轨迹仍需可查，
   * 且删掉后既有留痕数据将无任何读取入口。
   */
  @Get('tasks/:sheetId/review-records')
  @Perms('detail')
  @ApiOperation({ summary: '评分记录查看' })
  @ApiParam({ name: 'sheetId', description: '答卷 ID', type: Number })
  async reviewRecords(@Param('sheetId', ParseIntPipe) sheetId: number, @Admin() admin?: AdminPayload) {
    const denied = await this.denyIfNotAssigned(sheetId, admin);
    if (denied) return denied;
    const records = await this.gradingService.getReviewRecords(sheetId);
    return this.ok(records);
  }

  /**
   * 成绩发布（汇总总分 + 及格判定，发布后考生可查）
   */
  @Post('tasks/:sheetId/publish')
  @Perms('publish')
  @ApiOperation({ summary: '成绩发布（存在未阅主观题时阻止）' })
  @OperationLog({ target: '阅卷中心', type: '编辑', content: '发布成绩' })
  @ApiParam({ name: 'sheetId', description: '答卷 ID', type: Number })
  @ApiOkVoid()
  async publish(@Param('sheetId', ParseIntPipe) sheetId: number, @Admin() admin?: AdminPayload) {
    const denied = await this.denyIfNotAssigned(sheetId, admin);
    if (denied) return denied;
    try {
      await this.gradingService.publishScore(sheetId);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '发布失败');
    }
    return this.ok(null, '成绩已发布');
  }

  /**
   * 成绩撤回（回退待复核，考生不可查）
   */
  @Post('tasks/:sheetId/withdraw')
  @Perms('withdraw')
  @ApiOperation({ summary: '成绩撤回（回退待复核）' })
  @OperationLog({ target: '阅卷中心', type: '编辑', content: '撤回成绩' })
  @ApiParam({ name: 'sheetId', description: '答卷 ID', type: Number })
  @ApiOkVoid()
  async withdraw(@Param('sheetId', ParseIntPipe) sheetId: number, @Admin() admin?: AdminPayload) {
    const denied = await this.denyIfNotAssigned(sheetId, admin);
    if (denied) return denied;
    try {
      await this.gradingService.withdrawScore(sheetId);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '撤回失败');
    }
    return this.ok(null, '成绩已撤回');
  }
}
