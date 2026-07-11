import { Post, Put, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { CrudController, CrudControllerFactory } from '@/common/crud';
import { ApiResult, ApiOkVoid, Perms } from '@/common/decorators';
import { ExamSiteService } from '../services/exam-site.service';
import { CreateExamSiteDto, UpdateExamSiteDto } from '../dto/exam-site.dto';
import { ExamSiteVo } from '../vo/exam-site.vo';

/**
 * 考点管理控制器（系统管理）
 * 提供考点的分页查询、新增、编辑、启停与删除。
 * 列表支持按考点名称模糊筛选、状态精确筛选；
 * 新增/编辑校验名称唯一性，删除时校验是否被考试引用。
 * list 与 update-status 复用基类默认实现。
 */
@ApiTags('系统管理-考点管理')
@CrudController({
  prefix: 'admin/sys/exam-site',
  api: ['update-status'],
  pageQueryOp: {
    keyWordLikeFields: ['name'],
    fieldEq: ['status'],
  },
})
export class ExamSiteController extends CrudControllerFactory(ExamSiteVo) {
  constructor(private readonly examSiteService: ExamSiteService) {
    super(examSiteService);
  }

  /**
   * 新增考点
   * 校验考点名称唯一后创建。
   */
  @Post('add')
  @Perms('add')
  @ApiOperation({ summary: '新增考点（校验名称唯一）' })
  @ApiResult(ExamSiteVo)
  async add(@Body() dto: CreateExamSiteDto) {
    if (await this.examSiteService.isNameExists(dto.name)) {
      return this.fail(`考点名称【${dto.name}】已存在，请更换`);
    }
    const site = await this.examSiteService.add(dto);
    return this.ok(site, '新增考点成功');
  }

  /**
   * 更新考点
   * 校验名称唯一（排除自身）后更新。
   */
  @Put('update')
  @Perms('update')
  @ApiOperation({ summary: '更新考点（校验名称唯一）' })
  @ApiOkVoid()
  async update(@Body() dto: UpdateExamSiteDto) {
    const { id, ...data } = dto;
    if (await this.examSiteService.isNameExists(dto.name, id)) {
      return this.fail(`考点名称【${dto.name}】已存在，请更换`);
    }
    await this.examSiteService.update(id, data);
    return this.ok(null, '编辑考点成功');
  }

  /**
   * 删除考点
   * 被考试引用时阻止删除（当前考试模块未落地，预留校验钩子）。
   */
  @Delete('delete/:id')
  @Perms('delete')
  @ApiOperation({ summary: '按 id 删除考点（被考试引用时阻止）' })
  @ApiParam({ name: 'id', description: '考点 ID', type: Number })
  @ApiOkVoid()
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.examSiteService.ensureDeletable(id);
    await this.examSiteService.delete([id]);
    return this.ok(null, '删除考点成功');
  }
}
