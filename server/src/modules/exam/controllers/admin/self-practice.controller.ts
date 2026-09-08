import {
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CrudController, CrudControllerFactory } from '@/common/crud';
import { ApiResult, Perms, OperationLog } from '@/common/decorators';
import { Admin } from '@/common/decorators/admin.decorator';
import type { AdminPayload } from '../../services/org-scope.service';
import { QuestionBankAccessService } from '../../services/question-bank-access.service';
import { SelfPracticeService } from '../../services/self-practice.service';
import { UpdateSelfPracticeConfigDto } from '../../dto/self-practice.dto';
import { SelfPracticeBankVo, SelfPracticeConfigVo } from '../../vo/self-practice.vo';

/**
 * 自主练习管理控制器
 * 自主练习以题库为主体：管理员选择开放哪些题库给学员自主选择练习，
 * 并配置开放范围（全员/指定员工）、可练知识点范围、单次题数上限与练习行为。
 * 列表以题库维度呈现「试题数 / 开放人数 / 考核点 / 开放状态」。
 */
@ApiTags('自主练习管理')
@CrudController({
  prefix: 'admin/exam/self-practice',
  api: [],
})
export class SelfPracticeController extends CrudControllerFactory(SelfPracticeBankVo) {
  constructor(
    private readonly selfPracticeService: SelfPracticeService,
    private readonly bankAccess: QuestionBankAccessService,
  ) {
    super(selfPracticeService);
  }

  /**
   * 收敛登录态：AuthGuard 已保证存在，此处仅做类型收窄与兜底。
   * @param admin request.admin 注入值
   * @returns 必有值的登录管理员
   */
  private requireAdmin(admin?: AdminPayload): AdminPayload {
    if (!admin?.userId) throw new UnauthorizedException('登录态缺失');
    return admin;
  }

  /**
   * 可开放题库分页列表（含开放状态）
   * 未配置过开放的题库同样列出，此时开放状态为关闭、各计数为 0。
   */
  @Get('list')
  @Perms('list')
  @ApiOperation({ summary: '自主练习题库分页列表（名称模糊 + 开放状态）' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiQuery({ name: 'keyword', required: false, description: '题库名称（模糊）' })
  @ApiQuery({ name: 'isOpen', required: false, description: '开放状态 true/false，不传为全部' })
  async list(@Query() query: Record<string, any>, @Admin() adminRaw?: AdminPayload) {
    // 查询串里的布尔值是字符串，显式转换，避免 'false' 被当成真值
    const isOpen =
      query.isOpen === undefined || query.isOpen === ''
        ? undefined
        : query.isOpen === 'true' || query.isOpen === true;

    const data = await this.selfPracticeService.pageList(
      { keyword: query.keyword, isOpen },
      query.page ? Number(query.page) : undefined,
      query.pageSize ? Number(query.pageSize) : undefined,
      adminRaw,
    );
    return this.ok(data);
  }

  /**
   * 题库开放配置详情（含开放人员与可练知识点）
   */
  @Get('config/:bankId')
  @Perms('list')
  @ApiOperation({ summary: '查询题库的自主练习配置（未配置时返回默认值）' })
  @ApiParam({ name: 'bankId', description: '题库 ID', type: Number })
  @ApiResult(SelfPracticeConfigVo)
  async getConfig(
    @Param('bankId', ParseIntPipe) bankId: number,
    @Admin() adminRaw?: AdminPayload,
  ) {
    // 配置详情含开放人员名单，按题库可读性收口：列表的 buildVisibleOr 只管展示，
    // 拿着猜到的 bankId 直接打这个接口仍会绕过题库的 visibleScope/shareLevel
    await this.bankAccess.assertCanRead(bankId, this.requireAdmin(adminRaw));
    const data = await this.selfPracticeService.getConfig(bankId);
    if (!data) return this.fail('题库不存在');
    return this.ok(data);
  }

  /**
   * 保存题库开放配置（开放范围 + 练习设置 + 抽题范围）
   */
  @Put('config')
  @Perms('update')
  @ApiOperation({ summary: '保存题库自主练习配置（覆盖式）' })
  @OperationLog({ target: '自主练习', type: '编辑', content: '保存自主练习配置' })
  async saveConfig(@Body() dto: UpdateSelfPracticeConfigDto, @Admin() adminRaw?: AdminPayload) {
    const admin = this.requireAdmin(adminRaw);
    await this.bankAccess.assertCanManage(dto.bankId, admin);
    const err = await this.selfPracticeService.validateConfig(dto);
    if (err) return this.fail(err);
    await this.selfPracticeService.saveConfig(dto, admin.userId);
    return this.ok(null, '保存成功');
  }

  /**
   * 切换题库开放状态（列表页快捷开关）
   */
  @Post('toggle/:bankId')
  @Perms('update')
  @ApiOperation({ summary: '开启/关闭题库的自主练习开放状态' })
  @ApiParam({ name: 'bankId', description: '题库 ID', type: Number })
  @ApiQuery({ name: 'isOpen', required: true, description: '目标状态 true 开启 / false 关闭' })
  @OperationLog({ target: '自主练习', type: '编辑', content: '切换题库开放状态' })
  async toggleOpen(
    @Param('bankId', ParseIntPipe) bankId: number,
    @Query('isOpen') isOpenRaw: string,
    @Admin() adminRaw?: AdminPayload,
  ) {
    const admin = this.requireAdmin(adminRaw);
    await this.bankAccess.assertCanManage(bankId, admin);
    const isOpen = isOpenRaw === 'true' || isOpenRaw === '1';
    const err = await this.selfPracticeService.toggleOpen(bankId, isOpen, admin.userId);
    if (err) return this.fail(err);
    return this.ok(null, isOpen ? '已开启' : '已关闭');
  }

  /**
   * 取消开放（移出自主练习范围，题库本身不受影响）
   */
  @Delete('config/:bankId')
  @Perms('delete')
  @ApiOperation({ summary: '取消题库的自主练习开放（不影响题库本身）' })
  @ApiParam({ name: 'bankId', description: '题库 ID', type: Number })
  @OperationLog({ target: '自主练习', type: '删除', content: '取消自主练习开放' })
  async removeConfig(
    @Param('bankId', ParseIntPipe) bankId: number,
    @Admin() adminRaw?: AdminPayload,
  ) {
    await this.bankAccess.assertCanManage(bankId, this.requireAdmin(adminRaw));
    const err = await this.selfPracticeService.removeConfig(bankId);
    if (err) return this.fail(err);
    return this.ok(null, '已取消开放');
  }

  // 自主练习以题库为主体，开放配置只能通过上面的 config/toggle 入口按 bankId 读写
  // （需校验题库存在、未停用、有正式题目）。基类的通用 CRUD 按自增主键直接操作
  // self_practice_config 表，既绕过校验、语义也对不上（该表主键是 bankId，且无 status 字段），
  // 故全部覆盖屏蔽。不加装饰器 → 路由与权限点均不注册；fail 仅作纵深防御。
  async detail() {
    return this.fail('请通过 config/:bankId 查询题库开放配置');
  }
  async add() {
    return this.fail('请通过 config 接口保存题库开放配置');
  }
  async update() {
    return this.fail('请通过 config 接口保存题库开放配置');
  }
  async updateStatus() {
    return this.fail('开放状态请通过 toggle 接口变更');
  }
  async delete() {
    return this.fail('请通过 config/:bankId 取消题库开放');
  }
  async batchDelete() {
    return this.fail('自主练习不支持批量取消开放');
  }
}
