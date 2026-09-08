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
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CrudController, CrudControllerFactory } from '@/common/crud';
import { ApiResult, ApiArrayResult, ApiOkVoid, Perms } from '@/common/decorators';
import { CertificateTemplateService } from '../../services/certificate-template.service';
import {
  CreateCertificateTemplateDto,
  UpdateCertificateTemplateDto,
} from '../../dto/certificate-template.dto';
import {
  CertificateTemplateVo,
  CertificateTemplateOptionVo,
} from '../../vo/certificate-template.vo';

/**
 * 证书模板管理控制器
 * 提供证书模板的分页查询、新增、编辑、启停、删除，以及供认证项目关联使用的启用模板下拉选项。
 * 列表支持按模板名称、证书标题、颁发机构模糊筛选，状态精确筛选；
 * 新增/编辑校验名称唯一，删除时校验是否被认证项目引用（引用保护待认证项目模块落地后启用）。
 * list 与 update-status 复用基类默认实现。
 */
@ApiTags('证书模板管理')
@CrudController({
  prefix: 'admin/exam/certificate-template',
  api: ['update-status'],
  pageQueryOp: {
    keyWordLikeFields: ['name', 'title', 'issuingOrg'],
    fieldEq: ['status'],
  },
})
export class CertificateTemplateController extends CrudControllerFactory(CertificateTemplateVo) {
  constructor(private readonly certificateTemplateService: CertificateTemplateService) {
    super(certificateTemplateService);
  }

  /**
   * 获取启用状态的证书模板下拉选项
   * 供认证项目关联证书模板时选择，仅返回启用模板。
   * 复用 list 权限点，避免新增独立权限。
   */
  @Get('options')
  @Perms('list')
  @ApiOperation({ summary: '获取启用状态的证书模板下拉选项' })
  @ApiArrayResult(CertificateTemplateOptionVo)
  async options() {
    return this.ok(await this.certificateTemplateService.options());
  }

  /**
   * 新增证书模板
   * 校验模板名称唯一后创建。
   */
  @Post('add')
  @Perms('add')
  @ApiOperation({ summary: '新增证书模板（校验名称唯一）' })
  @ApiResult(CertificateTemplateVo)
  async add(@Body() dto: CreateCertificateTemplateDto) {
    if (await this.certificateTemplateService.isNameExists(dto.name)) {
      return this.fail('模板名称已存在，请更换');
    }
    const template = await this.certificateTemplateService.add(dto);
    return this.ok(template, '新增证书模板成功');
  }

  /**
   * 更新证书模板
   * 校验名称唯一（排除自身）后更新。
   */
  @Put('update')
  @Perms('update')
  @ApiOperation({ summary: '更新证书模板（校验名称唯一）' })
  @ApiOkVoid()
  async update(@Body() dto: UpdateCertificateTemplateDto) {
    const { id, ...data } = dto;
    if (await this.certificateTemplateService.isNameExists(dto.name, id)) {
      return this.fail('模板名称已存在，请更换');
    }
    await this.certificateTemplateService.update(id, data);
    return this.ok(null, '编辑证书模板成功');
  }

  /**
   * 删除证书模板
   * 被认证项目引用时阻止删除（引用保护待认证项目模块落地后启用）。
   */
  @Delete('delete/:id')
  @Perms('delete')
  @ApiOperation({ summary: '按 id 删除证书模板（被认证项目引用时阻止）' })
  @ApiParam({ name: 'id', description: '证书模板 ID', type: Number })
  @ApiOkVoid()
  async delete(@Param('id', ParseIntPipe) id: number) {
    try {
      await this.certificateTemplateService.ensureDeletable(id);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '无法删除');
    }
    await this.certificateTemplateService.delete([id]);
    return this.ok(null, '删除证书模板成功');
  }

  /**
   * 批量删除证书模板
   * 逐个执行"被认证项目引用则阻止"校验，任一命中即整体失败不删除。
   * 覆盖基类 batch-delete：基类直删会绕过 ensureDeletable 关联保护。
   */
  @Post('batch-delete')
  @Perms('batch-delete')
  @ApiOperation({ summary: '批量删除证书模板（被认证项目引用时整体阻止）' })
  @ApiOkVoid()
  async batchDelete(@Body() body: { ids: number[] }) {
    if (!body.ids?.length || !body.ids.every((id) => typeof id === 'number')) {
      return this.fail('ids 格式不正确');
    }
    try {
      for (const id of body.ids) {
        await this.certificateTemplateService.ensureDeletable(id);
      }
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '无法删除');
    }
    await this.certificateTemplateService.delete(body.ids);
    return this.ok(null, `已删除 ${body.ids.length} 个证书模板`);
  }

  /**
   * 导出证书模板（按当前筛选，全量不分页）
   * 筛选条件与 list 一致（keyword 模糊匹配名称/标题/颁发机构，status 精确），返回全部匹配记录。
   */
  @Get('export')
  @Perms('export')
  @ApiOperation({ summary: '按筛选条件导出证书模板（全量）' })
  @ApiQuery({ name: 'keyword', required: false, description: '模板名称/标题/颁发机构（模糊）' })
  @ApiQuery({ name: 'status', required: false, description: '状态 1=启用 0=停用' })
  @ApiArrayResult(CertificateTemplateVo)
  async export(@Query() query: Record<string, any>) {
    const status =
      typeof query.status === 'string' && /^-?\d+$/.test(query.status)
        ? Number(query.status)
        : undefined;
    const list = await this.certificateTemplateService.exportList({
      keyword: query.keyword,
      status,
    });
    return this.ok(list);
  }
}
