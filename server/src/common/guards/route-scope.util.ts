/**
 * 路由归属判定工具
 *
 * AuthGuard（管理端）与 AppAuthGuard（C 端）共用同一份前缀判定，
 * 保证「同一个请求恰好被其中一个守卫实质校验」这一不变量成立。
 *
 * 安全提示：两个守卫必须引用本函数，不要各自复制实现——一旦判定逻辑出现分歧，
 * 就可能出现某个请求被两个守卫同时放行（无人校验）的鉴权空洞。
 */

/**
 * 判断是否为 C 端路由（/app 开头）
 *
 * 用 request.url（含前缀的完整路径）而非 route.path（不含 controller 前缀）。
 * 查询串需先剥离，否则形如 `/app?x=1` 的路径会判定失败。
 *
 * @param request 请求对象
 * @returns 是否为 /app 前缀路由
 */
export function isAppRoute(request: any): boolean {
  const fullPath = (request?.url || '').split('?')[0];
  return /^\/app(\/|$)/.test(fullPath);
}
