/**
 * 文件名称：router/index.js - 路由配置文件
 *
 * 功能描述：
 *   Vue Router 路由配置，定义应用的所有路由规则
 *   包含路由守卫、页面缓存配置、底部导航栏显示控制等
 *
 * 主要功能：
 *   - 定义路由规则和页面映射
 *   - 配置路由 Meta 信息（标题、缓存、权限等）
 *   - 全局路由守卫（页面标题设置等）
 *   - KeepAlive 缓存控制
 *   - 底部导航栏显示控制
 */

import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '@/utils/storage'
import { startNavProgress, doneNavProgress } from '@/utils/navProgress'

/**
 * 路由 Meta 信息类型定义
 * @typedef {Object} RouteMeta
 * @property {string} [title] - 页面标题
 * @property {boolean} [requiresAuth] - 是否需要登录
 * @property {boolean} [keepAlive] - 是否缓存页面（KeepAlive）
 * @property {boolean} [showTabbar] - 是否显示底部导航栏
 */

// 路由配置数组
const routes = [
  {
    path: '/',
    redirect: '/home' // 根路径重定向到首页
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/Login.vue'), // 登录页面
    meta: {
      title: '登录',
      requiresAuth: false, // 不需要登录
      keepAlive: false, // 不缓存
      showTabbar: false // 不显示底部导航栏
    }
  },
  {
    path: '/home',
    name: 'Home',
    component: () => import('@/views/home/Home.vue'), // 路由懒加载
    meta: {
      title: '首页',
      requiresAuth: true, // 需要登录
      keepAlive: true, // 启用页面缓存
      showTabbar: true // 显示底部导航栏
    }
  },
  {
    path: '/task',
    name: 'Task',
    component: () => import('@/views/task/Task.vue'),
    meta: {
      title: '任务',
      requiresAuth: true, // 需要登录
      keepAlive: true,
      showTabbar: true
    }
  },
  {
    // 工作台已从底部导航移除，路由保留以便直接访问与后续复用
    path: '/workspace',
    name: 'Workspace',
    component: () => import('@/views/workspace/Workspace.vue'),
    meta: {
      title: '工作台',
      requiresAuth: true, // 需要登录
      keepAlive: true,
      showTabbar: true
    }
  },
  {
    path: '/message',
    name: 'Message',
    component: () => import('@/views/message/Message.vue'),
    meta: {
      title: '消息',
      requiresAuth: true, // 需要登录
      keepAlive: true,
      showTabbar: true
    }
  },
  {
    path: '/profile',
    name: 'Profile',
    component: () => import('@/views/profile/Profile.vue'),
    meta: {
      title: '我的',
      requiresAuth: true, // 需要登录
      keepAlive: true,
      showTabbar: true
    }
  },
  {
    path: '/message/detail/:id',
    name: 'MessageDetail',
    component: () => import('@/views/message/MessageDetail.vue'),
    meta: {
      title: '消息详情',
      requiresAuth: true,
      keepAlive: false,
      showTabbar: false
    }
  },
  {
    path: '/exam/list',
    name: 'ExamList',
    component: () => import('@/views/exam/ExamList.vue'),
    meta: {
      title: '参加考试',
      requiresAuth: true,
      keepAlive: false,
      showTabbar: false
    }
  },
  {
    path: '/exam/detail/:id',
    name: 'ExamDetail',
    component: () => import('@/views/exam/ExamDetail.vue'),
    meta: {
      title: '考试详情',
      requiresAuth: true,
      keepAlive: false,
      showTabbar: false
    }
  },
  {
    path: '/exam/answer/:id',
    name: 'ExamAnswer',
    component: () => import('@/views/exam/ExamAnswer.vue'),
    meta: {
      title: '考试作答',
      requiresAuth: true,
      keepAlive: false,
      showTabbar: false
    }
  },
  {
    path: '/exam/result/:id',
    name: 'ExamResult',
    component: () => import('@/views/exam/ExamResult.vue'),
    meta: {
      title: '交卷详情',
      requiresAuth: true,
      keepAlive: false,
      showTabbar: false
    }
  },
  {
    path: '/practice/setup',
    name: 'PracticeSetup',
    component: () => import('@/views/practice/PracticeSetup.vue'),
    meta: {
      title: '在线练习',
      requiresAuth: true,
      keepAlive: false,
      showTabbar: false
    }
  },
  {
    path: '/practice/answer',
    name: 'PracticeAnswer',
    component: () => import('@/views/practice/PracticeAnswer.vue'),
    meta: {
      title: '练习作答',
      requiresAuth: true,
      keepAlive: false,
      showTabbar: false
    }
  },
  {
    path: '/practice/wrong',
    name: 'WrongBook',
    component: () => import('@/views/practice/WrongBook.vue'),
    meta: {
      title: '错题本',
      requiresAuth: true,
      keepAlive: false,
      showTabbar: false
    }
  },
  {
    path: '/profile/edit',
    name: 'ProfileEdit',
    component: () => import('@/views/profile/ProfileEdit.vue'),
    meta: {
      title: '个人信息',
      requiresAuth: true,
      keepAlive: false,
      showTabbar: false
    }
  },
  {
    path: '/profile/scores',
    name: 'ScoreList',
    component: () => import('@/views/profile/ScoreList.vue'),
    meta: {
      title: '我的成绩',
      requiresAuth: true,
      keepAlive: false,
      showTabbar: false
    }
  },
  {
    path: '/profile/scores/:sheetId',
    name: 'ScoreDetail',
    component: () => import('@/views/profile/ScoreDetail.vue'),
    meta: {
      title: '成绩详情',
      requiresAuth: true,
      keepAlive: false,
      showTabbar: false
    }
  },
  {
    path: '/profile/certificates',
    name: 'CertificateList',
    component: () => import('@/views/profile/CertificateList.vue'),
    meta: {
      title: '我的证书',
      requiresAuth: true,
      keepAlive: false,
      showTabbar: false
    }
  },
  {
    path: '/profile/certificates/:id',
    name: 'CertificateDetail',
    component: () => import('@/views/profile/CertificateDetail.vue'),
    meta: {
      title: '证书详情',
      requiresAuth: true,
      keepAlive: false,
      showTabbar: false
    }
  },
  {
    path: '/charts/demo',
    name: 'ChartsDemo',
    component: () => import('@/views/charts/ChartsDemo.vue'),
    meta: {
      title: '图表组件',
      requiresAuth: true, // 需要登录
      keepAlive: false, // 不缓存
      showTabbar: false // 不显示底部导航栏
    }
  },
  {
    path: '/components/form',
    name: 'FormComponents',
    component: () => import('@/views/components/FormComponents.vue'),
    meta: {
      title: '表单组件',
      requiresAuth: true, // 需要登录
      keepAlive: false, // 不缓存
      showTabbar: false // 不显示底部导航栏
    }
  },
  {
    path: '/components/detail',
    name: 'DetailComponents',
    component: () => import('@/views/components/DetailComponents.vue'),
    meta: {
      title: '详情组件',
      requiresAuth: true, // 需要登录
      keepAlive: false, // 不缓存
      showTabbar: false // 不显示底部导航栏
    }
  },
  {
    path: '/components/list',
    name: 'ListComponents',
    component: () => import('@/views/components/ListComponents.vue'),
    meta: {
      title: '列表组件',
      requiresAuth: true, // 需要登录
      keepAlive: false, // 不缓存
      showTabbar: false // 不显示底部导航栏
    }
  }
]

