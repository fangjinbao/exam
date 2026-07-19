import { AppRouteRecord } from '@/types/router'

/**
 * 外部考生管理路由
 * 一级菜单，含「外部单位」「外部考生」两个二级菜单
 * 默认子项指向外部单位页，与 system.ts 默认页=第一个子页的约定一致
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
      component: () => import('@/views/external-org/index.vue'),
      meta: {
        title: 'menus.externalCandidate.org',
        keepAlive: true,
        isHide: true
      }
    },
    {
      path: 'org',
      name: 'ExternalCandidateOrg',
      component: () => import('@/views/external-org/index.vue'),
      meta: {
        title: 'menus.externalCandidate.org',
        keepAlive: true
      }
    },
    {
      path: 'candidate',
      name: 'ExternalCandidateList',
      component: () => import('@/views/external-candidate/index.vue'),
      meta: {
        title: 'menus.externalCandidate.candidate',
        keepAlive: true
      }
    }
  ]
}
