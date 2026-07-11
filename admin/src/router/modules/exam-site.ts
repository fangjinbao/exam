import { AppRouteRecord } from '@/types/router'

/**
 * 考点管理路由
 * 一级菜单（单页），维护考点基础信息，为考试的考点安排提供数据
 * 父级为 Layout 容器，唯一子项 isHide，侧边栏渲染为单个菜单项
 */
export const examSiteRoutes: AppRouteRecord = {
  path: '/exam-site',
  name: 'ExamSite',
  component: () => import('@/views/index/index.vue'),
  meta: {
    title: 'menus.examSite.title',
    icon: 'Location',
    isFirstLevel: true
  },
  children: [
    {
      path: '',
      name: 'ExamSiteIndex',
      component: () => import('@/views/exam-site/index.vue'),
      meta: {
        title: 'menus.examSite.title',
        keepAlive: true,
        isHide: true
      }
    }
  ]
}
