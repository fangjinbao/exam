import { Controller, Post, Get, Put, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, CurrentUser, ApiResult, ApiOkVoid } from '@/common/decorators';
import { BaseController } from '@/common/crud';
import { AppAuthService } from '../services/app-auth.service';
import { AppLoginDto, AppRefreshTokenDto, AppUpdateProfileDto } from '../dto/app-auth.dto';
import { AppLoginResultVo, AppRefreshResultVo, AppProfileVo } from '../vo/app-auth.vo';

/**
 * 考生端认证控制器
 *
 * 面向移动端/考生端（/app 前缀）提供登录、刷新 token、登出与个人信息接口。
 * 该前缀下的鉴权由 AppAuthGuard 负责，与管理端（/admin）的 AuthGuard 相互独立：
 * 两套 token 不可互换，同一个人两端会话互不影响。
 * 标注 @Public 的接口跳过鉴权，其余需携带有效的考生端 token。
 */
@ApiTags('考生端认证')
@Controller('app/auth')
export class AppAuthController extends BaseController {
  constructor(private readonly appAuthService: AppAuthService) {
    super();
  }

  /**
   * 考生端登录
   * 按 userType 区分内部员工与外部考生两类账号体系，成功后签发考生端 token。
   */
  @Public()
  @Post('login')
  @ApiOperation({ summary: '考生端登录（内部员工 / 外部考生）' })
  @ApiResult(AppLoginResultVo)
  async login(@Body() dto: AppLoginDto) {
    const result = await this.appAuthService.login(dto.account, dto.password, dto.userType);
    return this.ok(result);
  }

  /**
   * 刷新 token
   * 凭有效的考生端刷新 token 换取新的访问 token。
   */
  @Public()
  @Post('refreshToken')
  @ApiOperation({ summary: '刷新考生端 token' })
  @ApiResult(AppRefreshResultVo)
  async refreshToken(@Body() dto: AppRefreshTokenDto) {
    const result = await this.appAuthService.refreshToken(dto.refreshToken);
    return this.ok(result);
  }

  /**
   * 退出登录
   * 清除考生端会话缓存，使当前 token 立即失效（不影响管理后台会话）。
   */
  @Post('logout')
  @ApiOperation({ summary: '考生端退出登录' })
  @ApiOkVoid()
  async logout(@CurrentUser() user: any) {
    await this.appAuthService.logout(user.userId, user.userType);
    return this.ok();
  }

  /**
   * 获取个人信息
   * 返回当前登录考生的基础资料，两类用户结构一致，由 userType 区分来源。
   */
  @Get('profile')
  @ApiOperation({ summary: '获取当前登录考生信息' })
  @ApiResult(AppProfileVo)
  async profile(@CurrentUser() user: any) {
    const info = await this.appAuthService.getProfile(user.userId, user.userType);
    if (!info) {
      return this.fail('账号不存在或已被删除', 401);
    }
    return this.ok(info);
  }

  /**
   * 修改个人信息
   * 仅允许修改姓名、联系电话、电子邮箱；用户身份取自 token，不接受前端传入的 id。
   */
  @Put('profile')
  @ApiOperation({ summary: '修改当前登录考生信息' })
  @ApiResult(AppProfileVo)
  async updateProfile(@CurrentUser() user: any, @Body() dto: AppUpdateProfileDto) {
    const info = await this.appAuthService.updateProfile(user.userId, user.userType, dto);
    return this.ok(info);
  }
}
