import { Get, Query, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CrudController, CrudControllerFactory } from '@/common/crud';
import { ApiPageResult, ApiResult, Perms } from '@/common/decorators';
import { CertificateService } from '../../services/certificate.service';
import { CertificateVo, CertificateDetailVo } from '../../vo/certificate.vo';

/**
 * 证书发放控制器（台账）
 * 提供已发放证书的分页查询（按认证项目/考生关键词/证书状态筛选）、查看详情、下载。
 * 证书由考生达及格分且报考审核通过后系统自动发证产生，本控制器只读（不提供新增/编辑/删除）。
 * 证书状态（有效/已过期）按有效期至运行时判定；查看/下载复用同一份详情（含证书模板版式内容）。
 */
@ApiTags('证书发放')
@CrudController({
  prefix: 'admin/exam/certificate',
  api: [],
})
export class CertificateController extends CrudControllerFactory(CertificateVo) {
  constructor(private readonly certificateService: CertificateService) {
    super(certificateService);
  }

  /**
   * 证书发放分页列表（认证项目 + 考生关键词 + 证书状态）
   */
  @Get('list')
  @Perms('list')
  @ApiOperation({ summary: '证书发放分页列表（项目 + 考生 + 状态）' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiQuery({ name: 'projectId', required: false, description: '认证项目 ID' })
  @ApiQuery({ name: 'keyword', required: false, description: '考生姓名（模糊）' })
  @ApiQuery({ name: 'certStatus', required: false, description: '证书状态 valid 有效 / expired 已过期' })
  @ApiPageResult(CertificateVo)
  async list(@Query() query: Record<string, any>) {
    const projectId =
      typeof query.projectId === 'string' && /^\d+$/.test(query.projectId)
        ? Number(query.projectId)
        : undefined;
    const data = await this.certificateService.pageList(
      { projectId, keyword: query.keyword, certStatus: query.certStatus },
      query.page ? Number(query.page) : undefined,
      query.pageSize ? Number(query.pageSize) : undefined,
    );
    return this.ok(data);
  }

  /**
   * 证书详情（查看，含证书模板版式内容）
   */
  @Get('detail/:id')
  @Perms('detail')
  @ApiOperation({ summary: '按 id 查询证书详情（含版式内容）' })
  @ApiParam({ name: 'id', description: '证书 ID', type: Number })
  @ApiResult(CertificateDetailVo)
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.certificateService.detail(id);
    if (!data) return this.fail('证书记录不存在');
    return this.ok(data);
  }

  /**
   * 下载证书（返回证书完整渲染数据，前端据此生成文件；复用 detail 权限）
   */
  @Get('download/:id')
  @Perms('detail')
  @ApiOperation({ summary: '下载证书（返回完整渲染数据）' })
  @ApiParam({ name: 'id', description: '证书 ID', type: Number })
  @ApiResult(CertificateDetailVo)
  async download(@Param('id', ParseIntPipe) id: number) {
    const data = await this.certificateService.detail(id);
    if (!data) return this.fail('证书记录不存在');
    return this.ok(data);
  }

  // 只读台账：覆盖并屏蔽基类继承的写操作路由。
  // 不加 @Post/@Put/@Delete 装饰器 → NestJS 扫描子类原型拿到无 PATH_METADATA 的新函数，不注册这些路由；
  // perms-sync 同理不登记对应权限点。方法体 fail 仅作纵深防御（正常情况下路由已不存在）。
  async add() { return this.fail('证书发放为只读台账，不支持新增'); }
  async update() { return this.fail('证书发放为只读台账，不支持编辑'); }
  async updateStatus() { return this.fail('证书发放为只读台账，不支持修改状态'); }
  async delete() { return this.fail('证书发放为只读台账，不支持删除'); }
  async batchDelete() { return this.fail('证书发放为只读台账，不支持删除'); }
}
