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
import { ApiResult, ApiPageResult, ApiOkVoid, Perms } from '@/common/decorators';
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
 * 列表支持按姓名、所属单位、准考证号模糊筛选（与关系）及账号状态精确筛选；
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
   * name/company/admissionNo 各自模糊匹配且为"与"关系，status 精确匹配。
   */
  @Get('list')
  @Perms('list')
  @ApiOperation({ summary: '分页查询外部考生（姓名/单位/准考证号模糊，状态精确）' })
  @ApiQuery({ name: 'name', required: false, description: '姓名（模糊）' })
  @ApiQuery({ name: 'company', required: false, description: '所属单位（模糊）' })
  @ApiQuery({ name: 'admissionNo', required: false, description: '准考证号（模糊）' })
  @ApiQuery({ name: 'status', required: false, description: '账号状态 1=启用 0=停用' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiPageResult(ExternalCandidateVo)
  async list(@Query() query: Record<string, any>) {
    // query 参数恒为字符串，status 为纯整数字符串时转数字，否则视为未筛选
    const status =
      typeof query.status === 'string' && /^-?\d+$/.test(query.status)
        ? Number(query.status)
        : undefined;
    const result = await this.candidateService.pageList(
      {
        name: query.name,
        company: query.company,
        admissionNo: query.admissionNo,
        status,
      },
      query.page ? Number(query.page) : undefined,
      query.pageSize ? Number(query.pageSize) : undefined,
    );
    return this.ok(result);
  }

  /**
   * 新增外部考生
   * 校验准考证号唯一后创建记录，并以准考证号为登录名生成考试账号（初始密码）。
   */
  @Post('add')
  @Perms('add')
  @ApiOperation({ summary: '新增外部考生并生成考试账号' })
  @ApiResult(ExternalCandidateVo)
  async add(@Body() dto: CreateExternalCandidateDto) {
    if (await this.candidateService.isAdmissionNoExists(dto.admissionNo)) {
      return this.fail(`准考证号【${dto.admissionNo}】已存在，请更换`);
    }
    const candidate = await this.candidateService.createWithAccount(dto);
    return this.ok(candidate, '新增成功，考试账号已生成');
  }

  /**
   * 更新外部考生信息
   * 准考证号不可修改（UpdateExternalCandidateDto 不含该字段，whitelist 校验拒绝传入）。
   */
  @Put('update')
  @Perms('update')
  @ApiOperation({ summary: '更新外部考生信息（准考证号不可修改）' })
  @ApiOkVoid()
  async update(@Body() dto: UpdateExternalCandidateDto) {
    const { id, ...data } = dto;
    await this.candidateService.updateInfo(id, data);
    return this.ok(null, '编辑外部考生成功');
  }

  /**
   * 重置外部考生考试账号密码
   * 密码重置为系统默认密码，返回明文供管理员一次性告知考生。
   */
  @Put('reset-password')
  @Perms('reset-password')
  @ApiOperation({ summary: '重置外部考生考试账号密码' })
  @ApiResult(ResetPasswordVo)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const password = await this.candidateService.resetPassword(dto.id);
    return this.ok({ password }, '密码重置成功');
  }

  /**
   * 批量导入外部考生
   * 按模板解析出的行数据批量导入并生成考试账号，返回成功导入数量。
   */
  @Post('import')
  @Perms('import')
  @ApiOperation({ summary: '批量导入外部考生并生成账号' })
  @ApiResult(ImportResultVo)
  async import(@Body() dto: ImportExternalCandidateDto) {
    try {
      const count = await this.candidateService.importCandidates(dto.rows);
      return this.ok({ count }, `成功导入 ${count} 名外部考生，账号已生成`);
    } catch (error) {
      // 导入校验失败（准考证号重复/冲突）返回友好中文提示
      return this.fail(error instanceof Error ? error.message : '导入失败');
    }
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
}
