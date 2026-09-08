import {
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CrudController, CrudControllerFactory } from '@/common/crud';
import { ApiResult, ApiArrayResult, ApiOkVoid, Perms, OperationLog } from '@/common/decorators';
import { Admin } from '@/common/decorators/admin.decorator';
import { PaperService } from '../../services/paper.service';
import { PaperAccessService } from '../../services/paper-access.service';
import { QuestionBankAccessService } from '../../services/question-bank-access.service';
import type { AdminPayload } from '../../services/org-scope.service';
import {
  CreateFixedPaperDto,
  CreateRandomPaperDto,
  UpdateFixedPaperDto,
  UpdateRandomPaperDto,
  UpdatePaperShareDto,
  AiComposePaperDto,
  RuleAvailabilityDto,
} from '../../dto/paper.dto';
import { PaperVo, PaperDetailVo } from '../../vo/paper.vo';

/**
 * 试卷管理控制器
 * 提供试卷分页筛选、详情/预览、固定试卷（手动/AI 组卷）与随机试卷新增、草稿态编辑、
 * AI 组卷方案推荐、发布（草稿→已发布）、删除（被考试引用时阻止）。
 * 组卷时校验题库范围与题目合法性；随机卷发布时校验各组合可用题量。
 */
@ApiTags('试卷管理')
@CrudController({
  prefix: 'admin/exam/paper',
  api: [],
})
export class PaperController extends CrudControllerFactory(PaperVo) {
  constructor(
    private readonly paperService: PaperService,
    private readonly access: PaperAccessService,
    private readonly bankAccess: QuestionBankAccessService,
  ) {
    super(paperService);
  }

  /**
   * 收敛登录态：AuthGuard 已保证存在，此处仅做类型收窄与兜底。
   * @param admin request.admin 注入值
   * @returns 必有值的登录管理员
   */
  private requireAdmin(admin?: AdminPayload): AdminPayload {
    if (!admin?.userId) throw new UnauthorizedException('登录态缺失');
    return admin;
  }

