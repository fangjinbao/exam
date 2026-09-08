import { AppRouteRecord } from '@/types/router'

/**
 * 监考中心路由
 * 一级菜单（单页），列表为考试维度（只含指派给自己监考的考试）
 * 父级为 Layout 容器，唯一子项 isHide，侧边栏渲染为单个菜单项，与阅卷中心同款
 */
export const proctorRoutes: AppRouteRecord = {
  path: '/proctor',
  name: 'Proctor',
  component: () => import('@/views/index/index.vue'),
  meta: {
    title: 'menus.proctor.title',
    icon: 'View',
    isFirstLevel: true
  },
  children: [
    {
      path: '',
      name: 'ProctorIndex',
      component: () => import('@/views/proctor/index.vue'),
      meta: {
        title: 'menus.proctor.title',
        keepAlive: true,
        isHide: true
      }
    }
  ]
}

/**
 * 监考工作台：独立顶级隐藏页（考试 id 走 query）
 * 与阅卷工作台同理，监考中心为单页一级菜单无法承载子页，故工作台单独作为一级隐藏路由。
 * 不做 keepAlive：换考试进来必须重新拉考生名单，缓存会显示上一场的人。
 */
export const proctorWorkspaceRoutes: AppRouteRecord = {
  path: '/proctor-workspace',
  name: 'ProctorWorkspace',
  component: () => import('@/views/index/index.vue'),
  meta: {
    title: 'menus.proctor.title',
    isHide: true
  },
  children: [
    {
      path: '',
      name: 'ProctorWorkspaceIndex',
      component: () => import('@/views/proctor-workspace/index.vue'),
      meta: {
        title: 'menus.proctor.title',
        keepAlive: false,
        isHide: true
      }
    }
  ]
}
