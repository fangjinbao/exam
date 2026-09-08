import { AppRouteRecord } from '@/types/router'

/**
 * 证书管理路由
 * 一级菜单（目录），含「证书模板」「证书发放」两个二级菜单
 * 父级为 Layout 容器，默认子项指向证书模板页，与 system.ts 默认页=第一个子页的约定一致
 */
export const certificateRoutes: AppRouteRecord = {
  path: '/certificate',
  name: 'Certificate',
  component: () => import('@/views/index/index.vue'),
  meta: {
    title: 'menus.certificate.title',
    icon: 'Medal',
    isFirstLevel: true
  },
  children: [
    {
      path: '',
      name: 'CertificateIndex',
      component: () => import('@/views/certificate/template/index.vue'),
      meta: {
        title: 'menus.certificate.template',
        keepAlive: true,
        isHide: true
      }
    },
    {
      path: 'template',
      name: 'CertificateTemplatePage',
      component: () => import('@/views/certificate/template/index.vue'),
      meta: {
        title: 'menus.certificate.template',
        keepAlive: true
      }
    },
    {
      path: 'issue',
      name: 'CertificateIssue',
      component: () => import('@/views/certificate/issue/index.vue'),
      meta: {
        title: 'menus.certificate.issue',
        keepAlive: true
      }
    }
  ]
}
