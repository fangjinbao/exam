import {
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CrudController, CrudControllerFactory } from '@/common/crud';
import {
  ApiResult,
  ApiPageResult,
  ApiArrayResult,
  ApiOkVoid,
  Perms,
} from '@/common/decorators';
import { ExternalCandidateService } from '../../services/external-candidate.service';
import {
  CreateExternalCandidateDto,
  UpdateExternalCandidateDto,
  ResetPasswordDto,
  ImportExternalCandidateDto,
} from '../../dto/external-candidate.dto';
import {
  ExternalCandidateVo,
  ResetPasswordVo,
  ImportResultVo,
} from '../../vo/external-candidate.vo';

/**
 * 外部考生管理控制器
 * 提供外部考生的分页查询、新增（生成考试账号）、编辑、启停、删除、重置密码与批量导入。
 * 列表支持按姓名、手机号模糊筛选（与关系）及所属单位、账号状态精确筛选；
 * 密码相关字段（password/passwordV）均不对外返回。
 * 启停接口（update-status）复用基类默认实现。
 */
@ApiTags('外部考生管理')
@CrudController({ prefix: 'admin/exam/external-candidate' })
export class ExternalCandidateController extends CrudControllerFactory(
  ExternalCandidateVo,
) {
  constructor(private readonly candidateService: ExternalCandidateService) {
    super(candidateService);
  }

  /**
   * 按 id 查询外部考生详情（脱敏，不返回 password/passwordV）
   * 覆盖基类 detail：基类走裸查询会带出敏感字段。
   */
  @Get('detail/:id')
  @Perms('detail')
  @ApiOperation({ summary: '按 id 查询外部考生详情' })
  @ApiResult(ExternalCandidateVo)
  async detail(@Param('id', ParseIntPipe) id: number) {
    return this.ok(await this.candidateService.detail(id));
  }

  /**
   * 启用/停用外部考生账号（脱敏返回）
   * 覆盖基类 update-status：基类走裸更新会带出敏感字段。停用后该账号不可登录考生端。
   */
  @Put('update-status')
  @Perms('update-status')
  @ApiOperation({ summary: '启用/停用外部考生账号' })
  @ApiResult(ExternalCandidateVo)
  async updateStatus(@Body() body: { id: number; status: number }) {
    if (!body.id || typeof body.id !== 'number') return this.fail('id 不能为空');
    if (body.status !== 0 && body.status !== 1) return this.fail('status 只能为 0 或 1');
    return this.ok(await this.candidateService.changeStatus(body.id, body.status));
  }

  /**
   * 分页查询外部考生
   * name/phone 各自模糊匹配且为"与"关系，orgId/status 精确匹配。
   */
  @Get('list')
  @Perms('list')
  @ApiOperation({ summary: '分页查询外部考生（姓名/手机号模糊，所属单位/状态精确）' })
  @ApiQuery({ name: 'name', required: false, description: '姓名（模糊）' })
  @ApiQuery({ name: 'orgId', required: false, description: '所属外部单位 ID（精确）' })
  @ApiQuery({ name: 'phone', required: false, description: '手机号（模糊）' })
  @ApiQuery({ name: 'status', required: false, description: '账号状态 1=启用 0=停用' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiPageResult(ExternalCandidateVo)
  async list(@Query() query: Record<string, any>) {
    // query 参数恒为字符串，status/orgId 为纯整数字符串时转数字，否则视为未筛选
    const status =
      typeof query.status === 'string' && /^-?\d+$/.test(query.status)
        ? Number(query.status)
        : undefined;
    const orgId =
      typeof query.orgId === 'string' && /^\d+$/.test(query.orgId)
        ? Number(query.orgId)
        : undefined;
    const result = await this.candidateService.pageList(
      {
        name: query.name,
        orgId,
        phone: query.phone,
        status,
      },
      query.page ? Number(query.page) : undefined,
      query.pageSize ? Number(query.pageSize) : undefined,
    );
    return this.ok(result);
  }

  /**
   * 新增外部考生
   * 校验手机号（登录账号）唯一后创建记录；密码留空时默认取手机号后 6 位。
   */
  @Post('add')
  @Perms('add')
  @ApiOperation({ summary: '新增外部考生并生成考试账号' })
  @ApiResult(ExternalCandidateVo)
  async add(@Body() dto: CreateExternalCandidateDto) {
    if (await this.candidateService.isPhoneExists(dto.phone)) {
      return this.fail(`手机号【${dto.phone}】已被注册，请更换`);
    }
    if (!(await this.candidateService.isOrgSelectable(dto.orgId))) {
      return this.fail('所属单位不存在或已停用，请重新选择');
    }
    const candidate = await this.candidateService.createWithAccount(dto);
    return this.ok(candidate, '新增成功，考试账号已生成');
  }

  /**
   * 更新外部考生信息
   * 手机号作为登录账号可修改，但需校验系统内唯一（排除自身）。
   */
  @Put('update')
  @Perms('update')
  @ApiOperation({ summary: '更新外部考生信息' })
  @ApiOkVoid()
  async update(@Body() dto: UpdateExternalCandidateDto) {
    const { id, ...data } = dto;
    if (await this.candidateService.isPhoneExists(data.phone, id)) {
      return this.fail(`手机号【${data.phone}】已被注册，请更换`);
    }
    if (!(await this.candidateService.isOrgSelectable(data.orgId))) {
      return this.fail('所属单位不存在或已停用，请重新选择');
    }
    await this.candidateService.updateInfo(id, data);
    return this.ok(null, '编辑外部考生成功');
  }

  /**
   * 重置外部考生考试账号密码
   * 密码重置为手机号后 6 位，返回明文供管理员一次性告知考生。
   */
  @Put('reset-password')
  @Perms('reset-password')
  @ApiOperation({ summary: '重置外部考生考试账号密码' })
  @ApiResult(ResetPasswordVo)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const password = await this.candidateService.resetPassword(dto.id);
    if (password === null) return this.fail('外部考生不存在');
    return this.ok({ password }, '密码重置成功');
  }

  /**
   * 批量导入外部考生（逐行校验，有错跳过）
   * 合法行入库并生成考试账号，非法行跳过，返回成功/失败数量与失败明细。
   */
  @Post('import')
  @Perms('import')
  @ApiOperation({ summary: '批量导入外部考生并生成账号（逐行跳过错误行）' })
  @ApiResult(ImportResultVo)
  async import(@Body() dto: ImportExternalCandidateDto) {
    const result = await this.candidateService.importCandidates(dto.rows);
    const msg = result.failed
      ? `成功导入 ${result.success} 名，跳过 ${result.failed} 行`
      : `成功导入 ${result.success} 名外部考生，账号已生成`;
    return this.ok(result, msg);
  }

  /**
   * 导出外部考生（按当前筛选，全量不分页）
   * 筛选条件与 list 一致，返回全部匹配记录供前端生成表格文件（脱敏，不含密码）。
   */
  @Get('export')
  @Perms('export')
  @ApiOperation({ summary: '按筛选条件导出外部考生（全量）' })
  @ApiQuery({ name: 'name', required: false, description: '姓名（模糊）' })
  @ApiQuery({ name: 'orgId', required: false, description: '所属外部单位 ID（精确）' })
  @ApiQuery({ name: 'phone', required: false, description: '手机号（模糊）' })
  @ApiQuery({ name: 'status', required: false, description: '账号状态 1=启用 0=停用' })
  @ApiArrayResult(ExternalCandidateVo)
  async export(@Query() query: Record<string, any>) {
    const status =
      typeof query.status === 'string' && /^-?\d+$/.test(query.status)
        ? Number(query.status)
        : undefined;
    const orgId =
      typeof query.orgId === 'string' && /^\d+$/.test(query.orgId)
        ? Number(query.orgId)
        : undefined;
    const list = await this.candidateService.exportList({
      name: query.name,
      orgId,
      phone: query.phone,
      status,
    });
    return this.ok(list);
  }

  /**
   * 删除外部考生
   * 删除后其考试账号一并失效；预留"已分配考试不可删除"校验（考试分配模块落地后补充）。
   */
  @Delete('delete/:id')
  @Perms('delete')
  @ApiOperation({ summary: '按 id 删除外部考生' })
  @ApiOkVoid()
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.candidateService.ensureDeletable(id);
    await this.candidateService.delete([id]);
    return this.ok(null, '删除外部考生成功');
  }

  /**
   * 批量删除外部考生
   * 逐个执行删除前关联校验后统一删除；删除后对应考试账号一并失效。
   * 覆盖基类 batch-delete：基类直删会绕过 ensureDeletable 关联保护。
   */
  @Post('batch-delete')
  @Perms('batch-delete')
  @ApiOperation({ summary: '批量删除外部考生（body: {ids: number[]}）' })
  @ApiOkVoid()
  async batchDelete(@Body() body: { ids: number[] }) {
    if (!body.ids?.length || !body.ids.every((id) => typeof id === 'number')) {
      return this.fail('ids 格式不正确');
    }
    for (const id of body.ids) {
      await this.candidateService.ensureDeletable(id);
    }
    await this.candidateService.delete(body.ids);
    return this.ok(null, `已删除 ${body.ids.length} 名外部考生`);
  }
}
