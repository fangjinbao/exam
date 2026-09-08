import { Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CrudController, CrudControllerFactory } from '@/common/crud';
import {
  ApiResult,
  ApiPageResult,
  ApiArrayResult,
  ApiOkVoid,
  Perms,
  OperationLog,
} from '@/common/decorators';
import { Admin } from '@/common/decorators/admin.decorator';
import type { AdminPayload } from '../../services/org-scope.service';
import { CertProjectService } from '../../services/cert-project.service';
import { CreateCertProjectDto, UpdateCertProjectDto } from '../../dto/cert-project.dto';
import {
  CertProjectVo,
  CertProjectOptionVo,
  DeptOptionVo,
  OrgTreeNodeVo,
} from '../../vo/cert-project.vo';

/**
 * 鉴定项目管理控制器
 *
 * 提供鉴定项目的分页查询、详情、新增、编辑、启停、删除，
 * 以及供报考审核使用的启用项目下拉、名额分配用的单位/部门下拉。
 * 列表带出工种名、级别名与负责人姓名。
 *
 * 新增/编辑校验：名称唯一、级别属于所选工种、负责人存在、时间先后合理、
 * 名额行的部门属于所选单位；删除时校验是否存在报考记录。
 * 名额随项目整组提交，服务端全量替换。
 */
/*
  不传 api：该参数写进元数据后全项目无人读取，声明它不会屏蔽任何继承接口
  （实测过：列出 api 与否，路由注册结果一致）。本控制器要屏蔽的接口一律用
  「覆写同名方法且不加装饰器」的办法，见下方 updateStatus / batchDelete。
*/
@ApiTags('鉴定项目管理')
@CrudController({ prefix: 'admin/exam/cert-project' })
export class CertProjectController extends CrudControllerFactory(CertProjectVo) {
  constructor(private readonly certProjectService: CertProjectService) {
    super(certProjectService);
  }

