import { Controller, Get, Post, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { BaseController } from '@/common/crud';
import {
  ApiPageResult,
  ApiArrayResult,
  ApiOkVoid,
  Perms,
  Admin,
  OperationLog,
} from '@/common/decorators';
import type { AdminPayload } from '../../services/org-scope.service';
import { CertEnrollService } from '../../services/cert-enroll.service';
import { EnrollDto } from '../../dto/cert-enroll.dto';
import {
  EnrollProjectVo,
  MyQuotaVo,
  EnrollCandidateVo,
  MyApplicationVo,
} from '../../vo/cert-enroll.vo';

/**
 * 鉴定报名控制器（单位管理员按名额报人）
 *
 * 各单位的管理员在这里给本单位人员报名：列出已发布且分到本单位名额的项目，
 * 按名额行挑人提交，提交后进入待审核，由「报名审核」处置。
 *
 * 单位隔离：当前管理员的单位由 SysUser.departmentId 沿 parentId 上溯到最近的
 * 公司节点得出，前端不传单位——传了也不认，否则改个入参就能替别的单位报名。
 * 超管可指定任意单位。
 *
 * 名额硬拦：本行剩余不足时整批拒绝。计数与写入在同一事务内完成，
 * 避免两个管理员同时提交把名额撑破。
 *
 * 不继承 CrudControllerFactory：这里没有「对某张表增删改查」的形态，
 * 报名写入的是 CertApplication、读的是 CertProject/CertProjectQuota/SysUser，
 * 继承过来的 6 个写接口全要覆写取消注册，反而更绕（同 exam-analytics 的取舍）。
 */
@ApiTags('鉴定报名')
@Controller('admin/exam/cert-enroll')
export class CertEnrollController extends BaseController {
  constructor(private readonly certEnrollService: CertEnrollService) {
    super();
  }

  /**
   * 可报名项目分页列表（已发布 + 启用 + 分到我单位名额）
   */
  @Get('projects')
  @Perms('list')
  @ApiOperation({ summary: '可报名项目列表（已发布且分到本单位名额）' })
  @ApiQuery({ name: 'page', required: false, description: '页码', type: Number })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数', type: Number })
  @ApiPageResult(EnrollProjectVo)
  async projects(@Query() query: Record<string, any>, @Admin() admin: AdminPayload) {
    const page = query.page ? Number(query.page) : undefined;
    const pageSize = query.pageSize ? Number(query.pageSize) : undefined;
    return this.ok(await this.certEnrollService.pageProjects(admin, page, pageSize));
  }

  /**
   * 我的单位在某项目下的各个名额行（含已用/剩余）
   */
  @Get('my-quotas/:projectId')
  @Perms('list')
  @ApiOperation({ summary: '我的单位在该项目下的名额行（含已用/剩余）' })
  @ApiParam({ name: 'projectId', description: '鉴定项目 ID', type: Number })
  @ApiQuery({ name: 'orgId', required: false, description: '指定单位（仅超管有效）', type: Number })
  @ApiArrayResult(MyQuotaVo)
  async myQuotas(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Admin() admin: AdminPayload,
    @Query('orgId') orgId?: string,
  ) {
    const org = orgId ? Number(orgId) : undefined;
    return this.ok(await this.certEnrollService.listMyQuotas(projectId, admin, org));
  }

  /**
   * 某名额行可选的人员（按名额行的部门范围过滤，排除已占名额的人）
   */
  @Get('candidates/:quotaId')
  @Perms('list')
  @ApiOperation({ summary: '某名额行可选人员（排除已在本项目占名额的）' })
  @ApiParam({ name: 'quotaId', description: '名额行 ID', type: Number })
  @ApiQuery({ name: 'keyword', required: false, description: '姓名或工号模糊搜索' })
  @ApiArrayResult(EnrollCandidateVo)
  async candidates(
    @Param('quotaId', ParseIntPipe) quotaId: number,
    @Admin() admin: AdminPayload,
    @Query('keyword') keyword?: string,
  ) {
    try {
      return this.ok(await this.certEnrollService.listCandidates(quotaId, admin, keyword));
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '查询人员失败');
    }
  }

  /**
   * 我的单位在某项目下已报的人员
   */
  @Get('my-applications/:projectId')
  @Perms('list')
  @ApiOperation({ summary: '我的单位在该项目下已报人员' })
  @ApiParam({ name: 'projectId', description: '鉴定项目 ID', type: Number })
  @ApiQuery({ name: 'orgId', required: false, description: '指定单位（仅超管有效）', type: Number })
  @ApiArrayResult(MyApplicationVo)
  async myApplications(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Admin() admin: AdminPayload,
    @Query('orgId') orgId?: string,
  ) {
    const org = orgId ? Number(orgId) : undefined;
    return this.ok(await this.certEnrollService.listMyApplications(projectId, admin, org));
  }

  /**
   * 提交报名（名额不足时整批拒绝）
   */
  @Post('submit')
  @Perms('submit')
  @ApiOperation({ summary: '提交鉴定报名（名额硬拦，不足时整批拒绝）' })
  @OperationLog({ target: '鉴定报名', type: '新增', content: '提交鉴定报名' })
  @ApiOkVoid()
  async submit(@Body() dto: EnrollDto, @Admin() admin: AdminPayload) {
    try {
      const n = await this.certEnrollService.enroll(dto.quotaId, dto.userIds, admin);
      return this.ok(null, `已提交 ${n} 人报名，等待审核`);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '报名失败');
    }
  }

  /**
   * 撤销报名（仅本单位、仅待审核）
   */
  @Delete('cancel/:id')
  @Perms('cancel')
  @ApiOperation({ summary: '撤销报名（仅待审核可撤销）' })
  @OperationLog({ target: '鉴定报名', type: '删除', content: '撤销鉴定报名' })
  @ApiParam({ name: 'id', description: '报名记录 ID', type: Number })
  @ApiOkVoid()
  async cancel(@Param('id', ParseIntPipe) id: number, @Admin() admin: AdminPayload) {
    try {
      await this.certEnrollService.cancel(id, admin);
      return this.ok(null, '已撤销该报名');
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '撤销失败');
    }
  }
}
