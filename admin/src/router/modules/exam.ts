import { AppRouteRecord } from '@/types/router'

/**
 * 考试管理路由
 * 一级菜单（单页），维护考试的创建、考生分配、防作弊配置、发布/撤回
 * 父级为 Layout 容器，唯一子项 isHide，侧边栏渲染为单个菜单项
 */
export const examRoutes: AppRouteRecord = {
  path: '/exam',
  name: 'Exam',
  component: () => import('@/views/index/index.vue'),
  meta: {
    title: 'menus.exam.title',
    icon: 'EditPen',
    isFirstLevel: true
  },
  children: [
    {
      path: '',
      name: 'ExamIndex',
      component: () => import('@/views/exam/index.vue'),
      meta: {
        title: 'menus.exam.title',
        keepAlive: true,
        isHide: true
      }
    }
  ]
}

/**
 * 考试详情：独立顶级隐藏页（考试 id 走 query）
 * 与 exam-edit 同理，考试管理为单页一级菜单无法承载子页，故详情单独作为一级隐藏路由
 */
export const examDetailRoutes: AppRouteRecord = {
  path: '/exam-detail',
  name: 'ExamDetail',
  component: () => import('@/views/index/index.vue'),
  meta: {
    title: 'menus.exam.title',
    isHide: true
  },
  children: [
    {
      path: '',
      name: 'ExamDetailIndex',
      component: () => import('@/views/exam-detail/index.vue'),
      meta: {
        title: 'menus.exam.title',
        keepAlive: false,
        isHide: true
      }
    }
  ]
}

/**
 * 创建/编辑考试：独立顶级隐藏页（编辑态附 id 走 query）
 * 因考试管理为单页一级菜单无法承载子页，故 edit 单独作为一级隐藏路由，路径 /exam-edit
 */
export const examEditRoutes: AppRouteRecord = {
  path: '/exam-edit',
  name: 'ExamEdit',
  component: () => import('@/views/index/index.vue'),
  meta: {
    title: 'menus.exam.title',
    isHide: true
  },
  children: [
    {
      path: '',
      name: 'ExamEditIndex',
      component: () => import('@/views/exam-edit/index.vue'),
      meta: {
        title: 'menus.exam.title',
        keepAlive: false,
        isHide: true
      }
    }
  ]
}
