/**
 * 解析客户端来源 IP
 *
 * 优先级：x-forwarded-for 首段（反向代理场景）→ req.ip → socket.remoteAddress，
 * 并去除 IPv4-mapped IPv6 的 `::ffff:` 前缀。全部取不到时返回「未知」。
 *
 * @param request Express 请求对象
 * @returns 归一化后的来源 IP 字符串
 */
export function resolveClientIp(request: any): string {
  const xff = request?.headers?.['x-forwarded-for'];
  const raw =
    (typeof xff === 'string' && xff.split(',')[0].trim()) ||
    request?.ip ||
    request?.socket?.remoteAddress ||
    '';
  return String(raw).replace(/^::ffff:/, '') || '未知';
}
