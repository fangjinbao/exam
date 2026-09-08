import { Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CrudController, CrudControllerFactory } from '@/common/crud';
import { ApiResult, ApiArrayResult, ApiOkVoid, Perms, OperationLog } from '@/common/decorators';
import { Admin } from '@/common/decorators/admin.decorator';
import type { AdminPayload } from '../../services/org-scope.service';
import { ExamService } from '../../services/exam.service';
import { ExamScoreService } from '../../services/exam-score.service';
import { ExamCandidateImportService } from '../../services/exam-candidate-import.service';
import { ExamStaffService } from '../../services/exam-staff.service';
import {
  CreateExamDto,
  UpdateExamDto,
  CopyExamDto,
  AssignCandidatesDto,
  AppendCandidatesDto,
  RemoveCandidatesDto,
  AssignStaffDto,
  ImportExamCandidateDto,
} from '../../dto/exam.dto';
import { ExamVo, ExamDetailVo } from '../../vo/exam.vo';
import { ExamScoreItemVo, ResolveImportResultVo } from '../../vo/exam-score.vo';

/**
 * 考试管理控制器
 * 提供考试分页筛选、详情、创建（基本信息+试卷+考生+防作弊）、编辑（仅未发布）、
 * 分配考生、发布/撤回、删除（已发布/进行中阻止）。状态随考试时间由服务惰性推进。
 */
@ApiTags('考试管理')
@CrudController({
  prefix: 'admin/exam/exam',
  api: [],
})
export class ExamController extends CrudControllerFactory(ExamVo) {
  constructor(
    private readonly examService: ExamService,
    private readonly examScoreService: ExamScoreService,
    private readonly candidateImportService: ExamCandidateImportService,
    private readonly examStaffService: ExamStaffService,
  ) {
    super(examService);
  }

