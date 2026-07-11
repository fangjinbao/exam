import { Controller, Get, Post, Put, Delete, Body, Query, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { BaseController } from '@/common/crud';
import { ApiPageResult, ApiResult, ApiOkVoid, Perms } from '@/common/decorators';
import { AiModelService } from '../services/ai-model.service';
import { AiModelVo, AiModelTestVo } from '../vo/ai-model.vo';
import { AddAiModelDto, UpdateAiModelDto, AiModelIdDto } from '../dto/ai-model.dto';

/**
 * AI 模型配置控制器
 * 提供 AI 模型配置的增删改查、启用切换与连接测试；密钥脱敏下发。
 */
@ApiTags('系统管理-AI模型配置')
@Controller('admin/sys/ai-model')
export class AiModelController extends BaseController {
  constructor(private readonly aiModelService: AiModelService) {
    super();
  }

  /** 分页查询（密钥脱敏） */
  @Get('list')
  @Perms('list')
  @ApiOperation({ summary: 'AI 模型配置分页列表' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiPageResult(AiModelVo)
  async list(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const data = await this.aiModelService.pageVo({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
    return this.ok(data);
  }

  /** 新增配置 */
  @Post('add')
  @Perms('add')
  @ApiOperation({ summary: '新增 AI 模型配置' })
  @ApiResult(AiModelVo)
  async add(@Body() dto: AddAiModelDto) {
    const res = await this.aiModelService.create(dto);
    if (!res.ok) return this.fail(res.message);
    return this.ok(res.data);
  }

  /** 更新配置（密钥留空不改） */
  @Put('update')
  @Perms('update')
  @ApiOperation({ summary: '更新 AI 模型配置' })
  @ApiResult(AiModelVo)
  async update(@Body() dto: UpdateAiModelDto) {
    const res = await this.aiModelService.modify(dto.id, dto);
    if (!res.ok) return this.fail(res.message);
    return this.ok(res.data);
  }

  /** 删除配置（启用项禁删） */
  @Delete('delete/:id')
  @Perms('delete')
  @ApiOperation({ summary: '删除 AI 模型配置' })
  @ApiParam({ name: 'id', description: '配置 ID', type: Number })
  @ApiOkVoid()
  async remove(@Param('id', ParseIntPipe) id: number) {
    const res = await this.aiModelService.remove(id);
    if (!res.ok) return this.fail(res.message);
    return this.ok();
  }

  /** 启用切换（全局互斥） */
  @Put('enable')
  @Perms('enable')
  @ApiOperation({ summary: '启用 AI 模型配置（全局互斥）' })
  @ApiOkVoid()
  async enable(@Body() dto: AiModelIdDto) {
    const res = await this.aiModelService.enable(dto.id);
    if (!res.ok) return this.fail(res.message);
    return this.ok();
  }

  /** 连接测试 */
  @Post('test')
  @Perms('test')
  @ApiOperation({ summary: 'AI 模型连接测试' })
  @ApiResult(AiModelTestVo)
  async test(@Body() dto: AiModelIdDto) {
    const res = await this.aiModelService.test(dto.id);
    if (!res.ok) return this.fail(res.message);
    return this.ok(res.data);
  }
}
