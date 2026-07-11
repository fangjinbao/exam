import { Module } from '@nestjs/common';
import { ParamConfigController } from './controllers/param-config.controller';
import { AiModelController } from './controllers/ai-model.controller';
import { SysDictController } from './controllers/sys-dict.controller';
import { OperationLogController } from './controllers/operation-log.controller';
import { ExamSiteController } from './controllers/exam-site.controller';
import { ParamConfigService } from './services/param-config.service';
import { AiModelService } from './services/ai-model.service';
import { SysDictService } from './services/sys-dict.service';
import { OperationLogService } from './services/operation-log.service';
import { ExamSiteService } from './services/exam-site.service';

/**
 * 系统管理模块
 *
 * 聚合系统管理下的参数配置、AI 模型配置、数据字典、操作日志、考点管理五个功能，
 * 对外导出各服务供其他模块复用（如写操作日志）。
 */
@Module({
  controllers: [
    ParamConfigController,
    AiModelController,
    SysDictController,
    OperationLogController,
    ExamSiteController,
  ],
  providers: [
    ParamConfigService,
    AiModelService,
    SysDictService,
    OperationLogService,
    ExamSiteService,
  ],
  exports: [ParamConfigService, AiModelService, SysDictService, OperationLogService],
})
export class SystemModule {}
