import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ApiResult, ApiArrayResult } from '@/common/decorators';
import { BaseController } from '@/common/crud';
import { AppPracticeService } from '../services/app-practice.service';
import {
  AppPracticeQuestionsQueryDto,
  AppPracticeAnswerDto,
  AppPracticeAiAskDto,
  AppPracticeFinishDto,
  AppFavoriteToggleDto,
  QuestionIdsQueryDto,
} from '../dto/app-practice.dto';
import {
  AppPracticeItemVo,
  AppPracticeQuestionsVo,
  AppPracticeAnswerVo,
  AppPracticeSubmitVo,
  AppPracticeOptionsVo,
  AppPracticeStatsVo,
  AppPracticeAiAskVo,
  AppWrongItemVo,
  AppFavoriteToggleVo,
  AppFavoriteItemVo,
} from '../vo/app-practice.vo';

/**
 * 考生端练习控制器
 *
 * 覆盖三条练习路径：岗位练兵（管理员建好并点名参与人）、自主练习（考生自选
 * 题库或知识点）、错题重练。练习与考试的差异在于逐题即时判分即时反馈，
 * 无阅卷与成绩发布流程。
 *
 * 所有接口都必须登录，练习人身份一律取自 token；岗位练兵的可见范围与
 * 可练状态在服务端校验，不信任前端传参。
 */
@ApiTags('考生端-练习')
// 必须带 app/ 前缀：AppAuthGuard 靠 isAppRoute() 按 /app 判定归属，
// 少了前缀会落到管理端 AuthGuard，考生 token 将无法通过鉴权
@Controller('app/practice')
export class AppPracticeController extends BaseController {
  constructor(private readonly appPracticeService: AppPracticeService) {
    super();
  }

  /** 我的岗位练兵列表 */
  @Get('list')
  @ApiOperation({ summary: '我的岗位练兵列表' })
  @ApiArrayResult(AppPracticeItemVo)
  async list(@CurrentUser() user: any) {
    const data = await this.appPracticeService.getPracticeList(user.userId, user.userType);
    return this.ok(data);
  }

  /** 我的练习概览 */
  @Get('stats')
  @ApiOperation({ summary: '我的练习概览（题库数、已练题数、正确率、进行中）' })
  @ApiResult(AppPracticeStatsVo)
  async stats(@CurrentUser() user: any) {
    const data = await this.appPracticeService.getPracticeStats(user.userId, user.userType);
    return this.ok(data);
  }

  /** 自主练习范围选项 */
  @Get('options')
  @ApiOperation({ summary: '自主练习范围选项（题库）' })
  @ApiResult(AppPracticeOptionsVo)
  async options(@CurrentUser() user: any) {
    const data = await this.appPracticeService.getOptions(user.userId, user.userType);
    return this.ok(data);
  }

  /** 取练习题 */
  @Get('questions')
  @ApiOperation({ summary: '取练习题（岗位练兵 / 自主练习 / 错题重练）' })
  @ApiResult(AppPracticeQuestionsVo)
  async questions(
    @CurrentUser() user: any,
    @Query() query: AppPracticeQuestionsQueryDto,
  ) {
    const data = await this.appPracticeService.getQuestions(
      user.userId,
      user.userType,
      query,
    );
    return this.ok(data);
  }

  /** 提交单题作答 */
  @Post('answer')
  @ApiOperation({ summary: '提交单题作答并即时判分' })
  @ApiResult(AppPracticeAnswerVo)
  async answer(@CurrentUser() user: any, @Body() dto: AppPracticeAnswerDto) {
    const data = await this.appPracticeService.submitAnswer(
      user.userId,
      user.userType,
      dto,
    );
    return this.ok(data);
  }

  /** 结束整份练习 */
  @Post('finish')
  @ApiOperation({ summary: '结束整份练习并返回统计' })
  @ApiResult(AppPracticeSubmitVo)
  async finish(@CurrentUser() user: any, @Body() dto: AppPracticeFinishDto) {
    const data = await this.appPracticeService.finishPractice(
      user.userId,
      user.userType,
      dto.recordId,
    );
    return this.ok(data);
  }

  /** AI 答疑 */
  @Post('ai-ask')
  @ApiOperation({ summary: 'AI 答疑（就某道题提问）' })
  @ApiResult(AppPracticeAiAskVo)
  async aiAsk(@Body() dto: AppPracticeAiAskDto) {
    const data = await this.appPracticeService.aiAsk(dto.questionId, dto.question);
    return this.ok(data);
  }

  /** 错题本列表 */
  @Get('wrong-list')
  @ApiOperation({ summary: '错题本列表' })
  @ApiArrayResult(AppWrongItemVo)
  async wrongList(@CurrentUser() user: any) {
    const data = await this.appPracticeService.getWrongList(user.userId, user.userType);
    return this.ok(data);
  }

  /** 收藏 / 取消收藏题目 */
  @Post('favorite/toggle')
  @ApiOperation({ summary: '收藏 / 取消收藏题目（按当前状态翻转）' })
  @ApiResult(AppFavoriteToggleVo)
  async toggleFavorite(@CurrentUser() user: any, @Body() dto: AppFavoriteToggleDto) {
    const data = await this.appPracticeService.toggleFavorite(
      user.userId,
      user.userType,
      dto.questionId,
    );
    return this.ok(data);
  }

  /** 批量查询收藏态 */
  @Get('favorite/ids')
  @ApiOperation({ summary: '批量查询指定题目的收藏态' })
  async favoriteIds(@CurrentUser() user: any, @Query() query: QuestionIdsQueryDto) {
    const data = await this.appPracticeService.getFavoriteIds(
      user.userId,
      user.userType,
      query.questionIds,
    );
    return this.ok(data);
  }

  /** 我的收藏列表 */
  @Get('favorite/list')
  @ApiOperation({ summary: '我的收藏列表' })
  @ApiArrayResult(AppFavoriteItemVo)
  async favoriteList(@CurrentUser() user: any) {
    const data = await this.appPracticeService.getFavoriteList(user.userId, user.userType);
    return this.ok(data);
  }
}
