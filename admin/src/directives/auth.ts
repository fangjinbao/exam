import { router } from '@/router'
import { App, Directive, DirectiveBinding } from 'vue'
import { matchAuthMark } from '@/utils/permission/authMatch'

/**
 * 权限指令（后端控制模式可用）
 * 用法（推荐只传动作名，自动绑定当前路由模块的权限点）：
 * <ElButton v-auth="'add'">按钮</ElButton>
 * 也兼容完整权限点：<ElButton v-auth="'exam:external-org:add'">
 */

interface AuthBinding extends DirectiveBinding {
  value: string
}

/** 挂载时快照的权限点集合，挂在元素上供 updated 复用 */
const AUTH_CODES = Symbol('authCodes')
/** 被本指令隐藏前的原始 display，用于恢复 */
const PREV_DISPLAY = Symbol('prevDisplay')

type AuthedElement = HTMLElement & {
  [AUTH_CODES]?: string[]
  [PREV_DISPLAY]?: string
}

/** 读取当前路由的权限点（后端菜单模式下为完整权限点，如 exam:external-org:add） */
function currentAuthCodes(): string[] {
  const authList = (router.currentRoute.value.meta.authList as Array<{ authMark: string }>) || []
  return authList.map((item) => item.authMark)
}

/**
 * 按权限决定元素显隐。
 *
 * 只切换 display，不做 removeChild：元素被摘出 DOM 后 Vue 的 vnode 仍指向游离节点，
 * 后续 patch 在其附近插入兄弟节点会失效（表现为整列空白、新数据渲染不出来），
 * 且 keep-alive 缓存的是这份已损坏的 DOM，返回页面时无法自愈。
 */
function applyAuth(el: AuthedElement, binding: AuthBinding, codes: string[]): void {
  if (matchAuthMark(codes, binding.value)) {
    // 恢复到指令介入前的 display（可能是空串，即由样式表决定）
    if (el[PREV_DISPLAY] !== undefined) {
      el.style.display = el[PREV_DISPLAY]
      delete el[PREV_DISPLAY]
    }
    return
  }
  if (el[PREV_DISPLAY] === undefined) el[PREV_DISPLAY] = el.style.display
  el.style.display = 'none'
}

const authDirective: Directive = {
  mounted(el: AuthedElement, binding: AuthBinding) {
    // 挂载时当前路由必定是本元素所属页面，此刻的权限点可信，快照留用
    const codes = currentAuthCodes()
    el[AUTH_CODES] = codes
    applyAuth(el, binding, codes)
  },
  updated(el: AuthedElement, binding: AuthBinding) {
    // 复用挂载时的快照，不重读 currentRoute：页面切换过渡期间两个页面同时存在，
    // 此时被缓存页面若发生重渲染，会拿新路由的 authList 误判旧页面的按钮
    applyAuth(el, binding, el[AUTH_CODES] ?? currentAuthCodes())
  }
}

export function setupAuthDirective(app: App): void {
  app.directive('auth', authDirective)
}
