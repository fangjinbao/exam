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
import { ApiPageResult, ApiResult, ApiOkVoid, Perms, OperationLog } from '@/common/decorators';
import { QuestionService } from '../../services/question.service';
import {
  QuestionBankAccessService,
  type AdminPayload,
} from '../../services/question-bank-access.service';
import { Admin } from '@/common/decorators/admin.decorator';
import { ApiArrayResult } from '@/common/decorators';
import {
  CreateQuestionDto,
  UpdateQuestionDto,
  ApproveQuestionDto,
  RejectQuestionDto,
  ImportQuestionDto,
} from '../../dto/question.dto';
import { SaveCompositeDto } from '../../dto/composite-question.dto';
import { QuestionVo } from '../../vo/question.vo';
import { ImportResultVo } from '../../vo/question-bank.vo';

/**
 * 题目管理控制器
 * 提供题目的分页筛选、详情、新增、编辑、删除，以及 AI 待审题目的审核（通过/退回）。
 * 新增/编辑校验题型与难度为字典已启用项、知识点存在、客观题选项必填；
 * 列表带出所属知识点名称；删除时预留试卷引用保护（试卷模块落地后补充）。
 */
@ApiTags('题目管理')
@CrudController({
  prefix: 'admin/exam/question',
  api: [],
})
export class QuestionController extends CrudControllerFactory(QuestionVo) {
  constructor(
    private readonly questionService: QuestionService,
    private readonly access: QuestionBankAccessService,
  ) {
    super(questionService);
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
   * 按题目 ID 反查所属题库并逐个校验管理权限
   * 题目的 questionBankId 可空（存量兼容），无归属题库时不拦截。
   * @param ids 题目 ID 列表
   * @param admin 当前登录管理员
   */
  private async assertCanManageByQuestionIds(ids: number[], admin: AdminPayload): Promise<void> {
    const bankIds = await this.questionService.getBankIdsByQuestionIds(ids);
    for (const bankId of bankIds) {
      await this.access.assertCanManage(bankId, admin);
    }
  }

  /**
   * 题目分页列表（带知识点名称）
   * 支持题干关键词模糊、题型/难度/知识点/状态精确筛选。
   */
  @Get('list')
  @Perms('list')
  @ApiOperation({ summary: '题目分页列表（题干模糊 + 题型/难度/知识点/状态筛选）' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiQuery({ name: 'keyword', required: false, description: '题干关键词（模糊）' })
  @ApiQuery({ name: 'type', required: false, description: '题型（字典 value）' })
  @ApiQuery({ name: 'difficulty', required: false, description: '难度（字典 value）' })
  @ApiQuery({ name: 'knowledgePointId', required: false, description: '知识点 ID' })
  @ApiQuery({ name: 'status', required: false, description: '状态 formal/pending' })
  @ApiPageResult(QuestionVo)
  async list(@Query() query: Record<string, any>, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    const kpId =
      typeof query.knowledgePointId === 'string' && /^\d+$/.test(query.knowledgePointId)
        ? Number(query.knowledgePointId)
        : undefined;
    const bankId =
      typeof query.questionBankId === 'string' && /^\d+$/.test(query.questionBankId)
        ? Number(query.questionBankId)
        : undefined;
    // 按题库筛选时校验该库可读；未指定题库的全局列表保持现状不拦截
    if (bankId) await this.access.assertCanRead(bankId, admin);
    const data = await this.questionService.pageWithKnowledge(
      {
        keyword: query.keyword,
        type: query.type,
        difficulty: query.difficulty,
        knowledgePointId: kpId,
        questionBankId: bankId,
        status: query.status,
      },
      query.page ? Number(query.page) : undefined,
      query.pageSize ? Number(query.pageSize) : undefined,
    );
    return this.ok(data);
  }

  /**
   * 导出指定题库的全部题目（全量不分页）
   * 题型/难度输出中文名称，知识点顿号拼接，供前端生成表格文件。
   */
  @Get('export')
  @Perms('export')
  @ApiOperation({ summary: '按题库导出题目（全量）' })
  @ApiQuery({ name: 'questionBankId', required: true, description: '题库 ID' })
  @ApiArrayResult(QuestionVo)
  async export(@Query() query: Record<string, any>, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    const bankId =
      typeof query.questionBankId === 'string' && /^\d+$/.test(query.questionBankId)
        ? Number(query.questionBankId)
        : undefined;
    if (!bankId) return this.fail('请指定要导出的题库');
    // 导出会带出全库题目的答案与解析，读权限校验不可省
    await this.access.assertCanRead(bankId, admin);
    const list = await this.questionService.exportList(bankId);
    return this.ok(list);
  }

  /**
   * 批量导入题目到指定题库（逐行校验，有错跳过）
   */
  @Post('import')
  @Perms('import')
  @ApiOperation({ summary: '批量导入题目（逐行跳过错误行）' })
  @OperationLog({ target: '题目管理', type: '新增', content: '批量导入题目' })
  @ApiResult(ImportResultVo)
  async import(@Body() dto: ImportQuestionDto, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    // 导入是往目标题库写题目，需要该库的管理权限
    if (dto.questionBankId != null) {
      await this.access.assertCanManage(dto.questionBankId, admin);
    }
    if (!(await this.questionService.isQuestionBankExists(dto.questionBankId))) {
      return this.fail('所属题库不存在');
    }
    const result = await this.questionService.importQuestions(dto.questionBankId, dto.rows);
    const message = result.failed
      ? `成功导入 ${result.success} 道，跳过 ${result.failed} 行`
      : `成功导入 ${result.success} 道题目`;
    return this.ok(result, message);
  }

  /**
   * 题目详情（带知识点名称）
   */
  @Get('detail/:id')
  @Perms('detail')
  @ApiOperation({ summary: '按 id 查询题目详情' })
  @ApiParam({ name: 'id', description: '题目 ID', type: Number })
  @ApiResult(QuestionVo)
  async detail(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    // 反查题目所属题库校验可读；存量无题库归属的题目不拦截
    const [bankId] = await this.questionService.getBankIdsByQuestionIds([id]);
    if (bankId) await this.access.assertCanRead(bankId, admin);
    return this.ok(await this.questionService.detailWithKnowledge(id));
  }

  /**
   * 校验题目公共字段：题型/难度为字典已启用项、知识点存在、客观题选项必填。
   * @returns 校验通过返回 null，否则返回中文错误信息
   */
  private async validateQuestion(dto: CreateQuestionDto): Promise<string | null> {
    if (!(await this.questionService.isDictValueEnabled('question_type', dto.type))) {
      return '题型无效或已停用，请重新选择';
    }
    if (!(await this.questionService.isDictValueEnabled('difficulty', dto.difficulty))) {
      return '难度无效或已停用，请重新选择';
    }
    if (
      dto.questionBankId != null &&
      !(await this.questionService.isQuestionBankExists(dto.questionBankId))
    ) {
      return '所属题库不存在';
    }
    // 知识点可选（多对多）；若提供则全部必须存在
    if (
      dto.knowledgePointIds?.length &&
      !(await this.questionService.areKnowledgePointsExist(dto.knowledgePointIds))
    ) {
      return '所属知识点不存在或已被删除';
    }
    if (this.questionService.requiresOptions(dto.type) && !dto.options?.trim()) {
      return '该题型必须填写选项';
    }
    // 填空题：题干需挖空（连续 ≥3 下划线），答案按空位顺序每空一行，空位数与答案行数需一致且每空非空
    if (dto.type === 'blank') {
      const blankCount = this.questionService.countStemBlanks(dto.stem);
      if (blankCount < 1) {
        return '填空题题干需用连续下划线（如 ___）标出至少一个空';
      }
      const answers = dto.answer.split('\n').map((s) => s.trim());
      if (answers.length !== blankCount) {
        return `填空题答案数量（${answers.length}）与题干空位数量（${blankCount}）不一致`;
      }
      if (answers.some((a) => !a)) {
        return '填空题每个空的答案均不能为空';
      }
    }
    return null;
  }

  /**
   * 保存材料题及其小题——新增与编辑同一入口
   *
   * 小题按 id 差分：带 id 的原地更新、不带的新建、库中多出的删除。
   * 之所以不做「删旧建新」：PracticeAnswer 对题目是级联删除，
   * 那样会连带清掉考生的练习作答历史。服务端在删除前会校验作答记录。
   */
  @Post('composite/save')
  @Perms('add')
  @ApiOperation({ summary: '保存材料题及其小题（按 id 差分，禁止嵌套）' })
  @OperationLog({ target: '题目管理', type: '保存', content: '保存材料题' })
  @ApiResult(QuestionVo)
  async saveComposite(@Body() dto: SaveCompositeDto, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    if (dto.questionBankId != null) {
      await this.access.assertCanManage(dto.questionBankId, admin);
    }
    // 编辑既有材料题时，还需校验对其原题库的管理权限（防止改库绕过范围）
    if (dto.id != null) {
      const bankIds = await this.questionService.getBankIdsByQuestionIds([dto.id]);
      for (const bankId of bankIds) {
        await this.access.assertCanManage(bankId, admin);
      }
    }

    // 校验材料题难度字典值；题型固定为 composite，无需校验
    if (!(await this.questionService.isDictValueEnabled('difficulty', dto.difficulty))) {
      return this.fail('难度无效或已停用，请重新选择');
    }

    // 逐个小题校验题型/难度/选项，错误定位到具体小题
    for (let i = 0; i < dto.children.length; i++) {
      const child = dto.children[i];
      const err = await this.validateQuestion(child as any);
      if (err) return this.fail(`第 ${i + 1} 个小题：${err}`);
    }

    const parentId = await this.questionService.saveComposite(
      dto.id ?? null,
      {
        stem: dto.stem,
        analysis: dto.analysis ?? null,
        difficulty: dto.difficulty,
        knowledgePointIds: dto.knowledgePointIds ?? [],
        questionBankId: dto.questionBankId ?? null,
        status: 'formal',
      },
      dto.children.map((c) => ({
        id: c.id,
        type: c.type,
        stem: c.stem,
        options: this.questionService.requiresOptions(c.type) ? (c.options ?? null) : null,
        answer: c.answer,
        analysis: c.analysis ?? null,
        difficulty: c.difficulty,
        suggestedScore: c.suggestedScore,
      })),
    );
    return this.ok({ id: parentId }, dto.id ? '编辑材料题成功' : '新增材料题成功');
  }

  /**
   * 新增题目
   * 人工录入默认进入正式题库（status=formal）；AI 出题（本期未实现）才进入待审。
   */
  @Post('add')
  @Perms('add')
  @ApiOperation({ summary: '新增题目（校验字典值/知识点/客观题选项）' })
  @OperationLog({ target: '题目管理', type: '新增', content: '新增题目' })
  @ApiResult(QuestionVo)
  async add(@Body() dto: CreateQuestionDto, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    // 往目标题库新增题目，需要该库的管理权限；未指定题库时不拦截
    if (dto.questionBankId != null) {
      await this.access.assertCanManage(dto.questionBankId, admin);
    }
    const err = await this.validateQuestion(dto);
    if (err) return this.fail(err);
    // 仅需选项的题型（单选/多选/判断）保存选项；填空/主观题不保存，避免脏数据
    const options = this.questionService.requiresOptions(dto.type) ? dto.options : null;
    const created = await this.questionService.add({ ...dto, options, status: 'formal' });
    return this.ok(created, '新增题目成功');
  }

  /**
   * 更新题目
   * 字段同新增，校验一致；不在此接口变更审核状态。
   */
  @Put('update')
  @Perms('update')
  @ApiOperation({ summary: '更新题目（校验字典值/知识点/客观题选项）' })
  @OperationLog({ target: '题目管理', type: '编辑', content: '编辑题目' })
  @ApiOkVoid()
  async update(@Body() dto: UpdateQuestionDto, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    const { id, ...data } = dto;
    // 原题库与目标题库都要校验：防止把题目从无权题库搬走，或搬进无权题库
    await this.assertCanManageByQuestionIds([id], admin);
    if (data.questionBankId != null) {
      await this.access.assertCanManage(data.questionBankId, admin);
    }
    const err = await this.validateQuestion(data);
    if (err) return this.fail(err);
    const options = this.questionService.requiresOptions(data.type) ? data.options : null;
    await this.questionService.update(id, { ...data, options });
    return this.ok(null, '编辑题目成功');
  }

  /**
   * 删除题目
   * 被固定试卷引用时阻止（试卷模块落地后生效）。
   */
  @Delete('delete/:id')
  @Perms('delete')
  @ApiOperation({ summary: '按 id 删除题目（被试卷引用时阻止）' })
  @OperationLog({ target: '题目管理', type: '删除', content: '删除题目' })
  @ApiParam({ name: 'id', description: '题目 ID', type: Number })
  @ApiOkVoid()
  async delete(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    // 删除题目等同修改所属题库内容，需该库管理权限
    await this.assertCanManageByQuestionIds([id], admin);
    try {
      await this.questionService.ensureDeletable(id);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '无法删除');
    }
    await this.questionService.delete([id]);
    return this.ok(null, '删除题目成功');
  }

  /**
   * 批量删除题目
   * 任一题目被固定试卷引用时整体阻止（试卷模块落地后生效）。
   */
  @Post('batch-delete')
  @Perms('batch-delete')
  @ApiOperation({ summary: '批量删除题目（任一被试卷引用时整体阻止）' })
  @OperationLog({ target: '题目管理', type: '删除', content: '批量删除题目' })
  @ApiOkVoid()
  async batchDelete(@Body() body: { ids: number[] }, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    const ids = body?.ids;
    if (!Array.isArray(ids) || !ids.length || !ids.every((id) => typeof id === 'number')) {
      return this.fail('请选择要删除的题目');
    }
    // 逐个题库鉴权：任一题目所属题库无权即整体拒绝，不做部分删除
    await this.assertCanManageByQuestionIds(ids, admin);
    try {
      for (const id of ids) await this.questionService.ensureDeletable(id);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '无法删除');
    }
    await this.questionService.delete(ids);
    return this.ok(null, `已删除 ${ids.length} 道题目`);
  }

  /**
   * 修改题目状态
   * 覆盖基类 update-status：基类不鉴权，只读共享用户可借此绕过题库权限直改题目。
   * 该权限点由 PermsSyncService 扫描继承方法自动注册，即使未在 @CrudController 的
   * api 中声明也会生成路由，因此必须显式覆写补上鉴权。
   */
  @Put('update-status')
  @Perms('update-status')
  @ApiOperation({ summary: '修改题目状态（校验所属题库管理权限）' })
  @ApiOkVoid()
  async updateStatus(
    @Body() body: { id: number; status: number },
    @Admin() adminRaw?: AdminPayload,
  ) {
    const admin = this.requireAdmin(adminRaw);
    if (!body?.id || typeof body.id !== 'number') return this.fail('id 不能为空');
    await this.assertCanManageByQuestionIds([body.id], admin);
    return super.updateStatus(body);
  }

  /**
   * 审核通过：待审题目转为正式，正式入库。
   */
  @Post('audit/approve')
  @Perms('audit')
  @ApiOperation({ summary: '审核通过（待审 → 正式）' })
  @OperationLog({ target: '题目管理', type: '编辑', content: '审核通过题目' })
  @ApiOkVoid()
  async approve(@Body() dto: ApproveQuestionDto, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    // 审核会改写题目状态，按所属题库要求管理权限
    await this.assertCanManageByQuestionIds([dto.id], admin);
    const res = await this.questionService.approve(dto.id);
    if (!res.ok) return this.fail(res.message || '审核失败');
    return this.ok(null, '审核通过，题目已转为正式状态');
  }

  /**
   * 审核退回：填写退回原因，题目保持待审并记录原因。
   */
  @Post('audit/reject')
  @Perms('audit')
  @ApiOperation({ summary: '审核退回（记录退回原因，保持待审）' })
  @OperationLog({ target: '题目管理', type: '编辑', content: '退回待审题目' })
  @ApiOkVoid()
  async reject(@Body() dto: RejectQuestionDto, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    // 退回同样改写题目状态，按所属题库要求管理权限
    await this.assertCanManageByQuestionIds([dto.id], admin);
    const res = await this.questionService.reject(dto.id, dto.reason);
    if (!res.ok) return this.fail(res.message || '退回失败');
    return this.ok(null, '已退回');
  }
}