  /**
   * 试卷分页列表
   * 支持名称模糊、类型（fixed/random）、状态（draft/published）、可见范围筛选，
   * 并按共享可见范围过滤（无权试卷不返回）。
   */
  @Get('list')
  @Perms('list')
  @ApiOperation({ summary: '试卷分页列表（名称模糊 + 类型/状态筛选 + 共享可见过滤）' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiQuery({ name: 'keyword', required: false, description: '试卷名称（模糊）' })
  @ApiQuery({ name: 'type', required: false, description: '试卷类型 fixed/random' })
  @ApiQuery({ name: 'status', required: false, description: '试卷状态 draft/published' })
  @ApiQuery({ name: 'visibleScope', required: false, description: '可见范围筛选' })
  @ApiQuery({ name: 'onlyMine', required: false, description: '仅看我创建的（1/true）' })
  async list(@Query() query: Record<string, any>, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    const data = await this.paperService.pageList(
      {
        keyword: query.keyword,
        type: query.type,
        status: query.status,
        visibleScope: query.visibleScope || undefined,
        onlyMine: query.onlyMine === '1' || query.onlyMine === 'true',
      },
      query.page ? Number(query.page) : undefined,
      query.pageSize ? Number(query.pageSize) : undefined,
      admin,
    );
    return this.ok(data);
  }

  /**
   * 按筛选条件导出试卷清单（全量不分页）
   * 筛选条件与 list 一致，返回全部匹配记录供前端生成表格文件。
   */
  @Get('export')
  @Perms('export')
  @ApiOperation({ summary: '按筛选条件导出试卷清单（全量）' })
  @ApiQuery({ name: 'keyword', required: false, description: '试卷名称（模糊）' })
  @ApiQuery({ name: 'type', required: false, description: '试卷类型 fixed/random' })
  @ApiQuery({ name: 'status', required: false, description: '试卷状态 draft/published' })
  @ApiArrayResult(PaperVo)
  async export(@Query() query: Record<string, any>, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    const list = await this.paperService.exportList(
      {
        keyword: query.keyword,
        type: query.type,
        status: query.status,
        visibleScope: query.visibleScope || undefined,
        onlyMine: query.onlyMine === '1' || query.onlyMine === 'true',
      },
      undefined,
      admin,
    );
    return this.ok(list);
  }

  /**
   * 试卷详情/预览
   * 固定卷返回题目项（含题干/答案）；随机卷返回抽题规则及各组合可用题量。
   */
  @Get('detail/:id')
  @Perms('detail')
  @ApiOperation({ summary: '按 id 查询试卷详情/预览' })
  @ApiParam({ name: 'id', description: '试卷 ID', type: Number })
  @ApiResult(PaperDetailVo)
  async detail(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    await this.access.assertCanRead(id, admin);
    const data = await this.paperService.getDetail(id, admin);
    if (!data) return this.fail('试卷不存在');
    return this.ok(data);
  }

  /**
   * 新增固定试卷（手动组卷 / AI 组卷方案保存）
   * 校验名称唯一、题库范围合法、题目均属所选题库且为正式状态。
   */
  @Post('fixed')
  @Perms('add')
  @ApiOperation({ summary: '新增固定试卷（手动/AI 组卷保存）' })
  @OperationLog({ target: '试卷管理', type: '新增', content: '新增固定试卷' })
  @ApiResult(PaperVo)
  async createFixed(@Body() dto: CreateFixedPaperDto, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    // 题库范围须是当前用户有权访问的题库，否则可借组卷读到无权题库的题目
    await this.bankAccess.assertCanReadBanks(dto.bankIds, admin);
    const err = await this.validateFixed(dto);
    if (err) return this.fail(err);
    const paper = await this.paperService.createFixed(dto, admin);
    return this.ok(paper, '新增试卷成功');
  }

  /**
   * 新增随机试卷（抽题规则）
   * 校验名称唯一、题库范围合法。
   */
  @Post('random')
  @Perms('add')
  @ApiOperation({ summary: '新增随机试卷（抽题规则）' })
  @OperationLog({ target: '试卷管理', type: '新增', content: '新增随机试卷' })
  @ApiResult(PaperVo)
  async createRandom(@Body() dto: CreateRandomPaperDto, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    await this.bankAccess.assertCanReadBanks(dto.banks.map((b) => b.bankId), admin);
    const err = await this.validateRandom(dto);
    if (err) return this.fail(err);
    const { paper, quotaWarnings } = await this.paperService.createRandom(dto, admin);
    return this.ok(paper, this.withQuotaWarnings('新增试卷成功', quotaWarnings));
  }

  /**
   * 把题库配额缺口附到成功提示后面。
   *
   * 缺口不阻断保存（抽题时会从其他题库补足），但必须让用户看见——
   * 补足会让实际抽题比例偏离他设定的权重，静默通过等于让权重形同虚设。
   */
  private withQuotaWarnings(base: string, warnings: string[]): string {
    if (!warnings.length) return base;
    return `${base}。注意：${warnings.join('；')}。抽题时将从其他题库补足，实际比例会偏离设定权重`;
  }

  /**
   * 查询抽题规则的可用题量（编辑页实时探测）
   * 返回逐条可用量 + 去重后的整卷上限，供前端限制「抽取数量」输入上限。
   */
  @Post('rule-availability')
  // 只读探测，无写副作用；新增与编辑两种场景都要调，故用范围最广的 list 权限，
  // 用 add/update 会让「只有编辑权」或「只有新增权」的一方拿不到可用量
  @Perms('list')
  @ApiOperation({ summary: '查询抽题规则可用题量' })
  async ruleAvailability(@Body() dto: RuleAvailabilityDto, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    const bankIds = [...new Set(dto.bankIds)];
    // 可用题量会暴露题库内容分布，同样按题库可读性收口
    await this.bankAccess.assertCanReadBanks(bankIds, admin);
    const result = await this.paperService.getRuleAvailability(bankIds, dto.rules);
    return this.ok(result);
  }

  /**
   * AI 组卷方案推荐
   * 在题库范围内按目标总分挑选正式题目并分配分值，仅返回方案供前端调整，不落库。
   */
  @Post('ai-compose')
  @Perms('add')
  @ApiOperation({ summary: 'AI 组卷方案推荐（不落库）' })
  async aiCompose(@Body() dto: AiComposePaperDto, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    await this.bankAccess.assertCanReadBanks(dto.bankIds, admin);
    const invalidBanks = await this.paperService.findInvalidBankIds([...new Set(dto.bankIds)]);
    if (invalidBanks.length) return this.fail('部分题库不存在，请重新选择题库范围');
    const scheme = await this.paperService.aiCompose(dto);
    if (!scheme || scheme.count === 0) {
      return this.fail('所选题库范围内暂无可用正式题目，请补充题目或手动组卷');
    }
    return this.ok(scheme, 'AI 组卷方案已生成');
  }

  /**
   * 编辑固定试卷（仅草稿可编辑）
   */
  @Put('fixed')
  @Perms('update')
  @ApiOperation({ summary: '编辑固定试卷（仅草稿可编辑）' })
  @OperationLog({ target: '试卷管理', type: '编辑', content: '编辑固定试卷' })
  @ApiOkVoid()
  async updateFixed(@Body() dto: UpdateFixedPaperDto, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    await this.access.assertCanManage(dto.id, admin);
    await this.bankAccess.assertCanReadBanks(dto.bankIds, admin);
    const guard = await this.ensureDraftFixed(dto.id);
    if (guard) return this.fail(guard);
    const err = await this.validateFixed(dto);
    if (err) return this.fail(err);
    const { canEditShare } = await this.access.getCapabilities(dto.id, admin);
    await this.paperService.updateFixed(dto.id, dto, canEditShare);
    return this.ok(null, '编辑试卷成功');
  }

  /**
   * 编辑随机试卷（仅草稿可编辑）
   */
  @Put('random')
  @Perms('update')
  @ApiOperation({ summary: '编辑随机试卷（仅草稿可编辑）' })
  @OperationLog({ target: '试卷管理', type: '编辑', content: '编辑随机试卷' })
  @ApiOkVoid()
  async updateRandom(@Body() dto: UpdateRandomPaperDto, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    await this.access.assertCanManage(dto.id, admin);
    await this.bankAccess.assertCanReadBanks(dto.banks.map((b) => b.bankId), admin);
    const guard = await this.ensureDraftRandom(dto.id);
    if (guard) return this.fail(guard);
    const err = await this.validateRandom(dto);
    if (err) return this.fail(err);
    const { canEditShare } = await this.access.getCapabilities(dto.id, admin);
    const { quotaWarnings, clearedQuestions } = await this.paperService.updateRandom(
      dto.id,
      dto,
      canEditShare,
    );
    // 改规则会清掉已生成的题目，必须说明，否则用户以为卷面还在
    const base = clearedQuestions
      ? `编辑试卷成功，原有 ${clearedQuestions} 道题已清空，请重新生成试卷`
      : '编辑试卷成功';
    return this.ok(null, this.withQuotaWarnings(base, quotaWarnings));
  }

  /**
   * 生成随机试卷的题目（快速组卷）
   *
   * 按已配的抽题规则与题库权重抽一次，结果固化为实体题目。
   * 允许对已生成的卷再次调用以重新生成，会覆盖含手工调整在内的全部题目，
   * 故前端须先向用户确认。
   */
  @Post('random/:id/generate')
  @Perms('edit')
  @ApiOperation({ summary: '生成随机试卷题目（按抽题规则抽取并固化）' })
  @OperationLog({ target: '试卷管理', type: '生成', content: '生成随机试卷题目' })
  @ApiOkVoid()
  async generateRandom(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    await this.access.assertCanManage(id, admin);
    const paper = await this.paperService.info(id);
    if (!paper) return this.fail('试卷不存在');
    if ((paper as any).type !== 'random') return this.fail('只有随机试卷需要生成题目');
    if ((paper as any).status === 'published') return this.fail('试卷已发布，不能重新生成');
    try {
      const result = await this.paperService.generateRandom(id);
      return this.ok(
        result,
        `生成成功，共 ${result.questionCount} 题、总分 ${result.totalScore}`,
      );
    } catch (e) {
      // 题量不足等业务校验以中文错误抛出，照实回给用户
      return this.fail(e instanceof Error ? e.message : '生成失败');
    }
  }

  /**
   * 单独修改试卷共享设置（可见范围 + 权限级别）
   * 与编辑接口分离：已发布试卷不可编辑内容，但仍需能调整共享范围。仅创建人与超管可调。
   */
  @Put('share')
  @Perms('share')
  @ApiOperation({ summary: '修改试卷共享设置（仅创建人/超管，不受草稿态限制）' })
  @OperationLog({ target: '试卷管理', type: '编辑', content: '修改试卷共享设置' })
  @ApiOkVoid()
  async updateShare(@Body() dto: UpdatePaperShareDto, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    await this.access.assertCanEditShare(dto.id, admin);
    await this.paperService.updateShare(dto.id, dto);
    return this.ok(null, '共享设置已更新');
  }

  /**
   * 发布试卷（草稿→已发布）
   * 固定卷校验至少 1 题；随机卷校验可用题量充足。
   */
  @Post('publish/:id')
  @Perms('publish')
  @ApiOperation({ summary: '发布试卷（草稿→已发布）' })
  @OperationLog({ target: '试卷管理', type: '编辑', content: '发布试卷' })
  @ApiParam({ name: 'id', description: '试卷 ID', type: Number })
  @ApiOkVoid()
  async publish(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    await this.access.assertCanManage(id, admin);
    try {
      await this.paperService.publish(id);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '发布失败');
    }
    return this.ok(null, '试卷已发布');
  }

  /**
   * 删除试卷（被考试引用时阻止）
   */
  @Delete('delete/:id')
  @Perms('delete')
  @ApiOperation({ summary: '按 id 删除试卷（被考试引用时阻止）' })
  @OperationLog({ target: '试卷管理', type: '删除', content: '删除试卷' })
  @ApiParam({ name: 'id', description: '试卷 ID', type: Number })
  @ApiOkVoid()
  async delete(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    await this.access.assertCanManage(id, admin);
    try {
      await this.paperService.ensureDeletable(id);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '无法删除');
    }
    await this.paperService.delete([id]);
    return this.ok(null, '删除试卷成功');
  }

