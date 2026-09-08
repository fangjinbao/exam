import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ApiResult, ApiArrayResult } from '@/common/decorators';
import { BaseController } from '@/common/crud';
import { AppMessageService } from '../services/app-message.service';
import {
  AppMessageDetailVo,
  AppMessageItemVo,
  AppMessageUnreadCountVo,
} from '../vo/app-message.vo';

/**
 * 考生端消息控制器
 *
 * 三个接口都必须登录，消息范围由 token 中的身份决定，不接受前端传入用户 id。
 */
@ApiTags('考生端-消息')
// 必须带 app/ 前缀：AppAuthGuard 靠 isAppRoute() 按 /app 判定归属，
// 少了前缀会落到管理端 AuthGuard，考生 token 将无法通过鉴权
@Controller('app/message')
export class AppMessageController extends BaseController {
  constructor(private readonly appMessageService: AppMessageService) {
    super();
  }

  /**
   * 未读消息数
   * 供首页铃铛角标使用，比列表接口更轻。
   */
  @Get('unread-count')
  @ApiOperation({ summary: '未读消息数' })
  @ApiResult(AppMessageUnreadCountVo)
  async unreadCount(@CurrentUser() user: any) {
    const count = await this.appMessageService.getUnreadCount(user.userId, user.userType);
    return this.ok({ count });
  }

  /**
   * 消息列表
   * 按时间倒序，含已读状态。
   */
  @Get('list')
  @ApiOperation({ summary: '消息列表' })
  @ApiArrayResult(AppMessageItemVo)
  async list(@CurrentUser() user: any) {
    const data = await this.appMessageService.getList(user.userId, user.userType);
    return this.ok(data);
  }

  /**
   * 消息详情
   * 读取后自动标记该条为已读。
   */
  @Get('detail')
  @ApiOperation({ summary: '消息详情（读取后标记已读）' })
  @ApiQuery({ name: 'id', description: '消息标识，形如 exam_notice-12', type: String })
  @ApiResult(AppMessageDetailVo)
  async detail(@CurrentUser() user: any, @Query('id') id: string) {
    const data = await this.appMessageService.getDetail(user.userId, user.userType, id);
    return this.ok(data);
  }
}
