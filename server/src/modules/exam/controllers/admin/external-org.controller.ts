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
import { ExternalOrgService } from '../../services/external-org.service';
import {
  CreateExternalOrgDto,
  UpdateExternalOrgDto,
  ImportExternalOrgDto,
} from '../../dto/external-org.dto';
import {
  ExternalOrgVo,
  ExternalOrgOptionVo,
  ImportOrgResultVo,
} from '../../vo/external-org.vo';

/**
 * 外部单位管理控制器
 * 提供外部单位的分页查询、新增、编辑、启停、删除，以及供外部考生表单使用的启用单位下拉选项。
 * 列表支持按单位名称、编码模糊筛选，状态精确筛选；
 * 新增/编辑校验名称与编码唯一性，删除时校验是否被外部考生引用。
 * list 与 update-status 复用基类默认实现。
 */
@ApiTags('外部单位管理')
@CrudController({
  prefix: 'admin/exam/external-org',
  api: ['update-status'],
  pageQueryOp: {
    keyWordLikeFields: ['name', 'code'],
    fieldEq: ['status'],
  },
})
export class ExternalOrgController extends CrudControllerFactory(ExternalOrgVo) {
  constructor(private readonly externalOrgService: ExternalOrgService) {
    super(externalOrgService);
  }

  /**
   * 获取启用状态的外部单位下拉选项
   * 供外部考生新增/编辑表单及筛选选择所属单位，仅返回启用单位。
   * 复用 list 权限点，避免新增独立权限。
   */
  @Get('options')
  @Perms('list')
  @ApiOperation({ summary: '获取启用状态的外部单位下拉选项' })
  @ApiArrayResult(ExternalOrgOptionVo)
  async options() {
    return this.ok(await this.externalOrgService.options());
  }

  /**
   * 新增外部单位
   * 校验单位名称唯一，填写编码时校验编码唯一后创建。
   */
  @Post('add')
  @Perms('add')
  @ApiOperation({ summary: '新增外部单位（校验名称/编码唯一）' })
  @ApiResult(ExternalOrgVo)
  async add(@Body() dto: CreateExternalOrgDto) {
    if (await this.externalOrgService.isNameExists(dto.name)) {
      return this.fail(`单位【${dto.name}】已存在，请更换名称`);
    }
    if (dto.code && (await this.externalOrgService.isCodeExists(dto.code))) {
      return this.fail(`单位编码【${dto.code}】已存在，请更换`);
    }
    const org = await this.externalOrgService.add(dto);
    return this.ok(org, '新增外部单位成功');
  }

  /**
   * 更新外部单位
   * 校验名称与编码唯一（排除自身）后更新。
   */
  @Put('update')
  @Perms('update')
  @ApiOperation({ summary: '更新外部单位（校验名称/编码唯一）' })
  @ApiOkVoid()
  async update(@Body() dto: UpdateExternalOrgDto) {
    const { id, ...data } = dto;
    if (await this.externalOrgService.isNameExists(dto.name, id)) {
      return this.fail(`单位【${dto.name}】已存在，请更换名称`);
    }
    if (dto.code && (await this.externalOrgService.isCodeExists(dto.code, id))) {
      return this.fail(`单位编码【${dto.code}】已存在，请更换`);
    }
    await this.externalOrgService.update(id, data);
    return this.ok(null, '编辑外部单位成功');
  }

  /**
   * 删除外部单位
   * 被外部考生引用时阻止删除。
   */
  @Delete('delete/:id')
  @Perms('delete')
  @ApiOperation({ summary: '按 id 删除外部单位（被外部考生引用时阻止）' })
  @ApiParam({ name: 'id', description: '外部单位 ID', type: Number })
  @ApiOkVoid()
  async delete(@Param('id', ParseIntPipe) id: number) {
    try {
      await this.externalOrgService.ensureDeletable(id);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '无法删除');
    }
    await this.externalOrgService.delete([id]);
    return this.ok(null, '删除外部单位成功');
  }

  /**
   * 批量删除外部单位
   * 逐个执行"被外部考生引用则阻止"校验，任一命中即整体失败不删除。
   * 覆盖基类 batch-delete：基类直删会绕过 ensureDeletable 关联保护。
   */
  @Post('batch-delete')
  @Perms('batch-delete')
  @ApiOperation({ summary: '批量删除外部单位（被外部考生引用时整体阻止）' })
  @ApiOkVoid()
  async batchDelete(@Body() body: { ids: number[] }) {
    if (!body.ids?.length || !body.ids.every((id) => typeof id === 'number')) {
      return this.fail('ids 格式不正确');
    }
    try {
      for (const id of body.ids) {
        await this.externalOrgService.ensureDeletable(id);
      }
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '无法删除');
    }
    await this.externalOrgService.delete(body.ids);
    return this.ok(null, `已删除 ${body.ids.length} 个外部单位`);
  }

  /**
   * 批量导入外部单位（逐行校验，有错跳过）
   * 合法行入库（默认启用），非法行跳过，返回成功/失败数量与失败明细。
   */
  @Post('import')
  @Perms('import')
  @ApiOperation({ summary: '批量导入外部单位（逐行跳过错误行）' })
  @ApiResult(ImportOrgResultVo)
  async import(@Body() dto: ImportExternalOrgDto) {
    const result = await this.externalOrgService.importOrgs(dto.rows);
    const msg = result.failed
      ? `成功导入 ${result.success} 个，跳过 ${result.failed} 行`
      : `成功导入 ${result.success} 个外部单位`;
    return this.ok(result, msg);
  }

  /**
   * 导出外部单位（按当前筛选，全量不分页）
   * 筛选条件与 list 一致（keyword 模糊匹配名称/编码，status 精确），返回全部匹配记录。
   */
  @Get('export')
  @Perms('export')
  @ApiOperation({ summary: '按筛选条件导出外部单位（全量）' })
  @ApiQuery({ name: 'keyword', required: false, description: '单位名称/编码（模糊）' })
  @ApiQuery({ name: 'status', required: false, description: '状态 1=启用 0=停用' })
  @ApiArrayResult(ExternalOrgVo)
  async export(@Query() query: Record<string, any>) {
    const status =
      typeof query.status === 'string' && /^-?\d+$/.test(query.status)
        ? Number(query.status)
        : undefined;
    const list = await this.externalOrgService.exportList({
      keyword: query.keyword,
      status,
    });
    return this.ok(list);
  }
}
