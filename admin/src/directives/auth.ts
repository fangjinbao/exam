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

function checkAuthPermission(el: HTMLElement, binding: AuthBinding): void {
  // 获取当前路由的权限列表（后端菜单模式下为完整权限点，如 exam:external-org:add）
  const authList = (router.currentRoute.value.meta.authList as Array<{ authMark: string }>) || []

  // 按动作末段匹配（与 useAuth().hasAuth 同一套规则）
  const hasPermission = matchAuthMark(
    authList.map((item) => item.authMark),
    binding.value
  )

  // 如果没有权限，移除元素
  if (!hasPermission) {
    removeElement(el)
  }
}

function removeElement(el: HTMLElement): void {
  if (el.parentNode) {
    el.parentNode.removeChild(el)
  }
}

const authDirective: Directive = {
  mounted: checkAuthPermission,
  updated: checkAuthPermission
}

export function setupAuthDirective(app: App): void {
  app.directive('auth', authDirective)
}
