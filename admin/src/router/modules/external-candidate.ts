import { AppRouteRecord } from '@/types/router'

/**
 * 外部考生管理路由
 * 一级菜单（单页），维护外部单位考生信息并生成考试账号
 * 父级为 Layout 容器，唯一子项 isHide，侧边栏渲染为单个菜单项
 */
export const externalCandidateRoutes: AppRouteRecord = {
  path: '/external-candidate',
  name: 'ExternalCandidate',
  component: () => import('@/views/index/index.vue'),
  meta: {
    title: 'menus.externalCandidate.title',
    icon: 'User',
    isFirstLevel: true
  },
  children: [
    {
      path: '',
      name: 'ExternalCandidateIndex',
      component: () => import('@/views/external-candidate/index.vue'),
      meta: {
        title: 'menus.externalCandidate.title',
        keepAlive: true,
        isHide: true
      }
    }
  ]
}
