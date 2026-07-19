/**
 * 权限匹配工具（纯函数，无副作用、不依赖 store / 路由，可在任意时机 import）
 *
 * 项目为后端菜单模式：当前路由 meta.authList 里是完整权限点串（如 exam:external-org:add），
 * 由后端 @Perms 装饰器 + controller 前缀自动派生登记。页面/指令只需传「动作名」，
 * 由本函数按末段匹配，避免各处手写完整权限点导致写错。
 */

/**
 * 判断权限码集合是否命中目标标识。
 *
 * 支持两种写法（推荐只传动作名）：
 * - 动作名：'add' / 'update' / 'delete' / 'update-status'，按 `:动作` 结尾匹配当前模块
 *   的完整权限点。当前路由 authList 只含本模块权限，按末段匹配既精确又不跨模块误命中
 *   （'delete' 不会命中 'batch-delete'，因分隔符是冒号）。
 * - 完整权限点：'exam:external-org:add'，精确匹配。
 *
 * @param codes 当前上下文可用的权限码集合（后端模式为完整权限点，前端模式为短码）
 * @param auth 目标权限标识（动作名或完整权限点）
 */
export function matchAuthMark(codes: string[], auth: string): boolean {
  if (!auth) return false
  return codes.some((code) => code === auth || code.endsWith(`:${auth}`))
}
