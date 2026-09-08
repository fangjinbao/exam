import { AppRouteRecord } from '@/types/router'

/**
 * 试卷管理路由
 * 一级菜单（单页），维护固定/随机试卷的组卷、预览、发布
 * 父级为 Layout 容器，唯一子项 isHide，侧边栏渲染为单个菜单项
 */
export const paperRoutes: AppRouteRecord = {
  path: '/paper',
  name: 'Paper',
  component: () => import('@/views/index/index.vue'),
  meta: {
    title: 'menus.paper.title',
    icon: 'Document',
    isFirstLevel: true
  },
  children: [
    {
      path: '',
      name: 'PaperIndex',
      component: () => import('@/views/paper/index.vue'),
      meta: {
        title: 'menus.paper.title',
        keepAlive: true,
        isHide: true
      }
    }
  ]
}

/**
 * 创建/编辑试卷：独立顶级隐藏页（type=fixed/ai/random 走 query，编辑态附 id）
 * 因试卷管理为单页一级菜单无法承载子页，故 edit 单独作为一级隐藏路由，路径 /paper-edit
 */
export const paperEditRoutes: AppRouteRecord = {
  path: '/paper-edit',
  name: 'PaperEdit',
  component: () => import('@/views/index/index.vue'),
  meta: {
    title: 'menus.paper.title',
    isHide: true
  },
  children: [
    {
      path: '',
      name: 'PaperEditIndex',
      component: () => import('@/views/paper-edit/index.vue'),
      meta: {
        title: 'menus.paper.title',
        keepAlive: false,
        isHide: true
      }
    }
  ]
}
