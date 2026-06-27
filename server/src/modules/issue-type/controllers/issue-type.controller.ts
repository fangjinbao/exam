import { Body, Get, Post, Put, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  CrudController,
  CrudControllerFactory,
  PageOptions,
} from '@/common/crud';
import { ApiResult, Perms } from '@/common/decorators';
import { IssueTypeService } from '../services/issue-type.service';
import { AddIssueTypeDto, UpdateIssueTypeDto } from '../dto/issue-type.dto';
import { IssueTypeVo } from '../vo/issue-type.vo';

/**
 * 问题类型控制器
 * 维护整改工单的问题类型，配置默认审核人与显示顺序，支持启用/停用。
 * 标准 update/update-status/delete 由 CrudControllerBase 提供；
 * 此处覆写 list（按名称模糊 + 追加审核人姓名）、add/update（DTO 校验）。
 * 默认审核人候选数据由前端直接调用人员管理用户列表接口提供，本模块不再单独暴露。
 */
@ApiTags('系统配置-问题类型')
@CrudController({
  prefix: 'admin/sys/issue-type',
  // 注：list/add/update 已在本类覆写（list 加 name 模糊+审核人 enrich，add/update 加 DTO 校验）；
  // update-status/delete 沿用 CrudControllerBase 基类实现。api 仅作元数据声明，不参与路由过滤。
  api: ['add', 'update', 'delete', 'list'],
})
export class IssueTypeController extends CrudControllerFactory(IssueTypeVo) {
  constructor(private readonly issueTypeService: IssueTypeService) {
    super(issueTypeService);
  }

  /**
   * 分页查询问题类型
   * 按类型名称模糊筛选，列表追加默认审核人姓名（auditorName）。
   */
  @Get('list')
  @Perms('list')
  @ApiOperation({ summary: '问题类型分页查询（按名称模糊）' })
  @ApiQuery({ name: 'name', required: false, description: '类型名称（模糊匹配）' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  async list(@Query() query: PageOptions & Record<string, any>) {
    const where: Record<string, any> = {};
    // 类型名称模糊筛选（前端传 name）；截断超长输入，避免无谓的大字符串查询
    if (query.name && typeof query.name === 'string') {
      where.name = { contains: query.name.slice(0, 50) };
    }
    const options: PageOptions = {
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
      // 默认按排序号升序，与"数字越小越靠前"的业务规则一致
      order: query.order || 'orderNum',
      sort: query.sort === 'desc' ? 'desc' : 'asc',
    };
    return this.ok(await this.issueTypeService.pageWithAuditor(options, where));
  }

  /**
   * 新增问题类型
   * DTO 校验名称必填 ≤50 字；额外字段经全局 whitelist 剥离，避免脏字段入库。
   */
  @Post('add')
  @Perms('add')
  @ApiOperation({ summary: '新增问题类型' })
  @ApiResult(IssueTypeVo)
  async add(@Body() dto: AddIssueTypeDto) {
    return this.ok(await this.issueTypeService.add(dto));
  }

  /**
   * 更新问题类型
   * DTO 校验须含 id 与合法字段；按 id 更新其余字段。
   */
  @Put('update')
  @Perms('update')
  @ApiOperation({ summary: '更新问题类型' })
  @ApiResult(IssueTypeVo)
  async update(@Body() dto: UpdateIssueTypeDto) {
    const { id, ...data } = dto;
    return this.ok(await this.issueTypeService.update(id, data));
  }
}