// 创建路由实例
const router = createRouter({
  history: createWebHistory(), // 使用 HTML5 History 模式
  routes
})

/**
 * 全局前置守卫
 * 在每次路由跳转前执行，用于设置页面标题、权限验证等
 */
router.beforeEach((to, from, next) => {
  // 懒加载路由下载 chunk 期间屏幕是空的，先亮进度条（快跳转不会真显示，见实现）
  startNavProgress()

  // 设置页面标题
  document.title = to.meta.title || 'H5应用'

  // 获取 token
  const token = getToken()

  // 检查是否需要登录
  if (to.meta.requiresAuth) {
    // 需要登录但未登录，跳转到登录页
    if (!token) {
      next({
        path: '/login',
        query: { redirect: to.fullPath } // 保存目标路径，登录后跳转
      })
      return
    }
  } else {
    // 不需要登录的页面，如果已登录且访问登录页，跳转到首页
    if (to.path === '/login' && token) {
      next('/home')
      return
    }
  }

  // 继续路由跳转
  next()
})

/** 跳转结束（含被重定向到登录页的情形）收掉进度条 */
router.afterEach(() => {
  doneNavProgress()
})

/**
 * 跳转出错也要收掉进度条
 *
 * 最典型的是发版后旧页面去取已被删除的 chunk（动态导入失败）。
 * 不收的话进度条会永远停在 70%，看着像还在加载。
 */
router.onError(() => {
  doneNavProgress()
})

export default router
