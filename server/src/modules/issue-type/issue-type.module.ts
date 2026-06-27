import { Module } from '@nestjs/common';
import { IssueTypeController } from './controllers/issue-type.controller';
import { IssueTypeService } from './services/issue-type.service';

/**
 * 问题类型模块（issue-type）
 * 系统配置下的业务基础数据，维护整改工单的问题类型及默认审核人。
 * 由 discoverModules 自动发现，无需在 app.module 手动注册。
 */
@Module({
  controllers: [IssueTypeController],
  providers: [IssueTypeService],
})
export class IssueTypeModule {}
