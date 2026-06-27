import { AppRouteRecord } from '@/types/router'

/**
 * 系统配置路由
 * 包含：基础配置、问题类型（后续扩展：视频监控、通知公告、制度文档）
 */
export const systemRoutes: AppRouteRecord = {
  path: '/system',
  name: 'System',
  component: () => import('@/views/index/index.vue'),
  meta: {
    title: 'menus.system.title',
    icon: 'Setting',
    isFirstLevel: true
  },
  children: [
    {
      path: '',
      name: 'SystemIndex',
      redirect: '/system/base-config',
      meta: {
        title: 'menus.system.title',
        isHide: true
      }
    },
    {
      path: 'base-config',
      name: 'SystemBaseConfig',
      component: () => import('@/views/system/base-config/index.vue'),
      meta: {
        title: 'menus.system.baseConfig',
        keepAlive: true
      }
    },
    {
      path: 'issue-type',
      name: 'SystemIssueType',
      component: () => import('@/views/system/issue-type/index.vue'),
      meta: {
        title: 'menus.system.issueType',
        keepAlive: true
      }
    }
  ]
}
