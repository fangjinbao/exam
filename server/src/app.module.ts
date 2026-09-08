import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CommonModule } from './common/common.module';
import { discoverModules } from './common/module-loader';
import { AllExceptionsFilter } from './common/filters/all-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { OperationLogInterceptor } from './common/interceptors/operation-log.interceptor';
import { AuthGuard } from './common/guards/auth.guard';
import { AppAuthGuard } from './common/guards/app-auth.guard';
import { PermsGuard } from './common/guards/perms.guard';

/**
 * 应用根模块
 *
 * 聚合全局配置（ConfigModule）、定时任务（ScheduleModule）、公共模块（CommonModule），
 * 并自动发现 src/modules 下的全部业务模块。
 * 全局注册：异常过滤器、响应转换拦截器、操作日志拦截器、鉴权守卫、权限守卫。
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
    }),
    ScheduleModule.forRoot(),
    CommonModule,
    // 自动发现 src/modules 下的业务模块（含 AI 生成的模块），无需手动注册
    ...(discoverModules() as any[]),
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_INTERCEPTOR, useClass: OperationLogInterceptor },
    // 鉴权守卫按注册顺序执行：AuthGuard 管 /admin、AppAuthGuard 管 /app，
    // 两者对不属于自己的前缀直接放行，PermsGuard 最后做权限点校验
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: AppAuthGuard },
    { provide: APP_GUARD, useClass: PermsGuard },
  ],
})
export class AppModule {}
