import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ApiResult, ApiArrayResult } from '@/common/decorators';
import { BaseController } from '@/common/crud';
import { AppProfileService } from '../services/app-profile.service';
import {
  AppScoreDetailQueryDto,
  AppCertificateQueryDto,
  AppCertificateDownloadDto,
} from '../dto/app-profile.dto';
import {
  AppScoreItemVo,
  AppScoreDetailVo,
  AppCertificateItemVo,
  AppCertificateDetailVo,
  AppCertificateDownloadVo,
} from '../vo/app-profile.vo';

/**
 * 考生端个人中心控制器
 *
 * 提供成绩与证书查询。数据范围一律由 token 中的身份决定，
 * 不接受前端传入的用户 id。
 */
@ApiTags('考生端-个人中心')
// 必须带 app/ 前缀：AppAuthGuard 靠 isAppRoute() 按 /app 判定归属，
// 少了前缀会落到管理端 AuthGuard，考生 token 将无法通过鉴权
@Controller('app/profile')
export class AppProfileController extends BaseController {
  constructor(private readonly appProfileService: AppProfileService) {
    super();
  }

  /** 我的成绩列表（仅已发布成绩） */
  @Get('score-list')
  @ApiOperation({ summary: '我的成绩列表' })
  @ApiArrayResult(AppScoreItemVo)
  async scoreList(@CurrentUser() user: any) {
    const data = await this.appProfileService.getScoreList(user.userId, user.userType);
    return this.ok(data);
  }

  /** 成绩详情（逐题回顾，含标准答案与解析） */
  @Get('score-detail')
  @ApiOperation({ summary: '成绩详情' })
  @ApiResult(AppScoreDetailVo)
  async scoreDetail(@CurrentUser() user: any, @Query() query: AppScoreDetailQueryDto) {
    const data = await this.appProfileService.getScoreDetail(
      query.sheetId,
      user.userId,
      user.userType,
    );
    return this.ok(data);
  }

  /** 我的证书列表 */
  @Get('certificate-list')
  @ApiOperation({ summary: '我的证书列表' })
  @ApiArrayResult(AppCertificateItemVo)
  async certificateList(@CurrentUser() user: any) {
    const data = await this.appProfileService.getCertificateList(
      user.userId,
      user.userType,
    );
    return this.ok(data);
  }

  /** 证书详情 */
  @Get('certificate-detail')
  @ApiOperation({ summary: '证书详情' })
  @ApiResult(AppCertificateDetailVo)
  async certificateDetail(
    @CurrentUser() user: any,
    @Query() query: AppCertificateQueryDto,
  ) {
    const data = await this.appProfileService.getCertificateDetail(
      query.id,
      user.userId,
      user.userType,
    );
    return this.ok(data);
  }

  /** 证书下载 */
  @Post('certificate-download')
  @ApiOperation({ summary: '下载证书' })
  @ApiResult(AppCertificateDownloadVo)
  async certificateDownload(
    @CurrentUser() user: any,
    @Body() dto: AppCertificateDownloadDto,
  ) {
    const data = await this.appProfileService.downloadCertificate(
      dto.id,
      user.userId,
      user.userType,
    );
    return this.ok(data);
  }
}