  /**
   * 考试分页列表
   * 支持名称模糊、状态精确、开始时间日期范围筛选；带试卷名称/类型与参考人数。
   */
  @Get('list')
  @Perms('list')
  @ApiOperation({ summary: '考试分页列表（名称模糊 + 状态 + 时间范围）' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiQuery({ name: 'keyword', required: false, description: '考试名称（模糊）' })
  @ApiQuery({ name: 'status', required: false, description: '状态 unpublished/published/ongoing/finished' })
  @ApiQuery({ name: 'examType', required: false, description: '考试类型 normal/skill' })
  @ApiQuery({ name: 'startDate', required: false, description: '开始日期（含）YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束日期（含）YYYY-MM-DD' })
  async list(@Query() query: Record<string, any>, @Admin() adminRaw?: AdminPayload) {
    const data = await this.examService.pageList(
      {
        keyword: query.keyword,
        status: query.status,
        examType: query.examType,
        startDate: query.startDate,
        endDate: query.endDate,
      },
      query.page ? Number(query.page) : undefined,
      query.pageSize ? Number(query.pageSize) : undefined,
      adminRaw,
    );
    return this.ok(data);
  }

  /**
   * 考试详情（基本信息 + 考生 + 防作弊策略）
   */
  @Get('detail/:id')
  @Perms('detail')
  @ApiOperation({ summary: '按 id 查询考试详情' })
  @ApiParam({ name: 'id', description: '考试 ID', type: Number })
  @ApiResult(ExamDetailVo)
  async detail(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    await this.examService.assertOwned(id, adminRaw);
    const data = await this.examService.getDetail(id);
    if (!data) return this.fail('考试不存在');
    const [proctors, graders] = await Promise.all([
      this.examStaffService.list(id, 'proctor'),
      this.examStaffService.list(id, 'grader'),
    ]);
    return this.ok({ ...data, proctors, graders });
  }

  /**
   * 考生成绩分页（以已分配考生为全集，未参加的也会列出）
   */
  @Get('score/:id')
  @Perms('detail')
  @ApiOperation({ summary: '考生成绩分页（含未参加的考生）' })
  @ApiParam({ name: 'id', description: '考试 ID', type: Number })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiQuery({ name: 'keyword', required: false, description: '考生姓名（模糊）' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: '状态 not_started/ongoing/pending_grading/completed',
  })
  async scorePage(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: Record<string, any>,
    @Admin() adminRaw?: AdminPayload,
  ) {
    await this.examService.assertOwned(id, adminRaw);
    const data = await this.examScoreService.pageByExam(
      id,
      { keyword: query.keyword, status: query.status },
      query.page ? Number(query.page) : undefined,
      query.pageSize ? Number(query.pageSize) : undefined,
    );
    return this.ok(data);
  }

  /**
   * 考生成绩全量导出数据（不分页，供前端生成 xlsx）
   */
  @Get('score-export/:id')
  @Perms('detail')
  @ApiOperation({ summary: '考生成绩全量数据（导出用，不分页）' })
  @ApiParam({ name: 'id', description: '考试 ID', type: Number })
  @ApiQuery({ name: 'keyword', required: false, description: '考生姓名（模糊）' })
  @ApiQuery({ name: 'status', required: false, description: '状态筛选，与列表一致' })
  @ApiArrayResult(ExamScoreItemVo)
  async scoreExport(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: Record<string, any>,
    @Admin() adminRaw?: AdminPayload,
  ) {
    await this.examService.assertOwned(id, adminRaw);
    const data = await this.examScoreService.listByExam(id, {
      keyword: query.keyword,
      status: query.status,
    });
    return this.ok(data);
  }

  /**
   * 导入考生：把 Excel 行匹配为系统内已存在的人员
   *
   * 只做匹配不落库，匹配结果交由前端合并进已选列表，随考试一起保存。
   * 这样用户导入后仍可在页面上增删调整，避免导入即写库带来的「误导入无法撤销」。
   */
  @Post('resolve-import-candidates')
  @Perms('update')
  @ApiOperation({ summary: '导入考生：按账号匹配系统内已存在的人员（不落库）' })
  @ApiResult(ResolveImportResultVo)
  async resolveImportCandidates(@Body() dto: ImportExamCandidateDto) {
    const data = await this.candidateImportService.resolve(dto.rows);
    return this.ok(data);
  }

  /**
   * 创建考试
   * 校验名称唯一、结束时间晚于开始时间、所选试卷为已发布。
   */
  @Post('add')
  @Perms('add')
  @ApiOperation({ summary: '创建考试（基本信息+试卷+考生+防作弊）' })
  @OperationLog({ target: '考试管理', type: '新增', content: '创建考试' })
  @ApiResult(ExamVo)
  async add(@Body() dto: CreateExamDto, @Admin() admin?: AdminPayload) {
    const err = await this.validateExam(dto);
    if (err) return this.fail(err);
    // 技能鉴定考试的名单由后端按项目重建，前端传来的这批会被整体忽略，
    // 校验它只会因为一批用不上的数据把考试卡住
    if (dto.examType !== 'skill' && dto.candidates?.length) {
      const cErr = await this.examService.validateCandidatesExist(dto.candidates);
      if (cErr) return this.fail(cErr);
    }
    // 人员校验放在建考试之前：否则考试已落库才报错，会留下一条名单不全的脏数据
    const sErr = await this.validateStaff(dto);
    if (sErr) return this.fail(sErr);
    const exam = await this.examService.createExam(dto, admin?.userId);
    // 监考/阅卷名单在考试建好后写入（需要 examId）；未传即不指派
    await this.examStaffService.assign(exam.id, 'proctor', dto.proctors ?? []);
    await this.examStaffService.assign(exam.id, 'grader', dto.graders ?? []);
    return this.ok(exam, '创建考试成功');
  }

  /**
   * 复制考试（生成未发布副本，任何状态的考试都可复制）
   *
   * 权限复用 add 而不新增 copy：复制的产物就是一场新考试，能建考试的人就能复制，
   * 新增权限码要同时改菜单表与角色绑定，收益却只是把同一件事拆成两个开关。
   *
   * 不校验源考试状态：复制一场已结束的考试来重开下一期是这个功能的主要用途。
   */
  @Post('copy')
  @Perms('add')
  @ApiOperation({ summary: '复制考试（含试卷/设置/考生/监考，生成未发布副本）' })
  @OperationLog({ target: '考试管理', type: '新增', content: '复制考试' })
  @ApiResult(ExamVo)
  async copy(@Body() dto: CopyExamDto, @Admin() admin?: AdminPayload) {
    // 与详情/编辑同一套归属校验：不能跨租户复制别人的考试
    await this.examService.assertOwned(dto.id, admin);
    try {
      const exam = await this.examService.copyExam(dto.id, admin?.userId);
      return this.ok(exam, '复制考试成功');
    } catch (e: any) {
      return this.fail(e?.message ?? '复制考试失败');
    }
  }

  /**
   * 编辑考试（仅未发布可编辑）
   */
  @Put('update')
  @Perms('update')
  @ApiOperation({ summary: '编辑考试（仅未发布可编辑）' })
  @OperationLog({ target: '考试管理', type: '编辑', content: '编辑考试' })
  @ApiOkVoid()
  async update(@Body() dto: UpdateExamDto, @Admin() adminRaw?: AdminPayload) {
    await this.examService.assertOwned(dto.id, adminRaw);
    const real = await this.examService.getRealStatus(dto.id);
    if (real === null) return this.fail('考试不存在');
    if (real !== 'unpublished') return this.fail('考试已发布，无法编辑，请先撤回');
    const err = await this.validateExam(dto, dto.id);
    if (err) return this.fail(err);
    // 同 add：鉴定考试的名单前端说了不算，不校验它传来的那批
    if (dto.examType !== 'skill' && dto.candidates?.length) {
      const cErr = await this.examService.validateCandidatesExist(dto.candidates);
      if (cErr) return this.fail(cErr);
    }
    const sErr = await this.validateStaff(dto);
    if (sErr) return this.fail(sErr);
    await this.examService.updateExam(dto.id, dto);
    // 仅在显式传了名单时才全量替换：字段缺省意为「不改动」，
    // 若一律按空数组处理，未提交该字段的调用方会把已有名单清空
    if (dto.proctors !== undefined) {
      await this.examStaffService.assign(dto.id, 'proctor', dto.proctors);
    }
    if (dto.graders !== undefined) {
      await this.examStaffService.assign(dto.id, 'grader', dto.graders);
    }
    return this.ok(null, '编辑考试成功');
  }

  /**
   * 分配/更新考生（全量替换）
   */
  @Post('assign-candidates')
  @Perms('update')
  @ApiOperation({ summary: '分配/更新考生（全量替换）' })
  @OperationLog({ target: '考试管理', type: '编辑', content: '分配考生' })
  @ApiOkVoid()
  async assignCandidates(@Body() dto: AssignCandidatesDto, @Admin() adminRaw?: AdminPayload) {
    await this.examService.assertOwned(dto.examId, adminRaw);
    const real = await this.examService.getRealStatus(dto.examId);
    if (real === null) return this.fail('考试不存在');
    // 技能鉴定考试的名单由鉴定项目审核结果派生。编辑页已隐藏这三个入口，
    // 但接口能直接调——前端不显示不等于后端拦住
    if ((await this.examService.getExamType(dto.examId)) === 'skill') {
      return this.fail('技能鉴定考试的考生名单由鉴定项目审核结果决定，不支持手工分配');
    }
    if (real !== 'unpublished') return this.fail('考试已发布，无法修改考生，请先撤回');
    const cErr = await this.examService.validateCandidatesExist(dto.candidates);
    if (cErr) return this.fail(cErr);
    const count = await this.examService.assignCandidates(dto.examId, dto.candidates);
    return this.ok(null, `已分配 ${count} 名考生`);
  }

  /**
   * 鉴定项目下审核通过的人员（技能鉴定考试的考生名单预览）
   *
   * 供编辑页绑定项目时即时显示「将带入哪些人」。保存时后端不信这个结果、
   * 按 projectId 自己重查（见 ExamService.resolveCandidates）：只做预览会被绕过，
   * 只做后端落库则用户点保存前完全不知道会发生什么。
   *
   * 取 candidateName 快照而不联表查账号：CertApplication 存姓名快照的用意
   * 就是列表展示不联表、天然规避敏感字段泄露。
   *
   * 不按项目归属收窄可见范围：排考的人未必是项目负责人，限制了鉴定考试
   * 就只有负责人能建。
   *
   * 权限点复用 exam:exam:detail，不新增、不动菜单表。
   */
  @Get('cert-project-candidates/:projectId')
  @Perms('detail')
  @ApiOperation({ summary: '鉴定项目下审核通过的人员（技能鉴定考试考生名单预览）' })
  @ApiParam({ name: 'projectId', description: '鉴定项目 ID', type: Number })
  async certProjectCandidates(@Param('projectId', ParseIntPipe) projectId: number) {
    const list = await this.examService.previewCertProjectCandidates(projectId);
    return this.ok(list);
  }

  /**
   * 考生名单（含「是否已进入考试」标记，供名单弹窗展示与判断可否移除）
   */
  @Get('candidates/:id')
  @Perms('detail')
  @ApiOperation({ summary: '考生名单（带是否已进入考试标记）' })
  @ApiParam({ name: 'id', description: '考试 ID' })
  async candidates(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    await this.examService.assertOwned(id, adminRaw);
    // 与本控制器其他接口口径一致：考试不存在要明确报错，
    // 不能让它和「考试存在但还没分配考生」都返回 200 空数组
    const real = await this.examService.getRealStatus(id);
    if (real === null) return this.fail('考试不存在');
    const list = await this.examService.listCandidatesWithEntry(id);
    return this.ok(list);
  }

  /**
   * 移除考生（仅未进入考试者，已发布/进行中可用）
   *
   * 已进入考试的人由服务层跳过并回报姓名——不能删，否则其答卷会失去
   * 对应的考生分配（AnswerSheet 不走 ExamCandidate 外键，删分配只会留下无主答卷）。
   */
  @Post('remove-candidates')
  @Perms('update')
  @ApiOperation({ summary: '移除考生（仅未进入考试者）' })
  @OperationLog({ target: '考试管理', type: '编辑', content: '移除考生' })
  @ApiOkVoid()
  async removeCandidates(@Body() dto: RemoveCandidatesDto, @Admin() adminRaw?: AdminPayload) {
    await this.examService.assertOwned(dto.examId, adminRaw);
    const real = await this.examService.getRealStatus(dto.examId);
    if (real === null) return this.fail('考试不存在');
    if ((await this.examService.getExamType(dto.examId)) === 'skill') {
      return this.fail('技能鉴定考试的考生名单由鉴定项目审核结果决定，不支持移除考生');
    }
    // 与追加同一档：未发布走编辑页全量维护，已结束不再改名单
    if (real === 'unpublished') {
      return this.fail('考试尚未发布，请在编辑页直接维护考生名单');
    }
    if (real === 'finished') return this.fail('考试已结束，无法移除考生');
    const { removed, blocked } = await this.examService.removeCandidates(dto.examId, dto.ids);
    if (!removed && blocked.length) {
      return this.fail(`${blocked.join('、')} 已进入考试，无法移除`);
    }
    /*
      removed 与 blocked 双零：传进来的行 id 都不属于本场考试（或已被别人删掉）。
      此时报「已移除 0 名考生」会让调用方以为操作成功了，故明确说清。
    */
    if (!removed) return this.fail('所选考生不在本场考试的名单中，请刷新后重试');
    const tail = blocked.length ? `；${blocked.join('、')} 已进入考试，未移除` : '';
    return this.ok(null, `已移除 ${removed} 名考生${tail}`);
  }

  /**
   * 追加考生（只增不减，已发布/进行中可用）
   *
   * 与 assign-candidates 分开而不是放宽后者的状态校验：
   * 后者是全量替换，对进行中的考试用它，前端漏传一个人就会删掉那人的分配，
   * 而他可能正在答题。本接口只 insert，已在名单里的人跳过。
   *
   * 待办无需另行补发：考生端的考试通知从 ExamCandidate + Exam 实时派生，
   * 记录落库即可见。
   */
  @Post('append-candidates')
  @Perms('update')
  @ApiOperation({ summary: '追加考生（只增不减，已发布/进行中可用）' })
  @OperationLog({ target: '考试管理', type: '编辑', content: '追加考生' })
  @ApiOkVoid()
  async appendCandidates(@Body() dto: AppendCandidatesDto, @Admin() adminRaw?: AdminPayload) {
    await this.examService.assertOwned(dto.examId, adminRaw);
    const real = await this.examService.getRealStatus(dto.examId);
    if (real === null) return this.fail('考试不存在');
    if ((await this.examService.getExamType(dto.examId)) === 'skill') {
      return this.fail('技能鉴定考试的考生名单由鉴定项目审核结果决定，不支持追加考生');
    }
    // 未发布态走 assign-candidates 的全量替换即可，不必用追加语义
    if (real === 'unpublished') {
      return this.fail('考试尚未发布，请在编辑页直接维护考生名单');
    }
    if (real === 'finished') return this.fail('考试已结束，无法追加考生');
    const cErr = await this.examService.validateCandidatesExist(dto.candidates);
    if (cErr) return this.fail(cErr);
    const count = await this.examService.appendCandidates(dto.examId, dto.candidates);
    return this.ok(
      null,
      count ? `已追加 ${count} 名考生` : '所选考生均已在名单中，无新增',
    );
  }

  /**
   * 指派监考人/阅卷人（全量替换该岗位名单，任何阶段可用）
   *
   * 不并入 update：编辑考试受「仅未发布」限制，而这两类名单任何阶段都该能调整——
   * 考完才发现没派阅卷人是真实场景。全量替换在这里安全，因为名单不牵连答卷数据。
   */
  @Post('assign-staff')
  @Perms('update')
  @ApiOperation({ summary: '指派监考人/阅卷人（任何阶段可用）' })
  @OperationLog({ target: '考试管理', type: '编辑', content: '指派监考/阅卷人' })
  @ApiOkVoid()
  async assignStaff(@Body() dto: AssignStaffDto, @Admin() adminRaw?: AdminPayload) {
    await this.examService.assertOwned(dto.examId, adminRaw);
    const real = await this.examService.getRealStatus(dto.examId);
    if (real === null) return this.fail('考试不存在');
    const label = dto.role === 'proctor' ? '监考' : '阅卷';
    const sErr = await this.examStaffService.validateExists(dto.staff, label);
    if (sErr) return this.fail(sErr);
    const count = await this.examStaffService.assign(dto.examId, dto.role, dto.staff);
    return this.ok(null, count ? `已指派 ${count} 名${label}人员` : `已清空${label}人员名单`);
  }

  /**
   * 发布考试（未发布→已发布）
   */
  @Post('publish/:id')
  @Perms('publish')
  @ApiOperation({ summary: '发布考试（校验考生与随机卷可用题量）' })
  @OperationLog({ target: '考试管理', type: '编辑', content: '发布考试' })
  @ApiParam({ name: 'id', description: '考试 ID', type: Number })
  @ApiOkVoid()
  async publish(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    await this.examService.assertOwned(id, adminRaw);
    try {
      await this.examService.publish(id);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '发布失败');
    }
    return this.ok(null, '考试已发布');
  }

  /**
   * 撤回考试（已发布且未开始→未发布）
   */
  @Post('withdraw/:id')
  @Perms('withdraw')
  @ApiOperation({ summary: '撤回考试（仅未开始可撤回）' })
  @OperationLog({ target: '考试管理', type: '编辑', content: '撤回考试' })
  @ApiParam({ name: 'id', description: '考试 ID', type: Number })
  @ApiOkVoid()
  async withdraw(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    await this.examService.assertOwned(id, adminRaw);
    try {
      await this.examService.withdraw(id);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '撤回失败');
    }
    return this.ok(null, '考试已撤回');
  }

