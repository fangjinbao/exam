import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ApiResult, ApiArrayResult } from '@/common/decorators';
import { BaseController } from '@/common/crud';
import { AppExamService } from '../services/app-exam.service';
import {
  AppExamIdQueryDto,
  AppExamPaperQueryDto,
  AppSaveAnswerDto,
  AppSubmitExamDto,
  AppSwitchAlarmDto,
} from '../dto/app-exam.dto';
import {
  AppExamItemVo,
  AppExamDetailVo,
  AppExamPaperVo,
  AppSaveAnswerVo,
  AppSubmitExamVo,
  AppExamResultVo,
  AppSwitchAlarmVo,
} from '../vo/app-exam.vo';

/**
 * 考生端考试控制器
 *
 * 覆盖考试全流程：列表 → 详情 → 人脸核验 → 取卷 → 自动保存 → 交卷，
 * 外加考中防作弊上报（切屏告警、定时抓拍）。
 *
 * 所有接口都必须登录，且操作范围限定为「分配给当前考生的考试」——
 * 考生身份一律取自 token，不接受前端传入的用户 id。
 */
@ApiTags('考生端-考试')
// 必须带 app/ 前缀：AppAuthGuard 靠 isAppRoute() 按 /app 判定归属，
// 少了前缀会落到管理端 AuthGuard，考生 token 将无法通过鉴权
@Controller('app/exam')
export class AppExamController extends BaseController {
  constructor(private readonly appExamService: AppExamService) {
    super();
  }

  /** 我的考试列表 */
  @Get('list')
  @ApiOperation({ summary: '我的考试列表' })
  @ApiArrayResult(AppExamItemVo)
  async list(@CurrentUser() user: any) {
    const data = await this.appExamService.getExamList(user.userId, user.userType);
    return this.ok(data);
  }

  /** 考试详情 */
  @Get('detail')
  @ApiOperation({ summary: '考试详情' })
  @ApiResult(AppExamDetailVo)
  async detail(@CurrentUser() user: any, @Query() query: AppExamIdQueryDto) {
    const data = await this.appExamService.getExamDetail(
      query.id,
      user.userId,
      user.userType,
    );
    return this.ok(data);
  }

  /**
   * 取卷（进入答题页）
   * 首次取卷创建答卷并开始计时，刷新或断线重连返回同一份答卷与已答记录。
   */
  @Get('paper')
  @ApiOperation({ summary: '取得试卷与作答进度' })
  @ApiResult(AppExamPaperVo)
  async paper(@CurrentUser() user: any, @Query() query: AppExamPaperQueryDto) {
    const data = await this.appExamService.getExamPaper(
      query.examId,
      user.userId,
      user.userType,
    );
    return this.ok(data);
  }

  /** 答案自动保存 */
  @Post('save-answer')
  @ApiOperation({ summary: '保存单题作答' })
  @ApiResult(AppSaveAnswerVo)
  async saveAnswer(@CurrentUser() user: any, @Body() dto: AppSaveAnswerDto) {
    const data = await this.appExamService.saveAnswer(
      dto.examId,
      dto.questionId,
      dto.answer ?? '',
      user.userId,
      user.userType,
    );
    return this.ok(data);
  }

  /** 交卷 */
  @Post('submit')
  @ApiOperation({ summary: '交卷并自动判分' })
  @ApiResult(AppSubmitExamVo)
  async submit(@CurrentUser() user: any, @Body() dto: AppSubmitExamDto) {
    const data = await this.appExamService.submitExam(
      dto.examId,
      user.userId,
      user.userType,
    );
    return this.ok(data);
  }

  /** 交卷结果（结果页） */
  @Get('result')
  @ApiOperation({ summary: '查交卷结果与成绩' })
  @ApiResult(AppExamResultVo)
  async result(@CurrentUser() user: any, @Query() query: AppExamPaperQueryDto) {
    const data = await this.appExamService.getExamResult(
      query.examId,
      user.userId,
      user.userType,
    );
    return this.ok(data);
  }

  /** 切屏告警上报 */
  @Post('switch-alarm')
  @ApiOperation({ summary: '上报切屏告警' })
  @ApiResult(AppSwitchAlarmVo)
  async switchAlarm(@CurrentUser() user: any, @Body() dto: AppSwitchAlarmDto) {
    const data = await this.appExamService.reportSwitchAlarm(
      dto.examId,
      user.userId,
      user.userType,
    );
    return this.ok(data);
  }

}
