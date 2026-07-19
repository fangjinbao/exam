import { Controller, Get, Post, Put, Delete, Body, Query, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { BaseController } from '@/common/crud';
import { ApiPageResult, ApiOkVoid, Perms, OperationLog } from '@/common/decorators';
import { SysDictService } from '../services/sys-dict.service';
import { DictTypeVo, DictItemVo } from '../vo/sys-dict.vo';
import { AddDictItemDto, UpdateDictItemDto } from '../dto/sys-dict.dto';

/**
 * 数据字典控制器（系统管理）
 * 两级结构：字典类型（只读列表，带项数量）→ 字典项（增删改查，唯一性 + 引用保护）。
 */
@ApiTags('系统管理-数据字典')
@Controller('admin/sys/dict')
export class SysDictController extends BaseController {
  constructor(private readonly sysDictService: SysDictService) {
    super();
  }

  /** 字典类型分页列表（带字典项数量） */
  @Get('type/list')
  @Perms('type:list')
  @ApiOperation({ summary: '字典类型分页列表' })
  @ApiQuery({ name: 'keyword', required: false, description: '关键字（模糊匹配类型名称/编码）' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiPageResult(DictTypeVo)
  async typeList(
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const data = await this.sysDictService.typePage(
      keyword,
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
    return this.ok(data);
  }

  /** 指定字典类型下字典项分页列表 */
  @Get('item/list')
  @Perms('item:list')
  @ApiOperation({ summary: '字典项分页列表' })
  @ApiQuery({ name: 'typeId', required: true, description: '字典类型 ID' })
  @ApiQuery({ name: 'keyword', required: false, description: '关键字（模糊匹配字典项名称/值）' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiPageResult(DictItemVo)
  async itemList(
    @Query('typeId') typeId: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const data = await this.sysDictService.itemPage(
      Number(typeId),
      keyword,
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
    return this.ok(data);
  }

  /** 新增字典项 */
  @Post('item/add')
  @Perms('item:add')
  @ApiOperation({ summary: '新增字典项' })
  @OperationLog({ target: '数据字典', type: '新增', content: ({ body }) => `新增字典项「${body?.name || ''}」` })
  @ApiOkVoid()
  async itemAdd(@Body() dto: AddDictItemDto) {
    const res = await this.sysDictService.addItem(dto);
    if (!res.ok) return this.fail(res.message);
    return this.ok(res.data);
  }

  /** 更新字典项 */
  @Put('item/update')
  @Perms('item:update')
  @ApiOperation({ summary: '更新字典项' })
  @OperationLog({ target: '数据字典', type: '编辑', content: ({ body }) => `编辑字典项「${body?.name || ''}」` })
  @ApiOkVoid()
  async itemUpdate(@Body() dto: UpdateDictItemDto) {
    const res = await this.sysDictService.updateItem(dto.id, dto);
    if (!res.ok) return this.fail(res.message);
    return this.ok();
  }

  /** 删除字典项（被引用时阻止） */
  @Delete('item/delete/:id')
  @Perms('item:delete')
  @ApiOperation({ summary: '删除字典项' })
  @OperationLog({ target: '数据字典', type: '删除', content: '删除字典项' })
  @ApiParam({ name: 'id', description: '字典项 ID', type: Number })
  @ApiOkVoid()
  async itemDelete(@Param('id', ParseIntPipe) id: number) {
    const res = await this.sysDictService.deleteItem(id);
    if (!res.ok) return this.fail(res.message);
    return this.ok();
  }
}
