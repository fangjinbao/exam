import { Controller, Get, Put, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BaseController } from '@/common/crud';
import { ApiResult, Perms } from '@/common/decorators';
import { SysConfigService } from '../services/sys-config.service';
import { SaveBaseConfigDto } from '../dto/sys-config.dto';
import { BaseConfigVo } from '../vo/sys-config.vo';

/**
 * 系统基础配置控制器
 * 维护系统名称、Logo、描述、时区、日期格式等全局参数（单例配置，非列表型 CRUD）。
 * 需登录 + 权限点访问；配置存于 base_sys_param 键值对表。
 */
@ApiTags('系统配置-基础配置')
@Controller('admin/sys/base-config')
export class SysConfigController extends BaseController {
  constructor(private readonly sysConfigService: SysConfigService) {
    super();
  }

  /**
   * 读取基础配置
   * 返回当前已保存的系统基础参数，缺失项以默认值兜底。
   */
  @Get()
  @Perms('detail')
  @ApiOperation({ summary: '获取系统基础配置' })
  @ApiResult(BaseConfigVo)
  async getConfig() {
    return this.ok(await this.sysConfigService.getConfig());
  }

  /**
   * 保存基础配置
   * 整体覆盖式保存全部基础参数；系统名称为空时拒绝并提示。
   */
  @Put()
  @Perms('update')
  @ApiOperation({ summary: '保存系统基础配置' })
  @ApiResult(BaseConfigVo)
  async saveConfig(@Body() dto: SaveBaseConfigDto) {
    // 名称去空白后非空校验（DTO @IsNotEmpty 拦截空串，此处兜底纯空格场景）
    if (!dto.sysName?.trim()) {
      return this.fail('请填写系统名称');
    }
    return this.ok(await this.sysConfigService.saveConfig(dto));
  }
}
