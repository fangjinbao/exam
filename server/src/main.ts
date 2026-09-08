import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';

/**
 * 应用启动入口
 *
 * 依次完成：创建 Nest 应用 → 放宽请求体大小限制 → 挂载上传目录静态资源 →
 * 注册全局校验管道 → 配置 CORS → 非生产环境挂载 Swagger 文档 → 启用优雅关闭钩子 → 监听端口。
 */
/** 全应用假定的时区，与 docker/server.Dockerfile、docker-compose.yaml 的 TZ 一致 */
const EXPECTED_TZ = 'Asia/Shanghai';

/**
 * 校验进程时区是否为预期值，不符只告警不阻断启动
 *
 * 为什么必须一致：TransformInterceptor 的 formatDate 用硬编码的 +8 偏移把时间
 * 转成展示字符串，不看进程时区；而服务端有按本地钟点计算的逻辑
 * （如 ExamService.shiftWindowToFuture 用 getHours/setHours 保留考试的开考时刻）。
 * 两者参照系一旦不同，算出来的时间会与页面显示错位——实测把 TZ 设成 UTC 时
 * 复制考试的时间会整整差出一天，且没有任何报错。
 *
 * 只告警不 exit：时区错配会让时间算错，但直接让服务起不来对线上是更大的事故，
 * 该由部署方看到告警后修配置。要改成致命错误的话在这里 throw 即可。
 */
function assertExpectedTimeZone(logger: Logger) {
  const actual = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (actual === EXPECTED_TZ) return;
  logger.error(
    `时区配置异常：当前进程时区为 ${actual}，应为 ${EXPECTED_TZ}。` +
      `展示层按 +8 固定偏移格式化时间，时区不符会导致考试时间与页面显示错位，` +
      `请检查容器的 TZ 环境变量（docker/server.Dockerfile 与 docker-compose.yaml）。`,
  );
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 提高请求体大小限制（默认 100kb 过小）：基础配置 Logo 的 base64、富文本内容等可能超限
  // 注：body 解析早于鉴权，生产环境建议在网关层（Nginx client_max_body_size）再设一道大小限制兜底
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { limit: '10mb', extended: true });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('SERVER_PORT', 9001);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // 不设全局前缀：路由前缀由各 controller 显式声明（admin/* 或 app/*），支持多鉴权体系分层

  // 静态资源：上传文件目录
  const uploadDir = join(process.cwd(), 'uploads');
  mkdirSync(uploadDir, { recursive: true });
  app.useStaticAssets(uploadDir, {
    prefix: '/uploads/',
    setHeaders: (res) => {
      // 防止浏览器 MIME 嗅探导致的存储型 XSS
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const corsOrigins = configService.get<string>('CORS_ORIGINS', '');
  app.enableCors({
    origin: corsOrigins ? corsOrigins.split(',') : (nodeEnv === 'production' ? false : true),
    credentials: true,
  });

  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Exam Admin')
      .setDescription('智能 AI 考试平台后端 API 文档')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  // 启用优雅关闭钩子，确保定时任务等资源正确释放
  app.enableShutdownHooks();

  await app.listen(port);

  // 框架版权横幅
  printBanner();

  const logger = new Logger('Bootstrap');
  assertExpectedTimeZone(logger);
  logger.log(`服务已启动: http://localhost:${port}`);
  if (nodeEnv !== 'production') {
    logger.log(`API 文档: http://localhost:${port}/docs`);
    // 仅当 pnpm dev 后台拉起了 Prisma Studio 时才提示其地址（pnpm start:dev 不会设此标志）
    const studioPort = process.env.PRISMA_STUDIO_PORT;
    if (studioPort) {
      logger.log(`数据库 GUI: http://localhost:${studioPort}`);
    }
  }
}

/**
 * 打印 AgentPM 框架版权横幅
 * 官网：https://www.axuremart.com/
 */
function printBanner(): void {
  const cyan = '\x1b[36m';
  const gray = '\x1b[90m';
  const reset = '\x1b[0m';
  const lines = [
    '',
    `${cyan}    ___                    __  ____  ___${reset}`,
    `${cyan}   /   |  ____ ____  ____  / /_/ __ \\/ |/ /${reset}`,
    `${cyan}  / /| | / __ \`/ _ \\/ __ \\/ __/ /_/ /|   / ${reset}`,
    `${cyan} / ___ |/ /_/ /  __/ / / / /_/ ____/   |  ${reset}`,
    `${cyan}/_/  |_|\\__, /\\___/_/ /_/\\__/_/   /_/|_|  ${reset}`,
    `${cyan}       /____/                             ${reset}`,
    '',
    `${gray}  AgentPM 通用后端 AI 开发框架${reset}`,
    `${gray}  © ${new Date().getFullYear()} AgentPM  ·  官网 https://www.axuremart.com/${reset}`,
    '',
  ];
  // 直接写 stdout，保持横幅整洁（不加 Logger 的时间戳/级别前缀，也不触发 no-console 门禁）
  process.stdout.write(`${lines.join('\n')}\n`);
}

bootstrap();
