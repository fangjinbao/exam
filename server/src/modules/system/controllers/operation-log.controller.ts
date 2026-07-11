import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BaseController } from '@/common/crud';
import { ApiPageResult, Perms } from '@/common/decorators';
import { OperationLogService } from '../services/operation-log.service';
import { OperationLogVo } from '../vo/operation-log.vo';

/**
 * 操作日志控制器（系统管理）
 * 仅提供分页查询，支持按操作人模糊、操作类型、操作时间范围筛选。
 */
@ApiTags('系统管理-操作日志')
@Controller('admin/sys/operation-log')
export class OperationLogController extends BaseController {
  constructor(private readonly operationLogService: OperationLogService) {
    super();
  }

  /** 操作日志分页列表 */
  @Get('list')
  @Perms('list')
  @ApiOperation({ summary: '操作日志分页列表' })
  @ApiQuery({ name: 'operator', required: false, description: '操作人（模糊）' })
  @ApiQuery({ name: 'type', required: false, description: '操作类型' })
  @ApiQuery({ name: 'startTime', required: false, description: '起始日期 YYYY-MM-DD' })
  @ApiQuery({ name: 'endTime', required: false, description: '结束日期 YYYY-MM-DD' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiPageResult(OperationLogVo)
  async list(
    @Query('operator') operator?: string,
    @Query('type') type?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const data = await this.operationLogService.pagelist({
      operator,
      type,
      startTime,
      endTime,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
    return this.ok(data);
  }
}