  /**
   * 鉴定项目分页列表（名称模糊 + 发布状态精确，带工种/级别/负责人名称）
   */
  @Get('list')
  @Perms('list')
  @ApiOperation({ summary: '鉴定项目分页列表（名称模糊 + 发布状态）' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiQuery({ name: 'name', required: false, description: '鉴定名称（模糊）' })
  @ApiQuery({
    name: 'publishStatus',
    required: false,
    description: '发布状态：unpublished 未发布 / published 已发布',
  })
  @ApiPageResult(CertProjectVo)
  async list(@Query() query: Record<string, any>, @Admin() adminRaw?: AdminPayload) {
    // 只认这两个值，其余（含空串）当作不筛选，避免拿脏值去比对而查不到任何行
    const publishStatus =
      query.publishStatus === 'unpublished' || query.publishStatus === 'published'
        ? query.publishStatus
        : undefined;
    const data = await this.certProjectService.pageList(
      { name: query.name, publishStatus },
      query.page ? Number(query.page) : undefined,
      query.pageSize ? Number(query.pageSize) : undefined,
      adminRaw,
    );
    return this.ok(data);
  }

  /**
   * 鉴定项目详情（含名额分配）
   */
  @Get('detail/:id')
  @Perms('detail')
  @ApiOperation({ summary: '按 id 查询鉴定项目详情（含名额分配）' })
  @ApiParam({ name: 'id', description: '鉴定项目 ID', type: Number })
  @ApiResult(CertProjectVo)
  async detail(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    await this.certProjectService.assertOwned(id, adminRaw);
    const data = await this.certProjectService.detail(id);
    if (!data) return this.fail('鉴定项目不存在');
    return this.ok(data);
  }

  /**
   * 鉴定项目阶段进展（供详情页展示：报名/审核/考试各阶段数据）
   *
   * 复用 detail 权限：展示的是同一个项目的信息，只是聚合了各阶段进展，
   * 能看详情就该能看进展，另立一个权限点只会让配权限的人多一步。
   */
  @Get('progress/:id')
  @Perms('detail')
  @ApiOperation({ summary: '查询鉴定项目的阶段进展（报名/审核/考试汇总）' })
  @ApiParam({ name: 'id', description: '鉴定项目 ID', type: Number })
  async progress(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    await this.certProjectService.assertOwned(id, adminRaw);
    const data = await this.certProjectService.progress(id);
    if (!data) return this.fail('鉴定项目不存在');
    return this.ok(data);
  }

  /**
   * 获取鉴定项目下拉选项（复用 list 权限）
   */
  @Get('options')
  @Perms('list')
  @ApiOperation({ summary: '获取鉴定项目下拉选项（供台账页筛选）' })
  @ApiArrayResult(CertProjectOptionVo)
  async options() {
    return this.ok(await this.certProjectService.options());
  }

  /**
   * 单位下拉（公司节点组成的树，供名额分配选单位，复用 list 权限）
   */
  @Get('org-options')
  @Perms('list')
  @ApiOperation({ summary: '获取单位树（集团公司/省公司/分公司）' })
  @ApiArrayResult(OrgTreeNodeVo)
  async orgOptions() {
    return this.ok(await this.certProjectService.orgOptions());
  }

  /**
   * 某单位下的部门下拉（供名额分配选部门，复用 list 权限）
   */
  @Get('dept-options/:orgId')
  @Perms('list')
  @ApiOperation({ summary: '获取指定单位下的部门下拉选项（仅 type=部门）' })
  @ApiParam({ name: 'orgId', description: '单位（公司节点）ID', type: Number })
  @ApiArrayResult(DeptOptionVo)
  async deptOptions(@Param('orgId', ParseIntPipe) orgId: number) {
    return this.ok(await this.certProjectService.deptOptions(orgId));
  }

  /**
   * 新增鉴定项目（连带创建名额行）
   */
  @Post('add')
  @Perms('add')
  @ApiOperation({ summary: '新增鉴定项目（连带名额分配）' })
  @OperationLog({ target: '鉴定项目', type: '新增', content: '新增鉴定项目' })
  @ApiResult(CertProjectVo)
  async add(@Body() dto: CreateCertProjectDto, @Admin() adminRaw?: AdminPayload) {
    const err = await this.validate(dto);
    if (err) return this.fail(err);
    // 记录创建人：列表按此隔离，缺失会导致新建项目连自己都看不到
    const project = await this.certProjectService.add(dto, adminRaw?.userId);
    return this.ok(project, '新增鉴定项目成功');
  }

  /**
   * 更新鉴定项目（名额整组替换）
   */
  @Put('update')
  @Perms('update')
  @ApiOperation({ summary: '更新鉴定项目（名额整组替换）' })
  @OperationLog({ target: '鉴定项目', type: '编辑', content: '编辑鉴定项目' })
  @ApiOkVoid()
  async update(@Body() dto: UpdateCertProjectDto, @Admin() adminRaw?: AdminPayload) {
    await this.certProjectService.assertOwned(dto.id, adminRaw);
    // 已发布即锁定：名额已下发给各单位，改了会让已报的人对不上账
    try {
      await this.certProjectService.assertUnpublished(dto.id);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '无法修改');
    }
    const err = await this.validate(dto, dto.id);
    if (err) return this.fail(err);
    await this.certProjectService.updateProject(dto);
    return this.ok(null, '编辑鉴定项目成功');
  }

  /**
   * 删除鉴定项目
   * 项目下存在报考记录时阻止删除；其名额行由外键级联删除。
   */
  @Delete('delete/:id')
  @Perms('delete')
  @ApiOperation({ summary: '按 id 删除鉴定项目（存在报考记录时阻止）' })
  @OperationLog({ target: '鉴定项目', type: '删除', content: '删除鉴定项目' })
  @ApiParam({ name: 'id', description: '鉴定项目 ID', type: Number })
  @ApiOkVoid()
  async delete(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    await this.certProjectService.assertOwned(id, adminRaw);
    try {
      // 已发布的先撤回再删，避免各单位正报名时项目突然消失
      await this.certProjectService.assertUnpublished(id, '删除');
      await this.certProjectService.ensureDeletable(id);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '无法删除');
    }
    await this.certProjectService.delete([id]);
    return this.ok(null, '删除鉴定项目成功');
  }

