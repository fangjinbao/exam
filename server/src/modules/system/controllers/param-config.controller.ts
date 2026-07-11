import { Controller, Get, Put, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BaseController } from '@/common/crud';
import { ApiPageResult, ApiOkVoid, Perms } from '@/common/decorators';
import { ParamConfigService } from '../services/param-config.service';
import { ParamConfigVo } from '../vo/param-config.vo';
import { UpdateParamConfigDto } from '../dto/param-config.dto';

/**
 * 参数配置控制器
 * 提供参数配置分页查询与参数值更新（仅改值，超范围阻止）。
 */
@ApiTags('系统管理-参数配置')
@Controller('admin/sys/param-config')
export class ParamConfigController extends BaseController {
  constructor(private readonly paramConfigService: ParamConfigService) {
    super();
  }

  /** 分页查询参数配置 */
  @Get('list')
  @Perms('list')
  @ApiOperation({ summary: '参数配置分页列表' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiPageResult(ParamConfigVo)
  async list(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const data = await this.paramConfigService.pageVo({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
    return this.ok(data);
  }

  /** 更新参数值（int 类型超出范围时阻止） */
  @Put('update')
  @Perms('update')
  @ApiOperation({ summary: '更新参数值' })
  @ApiOkVoid()
  async update(@Body() dto: UpdateParamConfigDto) {
    const res = await this.paramConfigService.updateValue(dto.id, dto.value);
    if (!res.ok) return this.fail(res.message || '更新失败');
    return this.ok();
  }
}
