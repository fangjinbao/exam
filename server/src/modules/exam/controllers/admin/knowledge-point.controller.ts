import { Get, Post, Put, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { CrudController, CrudControllerFactory } from '@/common/crud';
import { ApiArrayResult, ApiResult, ApiOkVoid, Perms, OperationLog } from '@/common/decorators';
import { KnowledgePointService } from '../../services/knowledge-point.service';
import {
  CreateKnowledgePointDto,
  UpdateKnowledgePointDto,
} from '../../dto/knowledge-point.dto';
import { KnowledgePointVo } from '../../vo/knowledge-point.vo';

/**
 * 知识点分类管理控制器
 * 提供知识点树查询、新增、编辑、删除。
 * 树形结构不分页，故不开放基类 list/page，改用自定义 tree 接口；
 * 删除时校验无子节点且未被题目引用。
 */
@ApiTags('知识点分类管理')
@CrudController({
  prefix: 'admin/exam/knowledge-point',
  api: [],
})
export class KnowledgePointController extends CrudControllerFactory(KnowledgePointVo) {
  constructor(private readonly knowledgePointService: KnowledgePointService) {
    super(knowledgePointService);
  }

  /**
   * 获取知识点树
   * 无入参，返回按 orderNum 升序组装的树形数组，供分类管理与题目表单的层级选择使用。
   */
  @Get('tree')
  @Perms('list')
  @ApiOperation({ summary: '获取知识点分类树' })
  @ApiArrayResult(KnowledgePointVo)
  async tree() {
    return this.ok(await this.knowledgePointService.getTree());
  }

  /**
   * 新增知识点分类
   * 指定父级时校验父级存在。
   */
  @Post('add')
  @Perms('add')
  @ApiOperation({ summary: '新增知识点分类' })
  @OperationLog({
    target: '知识点分类',
    type: '新增',
    content: ({ body }) => `新增知识点分类「${body?.name || ''}」`,
  })
  @ApiResult(KnowledgePointVo)
  async add(@Body() dto: CreateKnowledgePointDto) {
    if (dto.parentId && !(await this.knowledgePointService.isParentExists(dto.parentId))) {
      return this.fail('父级知识点不存在');
    }
    const created = await this.knowledgePointService.add(dto);
    return this.ok(created, '新增知识点分类成功');
  }

  /**
   * 更新知识点分类
   * 校验父级存在，且不能将自身设为父级（避免自引用成环）。
   */
  @Put('update')
  @Perms('update')
  @ApiOperation({ summary: '更新知识点分类' })
  @OperationLog({
    target: '知识点分类',
    type: '编辑',
    content: ({ body }) => `编辑知识点分类「${body?.name || ''}」`,
  })
  @ApiOkVoid()
  async update(@Body() dto: UpdateKnowledgePointDto) {
    const { id, ...data } = dto;
    if (data.parentId === id) {
      return this.fail('父级知识点不能是自身');
    }
    if (data.parentId && !(await this.knowledgePointService.isParentExists(data.parentId))) {
      return this.fail('父级知识点不存在');
    }
    await this.knowledgePointService.update(id, data);
    return this.ok(null, '编辑知识点分类成功');
  }

  /**
   * 删除知识点分类
   * 存在子分类或被题目引用时阻止删除。
   */
  @Delete('delete/:id')
  @Perms('delete')
  @ApiOperation({ summary: '按 id 删除知识点分类（有子分类或被题目引用时阻止）' })
  @OperationLog({ target: '知识点分类', type: '删除', content: '删除知识点分类' })
  @ApiParam({ name: 'id', description: '知识点 ID', type: Number })
  @ApiOkVoid()
  async delete(@Param('id', ParseIntPipe) id: number) {
    try {
      await this.knowledgePointService.ensureDeletable(id);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '无法删除');
    }
    await this.knowledgePointService.delete([id]);
    return this.ok(null, '删除知识点分类成功');
  }
}
