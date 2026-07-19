import { AppRouteRecord } from '@/types/router'

/**
 * 题库管理路由
 * 一级菜单（目录），当前含「知识点分类」二级菜单
 * 父级为 Layout 容器，默认子项指向知识点分类页，与 system.ts 默认页=第一个子页的约定一致
 */
export const questionBankRoutes: AppRouteRecord = {
  path: '/question-bank',
  name: 'QuestionBank',
  component: () => import('@/views/index/index.vue'),
  meta: {
    title: 'menus.questionBank.title',
    icon: 'Collection',
    isFirstLevel: true
  },
  children: [
    {
      path: '',
      name: 'QuestionBankIndex',
      component: () => import('@/views/question-bank/knowledge-point/index.vue'),
      meta: {
        title: 'menus.questionBank.knowledgePoint',
        keepAlive: true,
        isHide: true
      }
    },
    {
      path: 'knowledge-point',
      name: 'QuestionBankKnowledgePoint',
      component: () => import('@/views/question-bank/knowledge-point/index.vue'),
      meta: {
        title: 'menus.questionBank.knowledgePoint',
        keepAlive: true
      }
    }
  ]
}
