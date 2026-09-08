import { AppRouteRecord } from '@/types/router'

/**
 * 练习管理路由
 * 一级菜单（目录），含「岗位练兵」「自主练习」两个二级菜单
 * 父级为 Layout 容器，默认子项指向岗位练兵页，与 certification.ts 默认页=第一个子页的约定一致
 */
export const practiceRoutes: AppRouteRecord = {
  path: '/practice',
  name: 'Practice',
  component: () => import('@/views/index/index.vue'),
  meta: {
    title: 'menus.practice.title',
    icon: 'Notebook',
    isFirstLevel: true
  },
  children: [
    {
      path: '',
      name: 'PracticeIndex',
      component: () => import('@/views/practice/assigned/index.vue'),
      meta: {
        title: 'menus.practice.assigned',
        keepAlive: true,
        isHide: true
      }
    },
    {
      path: 'assigned',
      name: 'PracticeAssigned',
      component: () => import('@/views/practice/assigned/index.vue'),
      meta: {
        title: 'menus.practice.assigned',
        keepAlive: true
      }
    },
    {
      path: 'self',
      name: 'PracticeSelf',
      component: () => import('@/views/practice/self/index.vue'),
      meta: {
        title: 'menus.practice.self',
        keepAlive: true
      }
    }
  ]
}

/**
 * 练习详情：独立顶级隐藏页（id 走 query），页内以 Tab 切「练习详情 / 练习记录」
 * 练习管理已改为目录、本可承载子页，但后端按 `${router}-detail` 约定自动带出这一页，
 * 挪进目录要连带改 router 与视图路径，收益不抵改动面，故保持顶级隐藏路由
 */
export const practiceDetailRoutes: AppRouteRecord = {
  path: '/practice-detail',
  name: 'PracticeDetail',
  component: () => import('@/views/index/index.vue'),
  meta: {
    title: 'menus.practice.title',
    isHide: true
  },
  children: [
    {
      path: '',
      name: 'PracticeDetailIndex',
      component: () => import('@/views/practice-detail/index.vue'),
      meta: {
        title: 'menus.practice.title',
        keepAlive: false,
        isHide: true
      }
    }
  ]
}

/**
 * 创建/编辑练习：独立顶级隐藏页（编辑态附 id 走 query）
 * 同 practice-detail：由后端 `${router}-edit` 约定带出，保持顶级隐藏路由，路径 /practice-edit
 */
export const practiceEditRoutes: AppRouteRecord = {
  path: '/practice-edit',
  name: 'PracticeEdit',
  component: () => import('@/views/index/index.vue'),
  meta: {
    title: 'menus.practice.title',
    isHide: true
  },
  children: [
    {
      path: '',
      name: 'PracticeEditIndex',
      component: () => import('@/views/practice-edit/index.vue'),
      meta: {
        title: 'menus.practice.title',
        keepAlive: false,
        isHide: true
      }
    }
  ]
}