  /**
   * 批量删除试卷（任一被考试引用时整体阻止）
   */
  @Post('batch-delete')
  @Perms('batch-delete')
  @ApiOperation({ summary: '批量删除试卷（任一被考试引用时整体阻止）' })
  @OperationLog({ target: '试卷管理', type: '删除', content: '批量删除试卷' })
  @ApiOkVoid()
  async batchDelete(@Body() body: { ids: number[] }, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    const ids = body?.ids;
    if (!Array.isArray(ids) || !ids.length || !ids.every((id) => typeof id === 'number')) {
      return this.fail('请选择要删除的试卷');
    }
    // 批量里有一份越权即整体拒绝，避免部分删除后状态不可预期
    for (const id of ids) await this.access.assertCanManage(id, admin);
    try {
      for (const id of ids) await this.paperService.ensureDeletable(id);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '无法删除');
    }
    await this.paperService.delete(ids);
    return this.ok(null, `已删除 ${ids.length} 份试卷`);
  }

  /** 校验固定试卷入参：名称唯一 + 题库范围合法 + 题目合法 */
  private async validateFixed(dto: CreateFixedPaperDto & { id?: number }): Promise<string | null> {
    if (await this.paperService.isNameExists(dto.name, dto.id)) {
      return `试卷【${dto.name}】已存在，请更换名称`;
    }
    const bankIds = [...new Set(dto.bankIds)];
    const invalidBanks = await this.paperService.findInvalidBankIds(bankIds);
    if (invalidBanks.length) return '部分题库不存在，请重新选择题库范围';
    const questionIds = dto.items.map((it) => it.questionId);
    if (new Set(questionIds).size !== questionIds.length) return '试卷内存在重复题目，请检查';
    const invalidQuestions = await this.paperService.findInvalidQuestionIds(bankIds, questionIds);
    if (invalidQuestions.length) return '部分题目不属于所选题库范围或非正式题目，请重新选择';
    return null;
  }

  /** 校验随机试卷入参：名称唯一 + 题库范围合法 */
  private async validateRandom(dto: CreateRandomPaperDto & { id?: number }): Promise<string | null> {
    if (await this.paperService.isNameExists(dto.name, dto.id)) {
      return `试卷【${dto.name}】已存在，请更换名称`;
    }
    const bankIds = [...new Set(dto.banks.map((b) => b.bankId))];
    const invalidBanks = await this.paperService.findInvalidBankIds(bankIds);
    if (invalidBanks.length) return '部分题库不存在，请重新选择题库范围';
    // 0 表示「不限知识点」，是哨兵值而非真实 ID，不参与存在性校验
    const kpIds = [...new Set(dto.rules.map((r) => r.knowledgePointId))].filter((id) => id > 0);
    const invalidKps = await this.paperService.findInvalidKnowledgePointIds(kpIds);
    if (invalidKps.length) return '部分知识点不存在，请重新选择';

    // 抽题数量不得超过可用题量（逐条 + 去重 + 同题型两两，见 findRuleShortage）
    return this.paperService.findRuleShortage(bankIds, dto.rules);
  }

  /** 编辑前置：试卷须存在、为固定类型且草稿态 */
  private async ensureDraftFixed(id: number): Promise<string | null> {
    const paper = await this.paperService.info(id);
    if (!paper) return '试卷不存在';
    const type = (paper as any).type;
    const status = (paper as any).status;
    /*
      题目编辑对两种卷都开放，但随机卷须已生成。

      随机卷生成后题目固化在 PaperQuestion 里、与固定卷同构，此时允许手工增删改题目
      （产品设定：生成后仍可调整，发布后锁死）。pending 态还没有题目可调，
      要改只能改抽题规则，故挡在这里。
    */
    if (type !== 'fixed' && type !== 'random') return '试卷类型不匹配';
    if (type === 'random' && status === 'pending') {
      return '随机试卷尚未生成题目，请先生成后再调整题目';
    }
    if (status !== 'draft') return '已发布试卷不可编辑';
    return null;
  }

  /** 编辑前置：试卷须存在、为随机类型且草稿态 */
  private async ensureDraftRandom(id: number): Promise<string | null> {
    const paper = await this.paperService.info(id);
    if (!paper) return '试卷不存在';
    if ((paper as any).type !== 'random') return '试卷类型不匹配';
    /*
      pending（待生成）与 draft（已生成）都允许改抽题规则，只有已发布不行。

      pending 是随机卷新建后的初始态，规则本来就得能改；
      draft 态改规则不会自动重抽，用户须再点一次「生成试卷」才生效。
    */
    if ((paper as any).status === 'published') return '已发布试卷不可编辑';
    return null;
  }
}
