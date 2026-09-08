import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ApiResult, ApiArrayResult } from '@/common/decorators';
import { BaseController } from '@/common/crud';
import { AppHomeService } from '../services/app-home.service';
import { AppOverviewVo, AppUpcomingExamVo } from '../vo/app-home.vo';

/**
 * 考生端首页控制器
 *
 * 提供首页所需的统计概览与待考提醒。两个接口都必须登录，
 * 数据范围由 token 中的身份决定，不接受前端传入的用户 id。
 */
@ApiTags('考生端-首页')
// 必须带 app/ 前缀：AppAuthGuard 靠 isAppRoute() 按 /app 判定归属，
// 少了前缀会落到管理端 AuthGuard，考生 token 将无法通过鉴权
@Controller('app/home')
export class AppHomeController extends BaseController {
  constructor(private readonly appHomeService: AppHomeService) {
    super();
  }

  /**
   * 首页数据概览
   * 已考次数、练习题量、证书获得、错题数。
   */
  @Get('overview')
  @ApiOperation({ summary: '首页数据概览' })
  @ApiResult(AppOverviewVo)
  async overview(@CurrentUser() user: any) {
    const data = await this.appHomeService.getOverview(user.userId, user.userType);
    return this.ok(data);
  }

  /**
   * 待考提醒
   * 返回该考生名下未开始与进行中的考试，按开始时间升序。
   */
  @Get('upcoming')
  @ApiOperation({ summary: '首页待考提醒' })
  @ApiArrayResult(AppUpcomingExamVo)
  async upcoming(@CurrentUser() user: any) {
    const data = await this.appHomeService.getUpcomingExams(user.userId, user.userType);
    return this.ok(data);
  }
}
