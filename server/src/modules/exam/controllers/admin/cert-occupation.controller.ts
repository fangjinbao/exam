import { Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CrudController, BaseController } from '@/common/crud';
import { ApiResult, ApiArrayResult, ApiOkVoid, Perms, OperationLog } from '@/common/decorators';
import { CertOccupationService } from '../../services/cert-occupation.service';
import {
  CreateCertOccupationDto,
  UpdateCertOccupationDto,
  CreateCertLevelDto,
  UpdateCertLevelDto,
} from '../../dto/cert-occupation.dto';
import { CertOccupationVo } from '../../vo/cert-occupation.vo';

/**
 * 鉴定工种管理控制器（技能鉴定）
 *
 * 工种与其鉴定级别是一体的编辑单元：级别不开独立的增删改接口，
 * 由工种的 add/update 整组提交（服务端全量替换）。
 *
 * 继承 BaseController（只取 ok/fail 的统一响应）而非 CrudControllerFactory：
 * 本控制器的接口全部自己实现——列表是树形而非分页，add/update 要连带处理级别，
 * 一个默认接口都用不上。而 CRUD 工厂的构造函数要求传入 BaseService，
 * 为一个永不被调用的依赖去继承 BaseService 或强转类型都是白绕。
 * @CrudController 仍然保留：perms-sync 从它的 prefix 推导权限点前缀
 * （admin/exam/cert-occupation → exam:cert-occupation），换成 @Controller 会漏登记按钮。
 */
@ApiTags('技能鉴定-鉴定工种管理')
@CrudController({
  prefix: 'admin/exam/cert-occupation',
  api: [],
})
export class CertOccupationController extends BaseController {
  constructor(private readonly certOccupationService: CertOccupationService) {
    super();
  }

  /**
   * 工种树（工种为父行，级别为 children）
   *
   * 不分页：工种是基础数据、量级在几十条，且树形表格需一次拿全才能正确展开。
   */
  @Get('tree')
  @Perms('list')
  @ApiOperation({ summary: '鉴定工种树（含各工种下的级别）' })
  @ApiQuery({ name: 'keyword', required: false, description: '工种名称/编号模糊筛选' })
  @ApiQuery({ name: 'status', required: false, description: '状态 1=启用 0=停用' })
  @ApiArrayResult(CertOccupationVo)
  async tree(@Query('keyword') keyword?: string, @Query('status') status?: string) {
    // status 从 query 来是字符串，空串按「不筛选」处理，否则 Number('') === 0 会被当成筛停用
    const statusNum = status === undefined || status === '' ? undefined : Number(status);
    const tree = await this.certOccupationService.getTree(keyword?.trim() || undefined, statusNum);
    return this.ok(tree);
  }

  /**
   * 工种详情（含级别），供编辑回填
   */
  @Get('detail/:id')
  @Perms('detail')
  @ApiOperation({ summary: '鉴定工种详情（含级别）' })
  @ApiParam({ name: 'id', description: '工种 ID' })
  @ApiResult(CertOccupationVo)
  async detail(@Param('id', ParseIntPipe) id: number) {
    const found = await this.certOccupationService.findById(id);
    if (!found) return this.fail('该鉴定工种不存在或已被删除');
    return this.ok(found);
  }

  /**
   * 新增工种（连带创建级别）
   */
  @Post('add')
  @Perms('add')
  @ApiOperation({ summary: '新增鉴定工种（连带其级别）' })
  @OperationLog({ target: '鉴定工种', type: '新增', content: '新增鉴定工种' })
  @ApiResult(CertOccupationVo)
  async add(@Body() dto: CreateCertOccupationDto) {
    const err = await this.validate(dto);
    if (err) return this.fail(err);
    const created = await this.certOccupationService.add(dto);
    return this.ok(created, '新增鉴定工种成功');
  }

  /**
   * 编辑工种（级别整组替换）
   */
  @Put('update')
  @Perms('update')
  @ApiOperation({ summary: '编辑鉴定工种（级别整组替换）' })
  @OperationLog({ target: '鉴定工种', type: '编辑', content: '编辑鉴定工种' })
  @ApiOkVoid()
  async update(@Body() dto: UpdateCertOccupationDto) {
    const found = await this.certOccupationService.findById(dto.id);
    if (!found) return this.fail('该鉴定工种不存在或已被删除');
    const err = await this.validate(dto, dto.id);
    if (err) return this.fail(err);
    await this.certOccupationService.update(dto);
    return this.ok(null, '编辑鉴定工种成功');
  }

  /**
   * 启用/停用工种
   */
  @Put('update-status')
  @Perms('update-status')
  @ApiOperation({ summary: '启用/停用鉴定工种' })
  @OperationLog({ target: '鉴定工种', type: '改状态', content: '启停鉴定工种' })
  @ApiOkVoid()
  async updateStatus(@Body() body: { id: number; status: number }) {
    const found = await this.certOccupationService.findById(body.id);
    if (!found) return this.fail('该鉴定工种不存在或已被删除');
    await this.certOccupationService.updateStatus(body.id, body.status);
    return this.ok(null, body.status === 1 ? '已启用' : '已停用');
  }

