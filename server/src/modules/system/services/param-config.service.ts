import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { BaseService, PageOptions } from '@/common/crud';

/** 库字段 → 前端 VO 字段映射（minValue/maxValue → min/max） */
function toVo(row: any) {
  if (!row) return row;
  const { minValue, maxValue, tenantId, createTime, ...rest } = row;
  return { ...rest, min: minValue ?? null, max: maxValue ?? null };
}

/**
 * 参数配置服务
 * 基于 SysParamConfig 表，提供分页查询与按范围校验的值更新。
 */
@Injectable()
export class ParamConfigService extends BaseService {
  constructor(protected prisma: PrismaService) {
    super(prisma, 'sysParamConfig');
  }

  /** 分页查询参数配置（字段映射为前端 VO 形态） */
  async pageVo(options: PageOptions) {
    const result = await this.page(options, undefined, undefined, undefined);
    return { ...result, list: result.list.map(toVo) };
  }

  /**
   * 更新参数值
   * int 类型校验 [min,max] 范围，越界返回错误信息（由 controller 转 fail）。
   * @returns { ok: true } 成功；{ ok: false, message } 校验失败
   */
  async updateValue(
    id: number,
    value: string,
  ): Promise<{ ok: boolean; message?: string; name?: string }> {
    const target = await this.prisma.sysParamConfig.findUnique({ where: { id } });
    if (!target) return { ok: false, message: '参数不存在' };

    if (target.valueType === 'int') {
      const num = Number(value);
      const min = target.minValue;
      const max = target.maxValue;
      const belowMin = min !== null && min !== undefined && num < min;
      const aboveMax = max !== null && max !== undefined && num > max;
      if (!Number.isInteger(num) || belowMin || aboveMax) {
        return { ok: false, message: '参数值超出允许范围' };
      }
    }

    await this.prisma.sysParamConfig.update({
      where: { id },
      data: { value: String(value) },
    });
    return { ok: true, name: target.name };
  }
}
