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
import { ApiResult, ApiOkVoid, Perms } from '@/common/decorators';
import { ApiArrayResult } from '@/common/decorators';
import { QuestionBankService } from '../../services/question-bank.service';
import {
  QuestionBankAccessService,
  type AdminPayload,
} from '../../services/question-bank-access.service';
import {
  CreateQuestionBankDto,
  UpdateQuestionBankDto,
  ImportQuestionBankDto,
} from '../../dto/question-bank.dto';
import { QuestionBankVo, ImportResultVo } from '../../vo/question-bank.vo';
import { Admin } from '@/common/decorators/admin.decorator';

/**
 * 题库管理控制器
 * 提供题库的分页查询（带题目数量统计）、新增、编辑、删除。
 * 列表支持按题库名称模糊、状态精确筛选；
 * 新增/编辑校验名称与编码唯一（编码留空时自动生成），删除时校验题库下是否存在题目。
 */
@ApiTags('题库管理')
@CrudController({
  prefix: 'admin/exam/question-bank',
})
export class QuestionBankController extends CrudControllerFactory(QuestionBankVo) {
  constructor(
    private readonly questionBankService: QuestionBankService,
    private readonly access: QuestionBankAccessService,
  ) {
    super(questionBankService);
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
   * 分页查询题库（带题目数量统计）
   * 覆盖基类 list：基类默认不含 questionCount 聚合，此处走 service 的带统计查询。
   */
  @Get('list')
  @Perms('list')
  @ApiOperation({ summary: '分页查询题库（带题目数量统计）' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiQuery({ name: 'keyword', required: false, description: '题库名称（模糊）' })
  @ApiQuery({ name: 'status', required: false, description: '状态 1=启用 0=停用' })
  @ApiQuery({ name: 'visibleScope', required: false, description: '可见范围筛选' })
  @ApiQuery({ name: 'onlyMine', required: false, description: '仅看我创建的（1/true）' })
  async list(@Query() query: Record<string, any>, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    const status =
      typeof query.status === 'string' && /^-?\d+$/.test(query.status)
        ? Number(query.status)
        : undefined;
    const result = await this.questionBankService.pageWithCount(
      {
        keyword: query.keyword,
        status,
        visibleScope: query.visibleScope || undefined,
        onlyMine: query.onlyMine === '1' || query.onlyMine === 'true',
      },
      query.page ? Number(query.page) : undefined,
      query.pageSize ? Number(query.pageSize) : undefined,
      admin,
    );
    return this.ok(result);
  }

  /**
   * 新增题库
   * 校验名称唯一；编码留空则自动生成，填写则校验唯一后创建。
   */
  @Post('add')
  @Perms('add')
  @ApiOperation({ summary: '新增题库（校验名称/编码唯一，编码留空自动生成）' })
  @ApiResult(QuestionBankVo)
  async add(@Body() dto: CreateQuestionBankDto, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    if (await this.questionBankService.isNameExists(dto.name)) {
      return this.fail(`题库【${dto.name}】已存在，请更换名称`);
    }
    let code = dto.code?.trim();
    if (code) {
      if (await this.questionBankService.isCodeExists(code)) {
        return this.fail(`题库编码【${code}】已存在，请更换`);
      }
    } else {
      code = await this.questionBankService.generateCode();
    }
    const bank = await this.questionBankService.add({
      name: dto.name,
      code,
      description: dto.description ?? null,
      status: dto.status ?? 1,
      // 创建人取自登录态，不接受前端传入，防止伪造归属
      createBy: admin.userId,
      visibleScope: dto.visibleScope ?? 'all',
      // 「仅自己」不共享给他人，级别归一化为 manage（直调接口也不落库无意义组合）
      shareLevel: dto.visibleScope === 'self' ? 'manage' : (dto.shareLevel ?? 'manage'),
    });
    return this.ok(bank, '新增题库成功');
  }

  /**
   * 更新题库
   * 校验名称与编码唯一（排除自身）后更新；编码留空则保持不变（不重新生成）。
   */
  @Put('update')
  @Perms('update')
  @ApiOperation({ summary: '更新题库（校验名称/编码唯一）' })
  @ApiOkVoid()
  async update(@Body() dto: UpdateQuestionBankDto, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    const { id, code, visibleScope, shareLevel, ...rest } = dto;
    // 编辑题库信息需可管理权限
    await this.access.assertCanManage(id, admin);

    // 共享属性发生变化时，额外要求「创建人（或超管）」身份
    const current = await this.questionBankService.info(id);
    const shareChanged =
      (visibleScope !== undefined && visibleScope !== current.visibleScope) ||
      (shareLevel !== undefined && shareLevel !== current.shareLevel);
    if (shareChanged) {
      await this.access.assertCanEditShare(id, admin);
    }

    if (await this.questionBankService.isNameExists(dto.name, id)) {
      return this.fail(`题库【${dto.name}】已存在，请更换名称`);
    }
    const trimmedCode = code?.trim();
    if (trimmedCode && (await this.questionBankService.isCodeExists(trimmedCode, id))) {
      return this.fail(`题库编码【${trimmedCode}】已存在，请更换`);
    }
    await this.questionBankService.update(id, {
      ...rest,
      // 编码留空时不覆盖原值（保持编辑前的编码）
      ...(trimmedCode ? { code: trimmedCode } : {}),
      // 仅在允许改共享属性时才写入，避免无权用户提交被静默采纳；
      // 「仅自己」不共享给他人，级别归一化为 manage
      ...(shareChanged
        ? {
            visibleScope,
            shareLevel: visibleScope === 'self' ? 'manage' : shareLevel,
          }
        : {}),
    });
    return this.ok(null, '编辑题库成功');
  }

  /**
   * 删除题库
   * 题库下存在题目时阻止删除。
   */
  @Delete('delete/:id')
  @Perms('delete')
  @ApiOperation({ summary: '按 id 删除题库（题库下有题目时阻止）' })
  @ApiParam({ name: 'id', description: '题库 ID', type: Number })
  @ApiOkVoid()
  async delete(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    await this.access.assertCanManage(id, admin);
    try {
      await this.questionBankService.ensureDeletable(id);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '无法删除');
    }
    await this.questionBankService.delete([id]);
    return this.ok(null, '删除题库成功');
  }

  /**
   * 按筛选条件导出题库（全量不分页）
   * 筛选条件与 list 一致，返回全部匹配记录供前端生成表格文件。
   */
  @Get('export')
  @Perms('export')
  @ApiOperation({ summary: '按筛选条件导出题库（全量）' })
  @ApiQuery({ name: 'keyword', required: false, description: '题库名称（模糊）' })
  @ApiQuery({ name: 'status', required: false, description: '状态 1=启用 0=停用' })
  @ApiArrayResult(QuestionBankVo)
  async export(@Query() query: Record<string, any>, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    const status =
      typeof query.status === 'string' && /^-?\d+$/.test(query.status)
        ? Number(query.status)
        : undefined;
    const list = await this.questionBankService.exportList(
      {
        keyword: query.keyword,
        status,
        visibleScope: query.visibleScope || undefined,
        onlyMine: query.onlyMine === '1' || query.onlyMine === 'true',
      },
      undefined,
      admin,
    );
    return this.ok(list);
  }

  /**
   * 批量导入题库（逐行校验，有错跳过）
   */
  @Post('import')
  @Perms('import')
  @ApiOperation({ summary: '批量导入题库（逐行跳过错误行）' })
  @ApiResult(ImportResultVo)
  async import(@Body() dto: ImportQuestionBankDto, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    const result = await this.questionBankService.importBanks(dto.rows, admin.userId);
    const message = result.failed
      ? `成功导入 ${result.success} 个，跳过 ${result.failed} 行`
      : `成功导入 ${result.success} 个题库`;
    return this.ok(result, message);
  }

  /**
   * 批量删除题库
   * 逐个执行"题库下有题目则阻止"校验，任一命中即整体失败不删除。
   * 覆盖基类 batch-delete：基类直删会绕过 ensureDeletable 关联保护。
   */
  @Post('batch-delete')
  @Perms('batch-delete')
  @ApiOperation({ summary: '批量删除题库（题库下有题目时整体阻止）' })
  @ApiOkVoid()
  async batchDelete(@Body() body: { ids: number[] }, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    if (!body.ids?.length || !body.ids.every((id) => typeof id === 'number')) {
      return this.fail('ids 格式不正确');
    }
    // 逐个鉴权：任一无权即整体拒绝，不做部分删除
    for (const id of body.ids) {
      await this.access.assertCanManage(id, admin);
    }
    try {
      for (const id of body.ids) {
        await this.questionBankService.ensureDeletable(id);
      }
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '无法删除');
    }
    await this.questionBankService.delete(body.ids);
    return this.ok(null, `已删除 ${body.ids.length} 个题库`);
  }

  /**
   * 按 id 查询题库详情
   * 覆盖基类 detail：基类不校验可见范围，会让无权用户直接读到题库。
   */
  @Get('detail/:id')
  @Perms('detail')
  @ApiOperation({ summary: '按 id 查询题库详情（校验可见范围）' })
  @ApiParam({ name: 'id', description: '题库 ID', type: Number })
  @ApiResult(QuestionBankVo)
  async detail(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    await this.access.assertCanRead(id, admin);
    const bank = await this.questionBankService.info(id);
    const caps = await this.access.getCapabilitiesFromBank(bank, admin);
    return this.ok({
      ...bank,
      canManage: caps.canManage,
      canEditShare: caps.canEditShare,
    });
  }

  /**
   * 修改题库状态（启用/停用）
   * 覆盖基类 update-status：基类不鉴权，只读共享用户可借此改状态。
   */
  @Put('update-status')
  @Perms('update-status')
  @ApiOperation({ summary: '修改题库状态（校验管理权限）' })
  @ApiOkVoid()
  async updateStatus(
    @Body() body: { id: number; status: number },
    @Admin() adminRaw?: AdminPayload,
  ) {
    const admin = this.requireAdmin(adminRaw);
    if (!body.id || typeof body.id !== 'number') return this.fail('id 不能为空');
    if (typeof body.status !== 'number') return this.fail('status 必须为数字');
    await this.access.assertCanManage(body.id, admin);
    await this.questionBankService.update(body.id, { status: body.status });
    return this.ok(null, '状态更新成功');
  }
}