  /**
   * 删除工种（其级别随之删除）
   */
  @Delete('delete/:id')
  @Perms('delete')
  @ApiOperation({ summary: '删除鉴定工种（连带删除其级别）' })
  @ApiParam({ name: 'id', description: '工种 ID' })
  @OperationLog({ target: '鉴定工种', type: '删除', content: '删除鉴定工种' })
  @ApiOkVoid()
  async delete(@Param('id', ParseIntPipe) id: number) {
    const found = await this.certOccupationService.findById(id);
    if (!found) return this.fail('该鉴定工种不存在或已被删除');
    await this.certOccupationService.delete(id);
    return this.ok(null, '删除成功');
  }

  /**
   * 批量删除工种
   */
  @Post('batch-delete')
  @Perms('batch-delete')
  @ApiOperation({ summary: '批量删除鉴定工种（body: {ids: number[]}）' })
  @OperationLog({ target: '鉴定工种', type: '批量删除', content: '批量删除鉴定工种' })
  @ApiOkVoid()
  async batchDelete(@Body() body: { ids: number[] }) {
    if (!body?.ids?.length) return this.fail('请选择要删除的鉴定工种');
    const res = await this.certOccupationService.batchDelete(body.ids);
    return this.ok(null, `已删除 ${res.count} 个鉴定工种`);
  }

  /**
   * 单独新增一个级别（给已有工种补一级）
   *
   * 权限点复用工种的 update 而不新开一个：级别是工种的组成部分，
   * 能编辑工种就该能改它的分级，再拆一个权限点只会让配置更碎。
   */
  @Post('level/add')
  @Perms('update')
  @ApiOperation({ summary: '新增鉴定级别（挂到指定工种下）' })
  @OperationLog({ target: '鉴定级别', type: '新增', content: '新增鉴定级别' })
  @ApiOkVoid()
  async addLevel(@Body() dto: CreateCertLevelDto) {
    const occupation = await this.certOccupationService.findById(dto.occupationId);
    if (!occupation) return this.fail('所属鉴定工种不存在或已被删除');

    const name = dto.name.trim();
    if (await this.certOccupationService.isLevelNameExists(dto.occupationId, name)) {
      return this.fail(`级别名称【${name}】已存在，同一工种内级别不能同名`);
    }
    await this.certOccupationService.addLevel(dto);
    return this.ok(null, '新增级别成功');
  }

  /**
   * 单独编辑一个级别
   *
   * 走单条接口而非工种的整组替换：整组替换会把未提交的其他级别当作已删除，
   * 只改一级时用它等于要求前端每次都把全部级别一并回传，
   * 中间若有并发改动就会把别人刚加的级别抹掉。
   */
  @Put('level/update')
  @Perms('update')
  @ApiOperation({ summary: '编辑鉴定级别（不改归属工种）' })
  @OperationLog({ target: '鉴定级别', type: '编辑', content: '编辑鉴定级别' })
  @ApiOkVoid()
  async updateLevel(@Body() dto: UpdateCertLevelDto) {
    const level = await this.certOccupationService.findLevelById(dto.id);
    if (!level) return this.fail('该鉴定级别不存在或已被删除');

    const name = dto.name.trim();
    // 同名校验限定在该级别所属的工种内，且排除自身
    if (
      await this.certOccupationService.isLevelNameExists(level.occupationId, name, dto.id)
    ) {
      return this.fail(`级别名称【${name}】已存在，同一工种内级别不能同名`);
    }
    await this.certOccupationService.updateLevel(dto);
    return this.ok(null, '编辑级别成功');
  }

  /**
   * 单独删除一个级别
   *
   * 权限点复用工种的 delete，理由同 level/add。
   */
  @Delete('level/delete/:id')
  @Perms('delete')
  @ApiOperation({ summary: '删除鉴定级别' })
  @ApiParam({ name: 'id', description: '级别 ID' })
  @OperationLog({ target: '鉴定级别', type: '删除', content: '删除鉴定级别' })
  @ApiOkVoid()
  async deleteLevel(@Param('id', ParseIntPipe) id: number) {
    const level = await this.certOccupationService.findLevelById(id);
    if (!level) return this.fail('该鉴定级别不存在或已被删除');
    await this.certOccupationService.deleteLevel(id);
    return this.ok(null, '删除成功');
  }

  /**
   * 新增/编辑共用的校验
   *
   * 工种名称与编号唯一，同一工种内级别名称不重复。
   * @param dto 提交的工种数据
   * @param excludeId 编辑场景排除自身
   * @returns 校验不通过返回提示语，通过返回 null
   */
  private async validate(
    dto: CreateCertOccupationDto,
    excludeId?: number,
  ): Promise<string | null> {
    const name = dto.name.trim();
    if (await this.certOccupationService.isNameExists(name, excludeId)) {
      return `工种名称【${name}】已存在，请更换`;
    }
    const code = dto.code?.trim();
    if (code && (await this.certOccupationService.isCodeExists(code, excludeId))) {
      return `工种编号【${code}】已存在，请更换`;
    }
    const dupLevel = this.certOccupationService.findDuplicateLevelName(dto.levels);
    if (dupLevel) return `级别名称【${dupLevel}】重复，同一工种内级别不能同名`;
    return null;
  }
}
