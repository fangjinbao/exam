import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiOkResponse } from '@nestjs/swagger';
import { Perms } from '@/common/decorators';
import { ExamAnalyticsService } from '../../services/exam-analytics.service';

/**
 * 统计分析控制器
 *
 * 只读聚合接口，服务于管理端首页看板与统计分析模块。
 *
 * 不继承 CrudControllerFactory：这里没有实体的增删改查，
 * 继承过来的 6 个写接口全都要覆写取消注册，反而比直接用 @Controller 更绕。
 *
 * 权限点 exam:analytics:list（前缀 admin/exam/analytics + action list 派生），
 * 由「考试台账」菜单节点承载，不另造 view 之类的动作：
 * PermsSyncService 对 action='list' 跳过建按钮，认定该权限由 type=1 菜单自身承载；
 * 若这里用 view，其分组 exam:analytics 在菜单索引里找不到对应节点
 * （台账菜单的 perms 若为 exam:analytics-ledger:list 则分组不同），
 * 会被判为孤儿权限点只记录不创建——结果是除超管外没有任何角色能被授予，
 * 图表对所有普通角色恒 403。
 *
 * 不复用阅卷的 exam:grading:list：统计看的是全量数据，
 * 与「能否阅卷」是两件事——阅卷员该看自己的卷，不必然该看全公司的分数分布。
 *
 * 首页在无此权限时静默隐藏图表区，不弹错误——它是落地页，
 * 一进来就报错既解决不了问题也没有操作指引。
 */
@ApiTags('统计分析')
@Controller('admin/exam/analytics')
export class ExamAnalyticsController {
  constructor(private readonly analyticsService: ExamAnalyticsService) {}

  @Get('overview')
  @Perms('list')
  @ApiOperation({ summary: '首页概览统计（公司维度、分数分布、考试状态构成）' })
  @ApiQuery({ name: 'companyName', required: false, description: '按公司过滤，不传为全量' })
  @ApiOkResponse({
    schema: {
      properties: {
        code: { type: 'number', example: 200 },
        message: { type: 'string', example: 'success' },
        data: { type: 'object', description: 'AnalyticsOverview' },
      },
    },
  })
  async overview(@Query('companyName') companyName?: string) {
    // 空串按「不筛选」处理：前端下拉清空时会传空串而非省略参数
    const data = await this.analyticsService.getOverview(companyName || undefined);
    return { code: 200, message: 'success', data };
  }

}
