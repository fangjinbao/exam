import { AppRouteRecord } from '@/types/router'

/**
 * 阅卷中心路由
 * 一级菜单（单页），以答卷为阅卷任务，客观题判分查看 + 主观题 AI/人工阅卷 + 成绩发布
 * 父级为 Layout 容器，唯一子项 isHide，侧边栏渲染为单个菜单项
 */
export const gradingRoutes: AppRouteRecord = {
  path: '/grading',
  name: 'Grading',
  component: () => import('@/views/index/index.vue'),
  meta: {
    title: 'menus.grading.title',
    icon: 'Checked',
    isFirstLevel: true
  },
  children: [
    {
      path: '',
      name: 'GradingIndex',
      component: () => import('@/views/grading/index.vue'),
      meta: {
        title: 'menus.grading.title',
        keepAlive: true,
        isHide: true
      }
    }
  ]
}

/**
 * 阅卷工作台：独立顶级隐藏页（考试 id 走 query）
 * 与 exam-detail 同理，阅卷中心为单页一级菜单无法承载子页，故工作台单独作为一级隐藏路由。
 * 不做 keepAlive：换考试进来必须重新拉名单，缓存会显示上一场的考生。
 */
export const gradingWorkspaceRoutes: AppRouteRecord = {
  path: '/grading-workspace',
  name: 'GradingWorkspace',
  component: () => import('@/views/index/index.vue'),
  meta: {
    title: 'menus.grading.title',
    isHide: true
  },
  children: [
    {
      path: '',
      name: 'GradingWorkspaceIndex',
      component: () => import('@/views/grading-workspace/index.vue'),
      meta: {
        title: 'menus.grading.title',
        keepAlive: false,
        isHide: true
      }
    }
  ]
}
