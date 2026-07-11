import { AppRouteRecord } from '@/types/router'

/**
 * 系统管理路由
 * 包含：参数配置、AI模型配置、数据字典、操作日志
 * 仅系统管理员可访问，其他角色菜单入口隐藏（原型阶段不做权限拦截）
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
      component: () => import('@/views/system/param-config/index.vue'),
      meta: {
        title: 'menus.system.title',
        keepAlive: true,
        isHide: true
      }
    },
    {
      path: 'param-config',
      name: 'SystemParamConfig',
      component: () => import('@/views/system/param-config/index.vue'),
      meta: {
        title: 'menus.system.paramConfig',
        keepAlive: true
      }
    },
    {
      path: 'ai-model',
      name: 'SystemAiModel',
      component: () => import('@/views/system/ai-model/index.vue'),
      meta: {
        title: 'menus.system.aiModel',
        keepAlive: true
      }
    },
    {
      path: 'data-dict',
      name: 'SystemDataDict',
      component: () => import('@/views/system/data-dict/index.vue'),
      meta: {
        title: 'menus.system.dataDict',
        keepAlive: true
      }
    },
    {
      path: 'operation-log',
      name: 'SystemOperationLog',
      component: () => import('@/views/system/operation-log/index.vue'),
      meta: {
        title: 'menus.system.operationLog',
        keepAlive: true
      }
    }
  ]
}
