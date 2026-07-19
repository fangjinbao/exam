import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { BaseService, PageOptions } from '@/common/crud';

/** 业务结果：ok 标识成功，失败时带中文提示 */
type Result<T = void> = { ok: true; data?: T } | { ok: false; message: string };

/** 支持的模型服务商 */
type Provider = 'OpenAI' | 'Anthropic';

/** 连接测试 / 拉模型的外部请求默认超时（毫秒） */
const REQUEST_TIMEOUT_MS = 15000;

/** 密钥脱敏：仅保留首尾各 4 位，中间以 * 代替 */
function maskApiKey(key?: string | null): string {
  if (!key) return '';
  if (key.length <= 8) return '*'.repeat(key.length);
  return `${key.slice(0, 4)}${'*'.repeat(key.length - 8)}${key.slice(-4)}`;
}

/** select 白名单：apiKey 仅用于脱敏计算，转 VO 时剔除 */
const LIST_SELECT = {
  id: true,
  name: true,
  provider: true,
  model: true,
  apiUrl: true,
  apiKey: true,
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

/** 归一 base url：去掉尾部斜杠及误填的端点路径（chat/completions、messages、models） */
function normalizeBaseUrl(apiUrl: string): string {
  let base = (apiUrl || '').trim().replace(/\/+$/, '');
  base = base.replace(/\/(chat\/completions|messages|models)$/i, '');
  return base;
}

/**
 * AI 模型配置服务
 * 负责脱敏下发、名称唯一、启用全局互斥、启用项删除保护，
 * 以及按服务商官方标准执行真实连接测试与模型列表拉取。
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
  async enable(id: number): Promise<Result<{ name: string }>> {
    const target = await this.prisma.sysAiModel.findUnique({ where: { id } });
    if (!target) return { ok: false, message: '配置不存在' };
    await this.prisma.$transaction([
      this.prisma.sysAiModel.updateMany({
        where: { status: 1, id: { not: id } },
        data: { status: 0 },
      }),
      this.prisma.sysAiModel.update({ where: { id }, data: { status: 1 } }),
    ]);
    return { ok: true, data: { name: target.name } };
  }

  /**
   * 带超时的 fetch：默认 15s，超时或网络错误抛出可读中文错误。
   */
  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        throw new Error(`请求超时（>${REQUEST_TIMEOUT_MS / 1000}s），请检查接口地址与网络`);
      }
      throw new Error(`无法连接到接口地址：${e?.message || '网络错误'}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /** 组装鉴权/版本请求头 */
  private buildHeaders(provider: Provider, apiKey: string): Record<string, string> {
    if (provider === 'Anthropic') {
      return {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      };
    }
    // OpenAI
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    };
  }

  /** 从响应体尽力提取服务商返回的错误信息 */
  private async extractErr(res: Response): Promise<string> {
    let detail = '';
    try {
      const body: any = await res.json();
      detail = body?.error?.message || body?.message || '';
    } catch {
      // 忽略非 JSON 响应体
    }
    if (res.status === 401 || res.status === 403) {
      return `密钥无效或无权限（${res.status}）${detail ? '：' + detail : ''}`;
    }
    if (res.status === 404) {
      return `接口地址或模型不存在（404）${detail ? '：' + detail : ''}`;
    }
    return `服务商返回错误（${res.status}）${detail ? '：' + detail : ''}`;
  }

  /**
   * 连接测试：向服务商官方接口发一条最小对话请求（max_tokens=1），
   * 验证密钥、接口地址、模型名是否均可用，并回写连接状态。
   */
  async test(id: number): Promise<Result<{ success: boolean; message: string }>> {
    const target = await this.prisma.sysAiModel.findUnique({ where: { id } });
    if (!target) return { ok: false, message: '配置不存在' };
    const provider = target.provider as Provider;
    if (provider !== 'OpenAI' && provider !== 'Anthropic') {
      return { ok: false, message: `暂不支持的服务商「${target.provider}」，请改为 OpenAI 或 Anthropic` };
    }
    if (!target.apiKey) {
      return { ok: false, message: '未配置密钥，无法测试，请先编辑填写密钥' };
    }

    const base = normalizeBaseUrl(target.apiUrl);
    const headers = this.buildHeaders(provider, target.apiKey);
    const url = provider === 'Anthropic' ? `${base}/messages` : `${base}/chat/completions`;
    // OpenAI 与 Anthropic 的最小对话请求体结构一致（model + max_tokens + messages）
    const body = {
      model: target.model,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    };

    let success = false;
    let message = '连接测试成功';
    try {
      const res = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (res.ok) {
        success = true;
      } else {
        message = await this.extractErr(res);
      }
    } catch (e: any) {
      message = e?.message || '连接测试失败';
    }

    await this.prisma.sysAiModel.update({
      where: { id },
      data: { connStatus: success ? 'normal' : 'error' },
    });
    return { ok: true, data: { success, message } };
  }
}