  /**
   * 删除考试（已发布/进行中阻止）
   */
  @Delete('delete/:id')
  @Perms('delete')
  @ApiOperation({ summary: '按 id 删除考试（已发布/进行中阻止）' })
  @OperationLog({ target: '考试管理', type: '删除', content: '删除考试' })
  @ApiParam({ name: 'id', description: '考试 ID', type: Number })
  @ApiOkVoid()
  async delete(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    await this.examService.assertOwned(id, adminRaw);
    try {
      await this.examService.ensureDeletable(id);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '无法删除');
    }
    await this.examService.delete([id]);
    return this.ok(null, '删除考试成功');
  }

  /**
   * 批量删除考试（任一已发布/进行中时整体阻止）
   */
  @Post('batch-delete')
  @Perms('batch-delete')
  @ApiOperation({ summary: '批量删除考试（任一已发布/进行中时整体阻止）' })
  @OperationLog({ target: '考试管理', type: '删除', content: '批量删除考试' })
  @ApiOkVoid()
  async batchDelete(@Body() body: { ids: number[] }, @Admin() adminRaw?: AdminPayload) {
    const ids = body?.ids;
    if (!Array.isArray(ids) || !ids.length || !ids.every((id) => typeof id === 'number')) {
      return this.fail('请选择要删除的考试');
    }
    // 逐个校验归属：整批里夹一条他人考试就整体拒绝，不做部分删除
    for (const id of ids) await this.examService.assertOwned(id, adminRaw);
    try {
      for (const id of ids) await this.examService.ensureDeletable(id);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '无法删除');
    }
    await this.examService.delete(ids);
    return this.ok(null, `已删除 ${ids.length} 场考试`);
  }

  /** 校验考试入参：名称唯一 + 时间合法 + 试卷已发布 */
  /**
   * 校验监考/阅卷名单里的人员都存在
   * 与考生分配的 validateCandidatesExist 保持同样的严格度，避免一类名单静默漏项、另一类挡在保存前。
   */
  private async validateStaff(dto: CreateExamDto): Promise<string | null> {
    const [pErr, gErr] = await Promise.all([
      this.examStaffService.validateExists(dto.proctors, '监考'),
      this.examStaffService.validateExists(dto.graders, '阅卷'),
    ]);
    return pErr ?? gErr;
  }

  private async validateExam(dto: CreateExamDto, excludeId?: number): Promise<string | null> {
    if (await this.examService.isNameExists(dto.name, excludeId)) {
      return `考试【${dto.name}】已存在，请更换名称`;
    }
    if (new Date(dto.endTime) <= new Date(dto.startTime)) {
      return '结束时间必须晚于开始时间';
    }
    if (!(await this.examService.isPaperPublished(dto.paperId))) {
      return '所选试卷不存在或未发布，请选择已发布的试卷';
    }
    return null;
  }
}
