import { Get, Post, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CrudController, CrudControllerFactory } from '@/common/crud';
import { ApiResult, ApiPageResult, ApiOkVoid, Perms, Admin, OperationLog } from '@/common/decorators';
import { CertApplicationService } from '../../services/cert-application.service';
import { ReviewApplicationDto, ReviewBatchDto } from '../../dto/cert-application.dto';
import { CertApplicationVo } from '../../vo/cert-application.vo';

/**
 * 报考审核控制器
 * 提供报考申请的分页查询（按认证项目/审核状态/考生关键词筛选）、详情，以及审核（通过/驳回）。
 * 报考记录由考生端提交产生，本控制器不提供新增/删除入口（api 仅保留读接口，写操作为自定义 review）。
 * 审核通过后考生获得对应考试参考资格；驳回时必须填写驳回原因；已审核的记录不可重复审核。
 */
@ApiTags('报考审核')
@CrudController({
  prefix: 'admin/exam/cert-application',
  api: [],
})
export class CertApplicationController extends CrudControllerFactory(CertApplicationVo) {
  constructor(private readonly certApplicationService: CertApplicationService) {
    super(certApplicationService);
  }

  /**
   * 报考申请分页列表（认证项目 + 审核状态 + 考生关键词）
   */
  @Get('list')
  @Perms('list')
  @ApiOperation({ summary: '报考申请分页列表（项目 + 状态 + 考生关键词）' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiQuery({ name: 'projectId', required: false, description: '认证项目 ID' })
  @ApiQuery({ name: 'status', required: false, description: '审核状态 pending/approved/rejected' })
  @ApiQuery({ name: 'keyword', required: false, description: '考生姓名（模糊）' })
  @ApiQuery({ name: 'orgId', required: false, description: '报名单位 ID（公司节点）' })
  @ApiPageResult(CertApplicationVo)
  // admin 声明为可选是基类 CrudControllerBase 的签名要求（它承诺 list(query)
  // 单参可调）。实际由 @Admin() 注入，不会为空；万一为空，服务端一侧按
  // 「查不到任何记录」处理，不是按「看全部」处理
  async list(@Query() query: Record<string, any>, @Admin() admin?: any) {
    const num = (v: unknown) =>
      typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : undefined;
    const data = await this.certApplicationService.pageList(
      {
        projectId: num(query.projectId),
        status: query.status,
        keyword: query.keyword,
        orgId: num(query.orgId),
      },
      query.page ? Number(query.page) : undefined,
      query.pageSize ? Number(query.pageSize) : undefined,
      // 可见范围由服务端按登录身份算，不接受前端指定——orgId 那类筛选值
      // 只能在此范围内再收窄
      admin,
    );
    return this.ok(data);
  }

  /**
   * 报考申请详情
   */
  @Get('detail/:id')
  @Perms('detail')
  @ApiOperation({ summary: '按 id 查询报考申请详情' })
  @ApiParam({ name: 'id', description: '报考申请 ID', type: Number })
  @ApiResult(CertApplicationVo)
  async detail(@Param('id', ParseIntPipe) id: number, @Admin() admin?: any) {
    const data = await this.certApplicationService.detail(id, admin);
    // 不归自己审的记录同样报「不存在」：换个文案就等于确认了这条记录存在
    if (!data) return this.fail('报考记录不存在');
    return this.ok(data);
  }

  /**
   * 审核报考申请（通过/驳回）
   * 审核人取当前登录用户；驳回时必须填写驳回原因；已审核记录不可重复审核。
   */
  @Post('review')
  @Perms('review')
  @ApiOperation({ summary: '审核报考申请（通过/驳回）' })
  @OperationLog({ target: '报考审核', type: '编辑', content: '审核报考申请' })
  @ApiOkVoid()
  async review(@Body() dto: ReviewApplicationDto, @Admin() admin: any) {
    try {
      await this.certApplicationService.review(
        dto.id,
        dto.result,
        admin?.userId,
        admin?.name || admin?.username || '系统',
        dto.rejectReason,
        // 前几个参数只用来记审核人姓名，归属校验要的是整个 payload
        admin,
      );
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '审核失败');
    }
    return this.ok(null, dto.result === 'approved' ? '审核通过成功' : '审核驳回成功');
  }

  /**
   * 批量审核（通过/驳回）
   *
   * 单位一次报上来几十人，逐条点不现实。整批要么全成要么全不成：
   * 含已审记录时整批拒绝，而不是挑出待审的悄悄审掉。
   */
  @Post('review-batch')
  @Perms('review-batch')
  @ApiOperation({ summary: '批量审核报名（通过/驳回）' })
  @OperationLog({ target: '报名审核', type: '编辑', content: '批量审核报名' })
  @ApiOkVoid()
  async reviewBatch(@Body() dto: ReviewBatchDto, @Admin() admin: any) {
    try {
      const n = await this.certApplicationService.reviewBatch(
        dto.ids,
        dto.result,
        admin?.userId,
        admin?.name || admin?.username || '系统',
        dto.rejectReason,
        admin,
      );
      return this.ok(null, `已${dto.result === 'approved' ? '通过' : '驳回'} ${n} 条报名`);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '批量审核失败');
    }
  }

  // 报名记录由「鉴定报名」按名额提交产生，仅可通过 review 审核：
  // 覆盖并屏蔽基类继承的写操作路由。
  // 不加 @Post/@Put/@Delete 装饰器 → 路由与权限点均不注册；fail 仅作纵深防御。
  // 屏蔽 add/update 尤为关键：否则可绕过 review 状态机直接创建/篡改为 approved。
  // 删除走「鉴定报名」的 cancel（仅本单位、仅待审核），不在此开口子。
  async add() { return this.fail('报名记录请在「鉴定报名」中按名额提交'); }
  async update() { return this.fail('报名记录仅可通过审核操作变更，不支持直接编辑'); }
  async updateStatus() { return this.fail('报名状态仅可通过审核操作变更'); }
  async delete() { return this.fail('报名记录请在「鉴定报名」中撤销'); }
  async batchDelete() { return this.fail('报名记录不支持批量删除'); }
}