  /**
   * 发布鉴定项目（未发布→已发布，各单位从此可报名）
   */
  @Post('publish/:id')
  @Perms('publish')
  @ApiOperation({ summary: '发布鉴定项目（校验已配名额）' })
  @OperationLog({ target: '鉴定项目', type: '编辑', content: '发布鉴定项目' })
  @ApiParam({ name: 'id', description: '鉴定项目 ID', type: Number })
  @ApiOkVoid()
  async publish(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    await this.certProjectService.assertOwned(id, adminRaw);
    try {
      await this.certProjectService.publish(id, adminRaw?.userId);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '发布失败');
    }
    return this.ok(null, '鉴定项目已发布');
  }

  /**
   * 撤回鉴定项目（已发布→未发布，仅无报名记录时可撤回）
   */
  @Post('withdraw/:id')
  @Perms('withdraw')
  @ApiOperation({ summary: '撤回鉴定项目（仅无报名记录时可撤回）' })
  @OperationLog({ target: '鉴定项目', type: '编辑', content: '撤回鉴定项目' })
  @ApiParam({ name: 'id', description: '鉴定项目 ID', type: Number })
  @ApiOkVoid()
  async withdraw(@Param('id', ParseIntPipe) id: number, @Admin() adminRaw?: AdminPayload) {
    await this.certProjectService.assertOwned(id, adminRaw);
    try {
      await this.certProjectService.withdraw(id);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : '撤回失败');
    }
    return this.ok(null, '鉴定项目已撤回');
  }

  // 屏蔽基类继承的启停接口：本模块的生命周期只有「未发布 ↔ 已发布」，
  // 启用/停用与之重叠——要停止各单位报名用撤回，语义更准且能回到可编辑态。
  // 留着这个接口的害处是它能把项目改成 status=0 而界面上再无处恢复。
  // 不加装饰器 → 路由与权限点均不注册；fail 仅作纵深防御。
  async updateStatus() {
    return this.fail('鉴定项目不支持启用/停用，请使用发布/撤回');
  }

  // 屏蔽基类继承的批量删除：鉴定项目删除须逐个走 ensureDeletable（存在报考记录时阻止），
  // 基类 batchDelete 会绕过该保护直删。不加装饰器 → 路由与权限点均不注册；fail 仅作纵深防御。
  // 单条删除已由上方自定义 delete（带 ensureDeletable）覆盖。
  async batchDelete() { return this.fail('鉴定项目不支持批量删除，请逐个删除'); }

  /**
   * 校验鉴定项目入参
   *
   * 名称唯一、级别属于所选工种、负责人存在、三个时间点先后合理、名额行的部门属于所选单位。
   * @returns 校验通过返回 null，否则返回中文错误信息
   */
  private async validate(dto: CreateCertProjectDto, excludeId?: number): Promise<string | null> {
    if (await this.certProjectService.isNameExists(dto.name.trim(), excludeId)) {
      return '鉴定名称已存在，请更换名称';
    }

    const levelErr = await this.certProjectService.checkOccupationLevel(
      dto.occupationId,
      dto.levelId,
    );
    if (levelErr) return levelErr;

    if (!(await this.certProjectService.isManagerSelectable(dto.managerId))) {
      return '所选负责人不存在，请重新选择';
    }

    const dateErr = this.checkDates(dto);
    if (dateErr) return dateErr;

    return this.certProjectService.checkQuotas(dto.quotas);
  }

  /**
   * 校验三个时间点的先后关系
   *
   * 报名截止必须早于鉴定开始（也就必然早于结束，因为已先保证开始不晚于结束）。
   *
   * 三者都精确到时分秒，故按时间戳比，允许同一天：
   * 「10-15 08:00 截止、10-15 09:00 开考」是合法配置。
   *
   * 三个字段由 DTO 的 DATETIME_PATTERN 强制为 'YYYY-MM-DD HH:mm:ss'，
   * 均按本地时区解析，故不存在纯日期串按 UTC 解析导致的 8 小时偏移。
   * 该前提由 DTO 校验保证，勿放宽为只用 @IsDateString。
   */
  private checkDates(dto: CreateCertProjectDto): string | null {
    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);

    if (start.getTime() > end.getTime()) {
      return '鉴定结束时间不能早于开始时间';
    }

    const deadline = new Date(dto.applyDeadline);
    if (deadline.getTime() >= start.getTime()) {
      return '报名截止时间必须早于鉴定开始时间';
    }
    return null;
  }
}
