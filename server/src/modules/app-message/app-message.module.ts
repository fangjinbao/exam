import { Module } from '@nestjs/common';
import { AppMessageController } from './controllers/app-message.controller';
import { AppMessageService } from './services/app-message.service';

/**
 * 考生端消息模块（app-message）
 *
 * 提供移动端消息列表、详情与未读数。消息不落库，由考试分配、报考审核、
 * 成绩发布三类业务数据实时派生，仅已读状态持久化在 MessageRead。
 * 鉴权由全局 AppAuthGuard 负责，PrismaService 由 CommonModule 全局提供。
 */
@Module({
  controllers: [AppMessageController],
  providers: [AppMessageService],
})
export class AppMessageModule {}
