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
import { ApiResult, Perms, OperationLog } from '@/common/decorators';
import { Admin } from '@/common/decorators/admin.decorator';
import type { AdminPayload } from '../../services/org-scope.service';
import { QuestionBankAccessService } from '../../services/question-bank-access.service';
import { PracticeService } from '../../services/practice.service';
import { PracticeMutationService } from '../../services/practice-mutation.service';
import { PracticeRecordService } from '../../services/practice-record.service';
import { PracticeValidationService } from '../../services/practice-validation.service';
import {
  CreatePracticeDto,
  UpdatePracticeDto,
  AssignParticipantsDto,
  AppendParticipantsDto,
  RemoveParticipantsDto,
  PracticeRuleAvailabilityDto,
  BatchDeletePracticeDto,
} from '../../dto/practice.dto';
import { PracticeVo, PracticeDetailVo } from '../../vo/practice.vo';

/**
 * 岗位练兵管理控制器
 * 提供练习分页筛选、详情、创建（基础信息+题库+抽题规则+参与人员+练习设置）、
 * 编辑（仅未发布）、分配参与人员、发布/撤回/结束、删除与抽题可用量查询。
 * 状态随练习时间由服务惰性推进。
 */
@ApiTags('岗位练兵管理')
@CrudController({
  prefix: 'admin/exam/practice',
  api: [],
})
export class PracticeController extends CrudControllerFactory(PracticeVo) {
  constructor(
    private readonly practiceService: PracticeService,
    private readonly mutation: PracticeMutationService,
    private readonly validation: PracticeValidationService,
    private readonly bankAccess: QuestionBankAccessService,
    private readonly recordService: PracticeRecordService,
  ) {
    super(practiceService);
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
   * 练习分页列表
   * 支持名称模糊、状态精确、开始时间日期范围筛选；带题库名称与参与人数。
   */
  @Get('list')
  @Perms('list')
  @ApiOperation({ summary: '练习分页列表（名称模糊 + 状态 + 时间范围）' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiQuery({ name: 'keyword', required: false, description: '练习名称（模糊）' })
  @ApiQuery({ name: 'status', required: false, description: '状态 unpublished/published/ongoing/finished' })
  @ApiQuery({ name: 'startDate', required: false, description: '开始日期（含）YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束日期（含）YYYY-MM-DD' })
  async list(@Query() query: Record<string, any>, @Admin() adminRaw?: AdminPayload) {
    const data = await this.practiceService.pageList(
      {
        keyword: query.keyword,
        status: query.status,
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
   * 练习详情（基础信息 + 题库范围 + 抽题规则 + 参与人员 + 练习设置）
   */
  @Get('detail/:id')
  @Perms('detail')
  @ApiOperation({ summary: '按 id 查询练习详情' })
  @ApiParam({ name: 'id', description: '练习 ID', type: Number })
  @ApiResult(PracticeDetailVo)
  async detail(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    await this.practiceService.assertOwned(id, adminRaw);
    const data = await this.practiceService.getDetail(id);
    if (!data) return this.fail('练习不存在');
    return this.ok(data);
  }

  /**
   * 练习记录分页（按人聚合，一人一行）
   * 复用 detail 权限点而非新增：看记录属于看详情的一部分，
   * 新增权限点会让存量角色在授权前一律 403，需要额外的授权迁移。
   */
  @Get('record-page/:id')
  @Perms('detail')
  @ApiOperation({ summary: '练习记录分页（按人聚合，含未开始人员）' })
  @ApiParam({ name: 'id', description: '练习 ID', type: Number })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiQuery({ name: 'keyword', required: false, description: '人员姓名（模糊）' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: '状态 not_started/ongoing/finished',
  })
  async recordPage(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: Record<string, any>,
    @Admin() adminRaw?: AdminPayload,
  ) {
    await this.practiceService.assertOwned(id, adminRaw);
    const data = await this.recordService.pageByPractice(
      id,
      { keyword: query.keyword, status: query.status },
      query.page ? Number(query.page) : undefined,
      query.pageSize ? Number(query.pageSize) : undefined,
    );
    return this.ok(data);
  }

  /**
   * 某人在此练习下的每次练习记录（抽屉第一级）
   */
  @Get('record-list/:id')
  @Perms('detail')
  @ApiOperation({ summary: '某人在此练习下的历次记录' })
  @ApiParam({ name: 'id', description: '练习 ID', type: Number })
  @ApiQuery({ name: 'userType', required: true, description: 'internal / external' })
  @ApiQuery({ name: 'userId', required: true, description: '人员业务 ID' })
  async recordList(
    @Param('id', ParseIntPipe) id: number,
    @Query('userType') userType: string,
    @Query('userId') userId: string,
    @Admin() adminRaw?: AdminPayload,
  ) {
    await this.practiceService.assertOwned(id, adminRaw);
    if (userType !== 'internal' && userType !== 'external') return this.fail('人员类型有误');
    const uid = Number(userId);
    if (!Number.isInteger(uid) || uid <= 0) return this.fail('人员 ID 有误');
    const data = await this.recordService.listUserRecords(id, userType, uid);
    return this.ok(data);
  }

  /**
   * 单次练习记录的逐题明细（抽屉第二级）
   * 记录须属于某个岗位练兵，再经 assertOwned 过创建人隔离，避免读到他人练习下的记录。
   * 「不存在」与「非岗位练兵（自主练习/错题重练）」共用同一文案：后者不做归属校验，
   * 若文案可区分，便能借响应差异枚举 recordId 是否存在及其来源类型。
   */
  @Get('record-detail/:recordId')
  @Perms('detail')
  @ApiOperation({ summary: '单次练习记录的逐题作答明细' })
  @ApiParam({ name: 'recordId', description: '练习记录 ID', type: Number })
  async recordDetail(
    @Param('recordId', ParseIntPipe) recordId: number,
    @Admin() adminRaw?: AdminPayload,
  ) {
    const data = await this.recordService.getRecordDetail(recordId);
    if (!data || !data.practiceId) return this.fail('练习记录不存在');
    await this.practiceService.assertOwned(data.practiceId, adminRaw);
    return this.ok(data);
  }

  /**
   * 创建练习
   * 校验名称/编号唯一、时间区间合法、题库有效、抽题规则可满足、参与人员存在。
   */
  @Post('add')
  @Perms('add')
  @ApiOperation({ summary: '创建练习（基础信息+题库+抽题规则+参与人员+练习设置）' })
  @OperationLog({ target: '练习管理', type: '新增', content: '创建练习' })
  @ApiResult(PracticeVo)
  async add(@Body() dto: CreatePracticeDto, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    // 题库范围须是当前用户有权访问的题库，否则可借建练习读到无权题库的题目
    await this.bankAccess.assertCanReadBanks(dto.bankIds, admin);
    const err = await this.validatePractice(dto);
    if (err) return this.fail(err);
    const practice = await this.mutation.createPractice(dto, admin.userId);
    return this.ok(practice, '创建练习成功');
  }

  /**
   * 编辑练习（仅未发布可编辑）
   */
  @Put('update')
  @Perms('update')
  @ApiOperation({ summary: '编辑练习（仅未发布可编辑）' })
  @OperationLog({ target: '练习管理', type: '编辑', content: '编辑练习' })
  @ApiResult(PracticeVo)
  async update(@Body() dto: UpdatePracticeDto, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    await this.practiceService.assertOwned(dto.id, admin);
    await this.bankAccess.assertCanReadBanks(dto.bankIds, admin);
    const existing = await this.practiceService.getDetail(dto.id);
    if (!existing) return this.fail('练习不存在');
    if (existing.status !== 'unpublished') {
      return this.fail('只有未发布的练习可以编辑，请先撤回');
    }
    const err = await this.validatePractice(dto, dto.id);
    if (err) return this.fail(err);
    const practice = await this.mutation.updatePractice(dto.id, dto);
    return this.ok(practice, '编辑练习成功');
  }

  /**
   * 创建与编辑共用的入参校验
   * @param dto 练习入参
   * @param excludeId 编辑时排除自身 ID（唯一性校验用）
   * @returns 错误文案；校验通过时返回 null
   */
  private async validatePractice(
    dto: CreatePracticeDto,
    excludeId?: number,
  ): Promise<string | null> {
    if (await this.practiceService.isNameExists(dto.name.trim(), excludeId)) {
      return '练习名称已存在';
    }
    if (dto.code?.trim() && (await this.practiceService.isCodeExists(dto.code.trim(), excludeId))) {
      return '练习编号已存在';
    }

    const timeErr = this.validation.validateTimeRange(dto.startTime, dto.endTime, dto.autoFinish);
    if (timeErr) return timeErr;

    const bankErr = await this.validation.validateBanks(dto.bankIds);
    if (bankErr) return bankErr;

    // 顺序练不校验规则；按规则抽题须有可满足的规则
    if (dto.drawMode === 'random') {
      const ruleErr = await this.validation.validateRules(dto.bankIds, dto.rules ?? []);
      if (ruleErr) return ruleErr;
    }

    if (dto.participantScope === 'specified') {
      if (!dto.participants?.length) return '参与范围为指定员工时请至少选择一名人员';
      const pErr = await this.validation.validateParticipants(
        dto.participants.map((pt) => ({
          type: pt.participantType,
          internalUserId: pt.internalUserId,
          externalCandidateId: pt.externalCandidateId,
        })),
      );
      if (pErr) return pErr;
    }
    return null;
  }

  /**
   * 分配/更新参与人员
   *
   * 与 update 不同，本接口在已发布/进行中也可调用——练习途中补进新人（如新入职员工）
   * 是常规诉求，不必为此撤回整个练习。但已结束的练习不再接受变更。
   */
  @Get('participants/:id')
  @Perms('detail')
  @ApiOperation({ summary: '参与人员名单（带是否已练过标记）' })
  @ApiParam({ name: 'id', description: '练习 ID' })
  async participants(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    await this.practiceService.assertOwned(id, adminRaw);
    // 与本控制器其他接口口径一致：练习不存在要明确报错，
    // 不能让它和「练习存在但还没分配人员」都返回 200 空数组
    const detail = await this.practiceService.getDetail(id);
    if (!detail) return this.fail('练习不存在');
    const list = await this.practiceService.listParticipantsWithRecord(id);
    return this.ok(list);
  }

  /**
   * 追加参与人员（只增不减，已发布/进行中可用）
   *
   * 与 assign-participants 分开而不是放宽后者的状态校验：
   * 后者是全量替换，对进行中的练习用它，前端漏传一个人就会删掉那人的分配，
   * 而他可能正在练。本接口只 insert，已在名单里的人跳过。
   */
  @Post('append-participants')
  @Perms('assign-participants')
  @ApiOperation({ summary: '追加参与人员（只增不减，已发布/进行中可用）' })
  @OperationLog({ target: '练习管理', type: '编辑', content: '追加练习参与人员' })
  async appendParticipants(
    @Body() dto: AppendParticipantsDto,
    @Admin() adminRaw?: AdminPayload,
  ) {
    await this.practiceService.assertOwned(dto.practiceId, adminRaw);
    const detail = await this.practiceService.getDetail(dto.practiceId);
    if (!detail) return this.fail('练习不存在');
    // 未发布态走 assign-participants 的全量替换即可，不必用追加语义
    if (detail.status === 'unpublished') {
      return this.fail('练习尚未发布，请在编辑页直接维护参与人员');
    }
    if (detail.status === 'finished') {
      return this.fail('练习已结束，不能再调整参与人员');
    }
    /*
      全员参与的练习不接受追加。

      追加会把 participantScope 落成 specified，受众就从「全员」收窄到刚加的这几个人——
      管理员的意图是「加人」，结果是「把其他人全排除」，方向正好相反。
      要限定人员必须显式经由编辑页改参与范围。
    */
    if (detail.participantScope === 'all') {
      return this.fail('本练习为全员参与，无需维护名单；如需限定人员请在编辑页调整参与范围');
    }
    const err = await this.validation.validateParticipants(
      dto.participants.map((pt) => ({
        type: pt.participantType,
        internalUserId: pt.internalUserId,
        externalCandidateId: pt.externalCandidateId,
      })),
    );
    if (err) return this.fail(err);

    const count = await this.mutation.appendParticipants(dto.practiceId, dto.participants);
    return this.ok(null, count ? `已追加 ${count} 名人员` : '所选人员均已在名单中，无新增');
  }

  @Post('remove-participants')
  @Perms('assign-participants')
  @ApiOperation({ summary: '移除参与人员（仅未练过者）' })
  @OperationLog({ target: '练习管理', type: '编辑', content: '移除练习参与人员' })
  async removeParticipants(
    @Body() dto: RemoveParticipantsDto,
    @Admin() adminRaw?: AdminPayload,
  ) {
    await this.practiceService.assertOwned(dto.practiceId, adminRaw);
    const detail = await this.practiceService.getDetail(dto.practiceId);
    if (!detail) return this.fail('练习不存在');
    // 与追加同一档：未发布走编辑页全量维护，已结束不再改名单
    if (detail.status === 'unpublished') {
      return this.fail('练习尚未发布，请在编辑页直接维护参与人员');
    }
    if (detail.status === 'finished') {
      return this.fail('练习已结束，不能再调整参与人员');
    }
    const { removed, blocked } = await this.mutation.removeParticipants(dto.practiceId, dto.ids);
    if (!removed && blocked.length) {
      return this.fail(`${blocked.join('、')} 已开始练习，无法移除`);
    }
    /*
      removed 与 blocked 双零：传进来的行 id 都不属于本练习（或已被别人删掉）。
      此时报「已移除 0 名」会让调用方以为操作成功了，故明确说清。
    */
    if (!removed) return this.fail('所选人员不在本练习的名单中，请刷新后重试');
    const tail = blocked.length ? `；${blocked.join('、')} 已开始练习，未移除` : '';
    return this.ok(null, `已移除 ${removed} 名人员${tail}`);
  }

  @Post('assign-participants')
  @Perms('assign-participants')
  @ApiOperation({ summary: '分配/更新练习参与人员（覆盖式）' })
  @OperationLog({ target: '练习管理', type: '编辑', content: '分配练习参与人员' })
  async assignParticipants(
    @Body() dto: AssignParticipantsDto,
    @Admin() adminRaw?: AdminPayload,
  ) {
    await this.practiceService.assertOwned(dto.practiceId, adminRaw);
    const detail = await this.practiceService.getDetail(dto.practiceId);
    if (!detail) return this.fail('练习不存在');
    if (detail.status === 'finished') {
      return this.fail('练习已结束，不能再调整参与人员');
    }
    // 空列表会被 mutation 解读为「全员参与」，与「清空指定名单」的直觉相反，
    // 放大受众这种事必须显式经由 update 改 participantScope，不能从这里静默发生
    if (!dto.participants.length) {
      return this.fail('参与人员不能为空；如需改为全员参与，请在编辑练习中调整参与范围');
    }

    const err = await this.validation.validateParticipants(
      dto.participants.map((pt) => ({
        type: pt.participantType,
        internalUserId: pt.internalUserId,
        externalCandidateId: pt.externalCandidateId,
      })),
    );
    if (err) return this.fail(err);

    await this.mutation.assignParticipants(dto.practiceId, dto.participants);
    return this.ok(null, '分配参与人员成功');
  }

  /**
   * 抽题可用量查询
   * 编辑页填规则时实时提示各组合「可用 N 题」。
   */
  @Post('rule-availability')
  @Perms('list')
  @ApiOperation({ summary: '统计各抽题规则在题库范围内的可用题量' })
  async ruleAvailability(
    @Body() dto: PracticeRuleAvailabilityDto,
    @Admin() adminRaw?: AdminPayload,
  ) {
    const admin = this.requireAdmin(adminRaw);
    // 可用题量会暴露题库内容分布，同样按题库可读性收口
    await this.bankAccess.assertCanReadBanks(dto.bankIds, admin);
    const counts = await this.validation.ruleAvailability(dto.bankIds, dto.rules);
    return this.ok({ counts });
  }

  /**
   * 发布练习（未发布 → 已发布，发布后学员可见）
   */
  @Post('publish/:id')
  @Perms('publish')
  @ApiOperation({ summary: '发布练习（发布后学员可见）' })
  @ApiParam({ name: 'id', description: '练习 ID', type: Number })
  @OperationLog({ target: '练习管理', type: '编辑', content: '发布练习' })
  async publish(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    await this.practiceService.assertOwned(id, adminRaw);
    const err = await this.mutation.publish(id);
    if (err) return this.fail(err);
    return this.ok(null, '发布成功');
  }

  /**
   * 撤回练习（已发布/进行中 → 未发布）
   */
  @Post('withdraw/:id')
  @Perms('withdraw')
  @ApiOperation({ summary: '撤回练习（回到未发布，可继续编辑）' })
  @ApiParam({ name: 'id', description: '练习 ID', type: Number })
  @OperationLog({ target: '练习管理', type: '编辑', content: '撤回练习' })
  async withdraw(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    await this.practiceService.assertOwned(id, adminRaw);
    const err = await this.mutation.withdraw(id);
    if (err) return this.fail(err);
    return this.ok(null, '撤回成功');
  }

  /**
   * 手动结束练习（未开启自动结束时用）
   */
  @Post('finish/:id')
  @Perms('finish')
  @ApiOperation({ summary: '手动结束练习' })
  @ApiParam({ name: 'id', description: '练习 ID', type: Number })
  @OperationLog({ target: '练习管理', type: '编辑', content: '结束练习' })
  async finish(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    await this.practiceService.assertOwned(id, adminRaw);
    const err = await this.mutation.finish(id);
    if (err) return this.fail(err);
    return this.ok(null, '练习已结束');
  }

  /**
   * 删除练习（进行中不可删）
   */
  @Delete('delete/:id')
  @Perms('delete')
  @ApiOperation({ summary: '删除练习（进行中不可删）' })
  @ApiParam({ name: 'id', description: '练习 ID', type: Number })
  @OperationLog({ target: '练习管理', type: '删除', content: '删除练习' })
  async delete(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    await this.practiceService.assertOwned(id, adminRaw);
    const err = await this.mutation.removePractice(id);
    if (err) return this.fail(err);
    return this.ok(null, '删除成功');
  }

  /**
   * 批量删除练习
   * 逐个校验，返回成功数与失败明细，不因个别失败中断整批。
   */
  @Post('batch-delete')
  @Perms('batch-delete')
  @ApiOperation({ summary: '批量删除练习（进行中的会被跳过并返回原因）' })
  @OperationLog({ target: '练习管理', type: '删除', content: '批量删除练习' })
  async batchDelete(@Body() dto: BatchDeletePracticeDto, @Admin() adminRaw?: AdminPayload) {
    if (!dto.ids?.length) return this.fail('请选择要删除的练习');
    // 逐个校验归属，防止越权删除他人练习
    for (const id of dto.ids) {
      await this.practiceService.assertOwned(id, adminRaw);
    }
    const { success, failed } = await this.mutation.batchRemove(dto.ids);
    if (failed.length) {
      return this.ok(
        { success, failed },
        `成功删除 ${success} 个，${failed.length} 个未删除：${failed.join('；')}`,
      );
    }
    return this.ok({ success, failed }, `成功删除 ${success} 个练习`);
  }

  // 练习的增删改必须走上面带业务校验的入口（题库有效性、抽题规则可满足性、状态机前置条件），
  // 基类的通用 CRUD 会直接写 practice 表并绕过这些校验，故覆盖并屏蔽。
  // 不加 @Post/@Put/@Delete 装饰器 → 路由与权限点均不注册；fail 仅作纵深防御。
  async updateStatus() {
    return this.fail('练习状态请通过发布/撤回/结束操作变更');
  }
}
