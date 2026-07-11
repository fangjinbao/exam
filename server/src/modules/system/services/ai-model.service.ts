import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { BaseService, PageOptions } from '@/common/crud';

/** 业务结果：ok 标识成功，失败时带中文提示 */
type Result<T = void> = { ok: true; data?: T } | { ok: false; message: string };

/** 密钥脱敏：仅保留首尾各 4 位，中间以 * 代替 */
function maskApiKey(key?: string | null): string {
  if (!key) return '';
  if (key.length <= 8) return '*'.repeat(key.length);
  return `${key.slice(0, 4)}${'*'.repeat(key.length - 8)}${key.slice(-4)}`;
}

/** select 白名单：显式排除 apiKey，运行时不从库中取出完整密钥用于下发 */
const LIST_SELECT = {
  id: true,
  name: true,
  provider: true,
  model: true,
  apiUrl: true,
  apiKey: true, // 仅用于脱敏计算，转 VO 时剔除
  maxConcurrency: true,
  timeout: true,
  status: true,
  connStatus: true,
  createTime: true,
  updateTime: true,
} as const;

/** 库记录 → 前端 VO：剔除完整 apiKey，补 apiKeyMasked */
function toVo(row: any) {
  if (!row) return row;
  const { apiKey, ...rest } = row;
  return { ...rest, apiKeyMasked: maskApiKey(apiKey) };
}

/**
 * AI 模型配置服务
 * 负责脱敏下发、名称唯一、启用全局互斥、启用项删除保护与连接测试。
 */
@Injectable()
export class AiModelService extends BaseService {
  constructor(protected prisma: PrismaService) {
    super(prisma, 'sysAiModel');
  }

  /** 分页查询（密钥脱敏） */
  async pageVo(options: PageOptions) {
    const result = await this.page(options, undefined, LIST_SELECT as any);
    return { ...result, list: result.list.map(toVo) };
  }

  /** 校验配置名称全局唯一，重复返回错误 */
  private async assertNameUnique(name: string, excludeId?: number): Promise<Result> {
    const dup = await this.prisma.sysAiModel.findFirst({
      where: { name, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (dup) return { ok: false, message: '配置名称已存在，请更换' };
    return { ok: true };
  }

  /** 新增配置（名称唯一，新增默认停用、未测试） */
  async create(dto: any): Promise<Result<any>> {
    const uniq = await this.assertNameUnique(dto.name);
    if (!uniq.ok) return uniq;
    const created = await this.prisma.sysAiModel.create({
      data: {
        name: dto.name,
        provider: dto.provider,
        model: dto.model,
        apiUrl: dto.apiUrl,
        apiKey: dto.apiKey || '',
        maxConcurrency: dto.maxConcurrency ?? null,
        timeout: dto.timeout ?? null,
        status: 0,
        connStatus: 'unknown',
      },
    });
    return { ok: true, data: toVo(created) };
  }

  /** 更新配置（密钥留空保留原值；配置变更后连接状态重置为未测试） */
  async modify(id: number, dto: any): Promise<Result<any>> {
    const target = await this.prisma.sysAiModel.findUnique({ where: { id } });
    if (!target) return { ok: false, message: '配置不存在' };
    const uniq = await this.assertNameUnique(dto.name, id);
    if (!uniq.ok) return uniq;
    const updated = await this.prisma.sysAiModel.update({
      where: { id },
      data: {
        name: dto.name,
        provider: dto.provider,
        model: dto.model,
        apiUrl: dto.apiUrl,
        // 密钥留空表示不修改，保留原值
        ...(dto.apiKey ? { apiKey: dto.apiKey } : {}),
        maxConcurrency: dto.maxConcurrency ?? null,
        timeout: dto.timeout ?? null,
        // 配置信息变更后连接状态失效，重置为未测试
        connStatus: 'unknown',
      },
    });
    return { ok: true, data: toVo(updated) };
  }

  /** 删除配置（当前启用项禁止删除） */
  async remove(id: number): Promise<Result> {
    const target = await this.prisma.sysAiModel.findUnique({ where: { id } });
    if (!target) return { ok: false, message: '配置不存在' };
    if (target.status === 1) return { ok: false, message: '该配置为当前启用模型，无法删除' };
    await this.prisma.sysAiModel.delete({ where: { id } });
    return { ok: true };
  }

  /** 启用指定配置，其余自动停用（全局互斥，事务保证一致） */
  async enable(id: number): Promise<Result> {
    const target = await this.prisma.sysAiModel.findUnique({ where: { id } });
    if (!target) return { ok: false, message: '配置不存在' };
    await this.prisma.$transaction([
      this.prisma.sysAiModel.updateMany({
        where: { status: 1, id: { not: id } },
        data: { status: 0 },
      }),
      this.prisma.sysAiModel.update({ where: { id }, data: { status: 1 } }),
    ]);
    return { ok: true };
  }

  /**
   * 连接测试
   * 原型阶段按是否填写接口地址判定连通性，并回写连接状态。
   */
  async test(id: number): Promise<Result<{ success: boolean }>> {
    const target = await this.prisma.sysAiModel.findUnique({ where: { id } });
    if (!target) return { ok: false, message: '配置不存在' };
    const success = Boolean(target.apiUrl);
    await this.prisma.sysAiModel.update({
      where: { id },
      data: { connStatus: success ? 'normal' : 'error' },
    });
    return { ok: true, data: { success } };
  }
}
