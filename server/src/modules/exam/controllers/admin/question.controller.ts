import { Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CrudController, CrudControllerFactory } from '@/common/crud';
import { ApiPageResult, ApiResult, ApiOkVoid, Perms, OperationLog } from '@/common/decorators';
import { QuestionService } from '../../services/question.service';
import {
  CreateQuestionDto,
  UpdateQuestionDto,
  ApproveQuestionDto,
  RejectQuestionDto,
} from '../../dto/question.dto';
import { QuestionVo } from '../../vo/question.vo';

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
  constructor(private readonly questionService: QuestionService) {
    super(questionService);
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
  async list(@Query() query: Record<string, any>) {
    const kpId =
      typeof query.knowledgePointId === 'string' && /^\d+$/.test(query.knowledgePointId)
        ? Number(query.knowledgePointId)
        : undefined;
    const data = await this.questionService.pageWithKnowledge(
      {
        keyword: query.keyword,
        type: query.type,
        difficulty: query.difficulty,
        knowledgePointId: kpId,
        status: query.status,
      },
      query.page ? Number(query.page) : undefined,
      query.pageSize ? Number(query.pageSize) : undefined,
    );
    return this.ok(data);
  }

  /**
   * 题目详情（带知识点名称）
   */
  @Get('detail/:id')
  @Perms('detail')
  @ApiOperation({ summary: '按 id 查询题目详情' })
  @ApiParam({ name: 'id', description: '题目 ID', type: Number })
  @ApiResult(QuestionVo)
  async detail(@Param('id', ParseIntPipe) id: number) {
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
    if (!(await this.questionService.isKnowledgePointExists(dto.knowledgePointId))) {
      return '所属知识点不存在';
    }
    if (this.questionService.isObjectiveType(dto.type) && !dto.options?.trim()) {
      return '客观题必须填写选项';
    }
    return null;
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
  async add(@Body() dto: CreateQuestionDto) {
    const err = await this.validateQuestion(dto);
    if (err) return this.fail(err);
    // 主观题不保存选项，避免脏数据
    const options = this.questionService.isObjectiveType(dto.type) ? dto.options : null;
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
  async update(@Body() dto: UpdateQuestionDto) {
    const { id, ...data } = dto;
    const err = await this.validateQuestion(data);
    if (err) return this.fail(err);
    const options = this.questionService.isObjectiveType(data.type) ? data.options : null;
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
  async delete(@Param('id', ParseIntPipe) id: number) {
    try {
      await this.questionService.ensureDeletable(id);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '无法删除');
    }
    await this.questionService.delete([id]);
    return this.ok(null, '删除题目成功');
  }

  /**
   * 审核通过：待审题目转为正式，正式入库。
   */
  @Post('audit/approve')
  @Perms('audit')
  @ApiOperation({ summary: '审核通过（待审 → 正式）' })
  @OperationLog({ target: '题目管理', type: '编辑', content: '审核通过题目' })
  @ApiOkVoid()
  async approve(@Body() dto: ApproveQuestionDto) {
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
  async reject(@Body() dto: RejectQuestionDto) {
    const res = await this.questionService.reject(dto.id, dto.reason);
    if (!res.ok) return this.fail(res.message || '退回失败');
    return this.ok(null, '已退回');
  }
}
