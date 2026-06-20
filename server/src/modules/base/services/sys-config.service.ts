import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { BaseService } from '@/common/crud';
import { BaseConfigVo } from '../vo/sys-config.vo';
import { SaveBaseConfigDto } from '../dto/sys-config.dto';

/** 基础配置参数键前缀，与其他系统参数隔离 */
const KEY_PREFIX = 'base.config.';

/** 基础配置字段 → 参数名（用于 upsert 时写入可读的 name） */
const CONFIG_FIELDS: { field: keyof BaseConfigVo; name: string }[] = [
  { field: 'sysName', name: '系统名称' },
  { field: 'sysLogo', name: '系统Logo' },
  { field: 'sysDesc', name: '系统描述' },
  { field: 'timezone', name: '默认时区' },
  { field: 'dateFormat', name: '日期格式' },
];

/** 缺失键的兜底默认值，与前端默认项保持一致，保证 GET 不返回空 */
const DEFAULTS: BaseConfigVo = {
  sysName: '',
  sysLogo: '',
  sysDesc: '',
  timezone: '(UTC+08:00) 北京',
  dateFormat: 'YYYY-MM-DD',
};

/**
 * 系统基础配置服务
 * 基于 base_sys_param 键值对表存取基础配置：每个配置项一行，键名加 base.config. 前缀。
 */
@Injectable()
export class SysConfigService extends BaseService {
  constructor(protected prisma: PrismaService) {
    super(prisma, 'sysParam');
  }

  /**
   * 读取基础配置
   * 批量查出 base.config.* 系列参数，组装为扁平对象；缺失的键用默认值兜底。
   * @returns 基础配置对象
   */
  async getConfig(): Promise<BaseConfigVo> {
    const keys = CONFIG_FIELDS.map((c) => `${KEY_PREFIX}${c.field}`);
    const rows = await this.prisma.sysParam.findMany({
      where: { keyName: { in: keys } },
      select: { keyName: true, data: true },
    });

    // 已存数据按字段名建索引
    const stored: Record<string, string> = {};
    for (const row of rows) {
      const field = row.keyName.slice(KEY_PREFIX.length);
      stored[field] = row.data ?? '';
    }

    // 以默认值为底，覆盖已存值
    const result = { ...DEFAULTS };
    for (const { field } of CONFIG_FIELDS) {
      if (stored[field] !== undefined) {
        result[field] = stored[field];
      }
    }
    return result;
  }

  /**
   * 保存基础配置（整体覆盖）
   * 在同一事务内对每个配置项按键 upsert，保证一组配置原子写入。
   * @param dto 待保存的完整配置
   * @returns 保存后的配置对象
   */
  async saveConfig(dto: SaveBaseConfigDto): Promise<BaseConfigVo> {
    const upserts = CONFIG_FIELDS.map(({ field, name }) => {
      const keyName = `${KEY_PREFIX}${field}`;
      const value = dto[field] ?? '';
      return this.prisma.sysParam.upsert({
        where: { keyName },
        update: { data: value },
        create: { keyName, name, data: value },
      });
    });

    await this.prisma.$transaction(upserts);
    return this.getConfig();
  }
}
