import { AppRouteRecord } from '@/types/router'

/**
 * 技能鉴定路由
 * 一级菜单（目录），含「鉴定工种管理」「认证项目」「鉴定报名」「报名审核」四个二级菜单
 * 父级为 Layout 容器，默认子项指向鉴定工种管理页，与 system.ts 默认页=第一个子页的约定一致
 *
 * 模块显示名由「资格认证」改为「技能鉴定」，但 path 仍为 /certification、
 * 视图目录仍为 views/certification、权限点仍为 exam:cert-*：
 * 这些是用户看不见的内部标识，改它们要连带迁移菜单行 router、角色授权与每个 @Perms 前缀。
 */
export const certificationRoutes: AppRouteRecord = {
  path: '/certification',
  name: 'Certification',
  component: () => import('@/views/index/index.vue'),
  meta: {
    title: 'menus.certification.title',
    icon: 'Postcard',
    isFirstLevel: true
  },
  children: [
    {
      path: '',
      name: 'CertificationIndex',
      component: () => import('@/views/certification/occupation/index.vue'),
      meta: {
        title: 'menus.certification.occupation',
        keepAlive: true,
        isHide: true
      }
    },
    {
      path: 'occupation',
      name: 'CertificationOccupation',
      component: () => import('@/views/certification/occupation/index.vue'),
      meta: {
        title: 'menus.certification.occupation',
        keepAlive: true
      }
    },
    {
      path: 'project',
      name: 'CertificationProject',
      component: () => import('@/views/certification/project/index.vue'),
      meta: {
        title: 'menus.certification.project',
        keepAlive: true
      }
    },
    {
      // 鉴定报名：单位管理员按本单位名额挑人报名
      // keepAlive=false：名额的已用/剩余是实时值，缓存回来会显示过期的剩余数，
      // 照着报下去必然撞上服务端的名额硬拦
      path: 'enroll',
      name: 'CertificationEnroll',
      component: () => import('@/views/certification/enroll/index.vue'),
      meta: {
        title: 'menus.certification.enroll',
        keepAlive: false
      }
    },
    {
      path: 'application',
      name: 'CertificationApplication',
      component: () => import('@/views/certification/application/index.vue'),
      meta: {
        title: 'menus.certification.application',
        keepAlive: true
      }
    },
    {
      /*
        鉴定项目详情：隐藏子路由，项目 id 走 query。

        把报名/审核/考试三个阶段的进展汇总在一处——这三段能力本来就有，
        但分散在「鉴定报名」「报名审核」「考试管理」三个菜单里，
        看不到某个项目整体走到哪了。

        不像 exam-detail 那样另起顶级路由：本模块是目录型一级菜单、自带 children，
        直接挂隐藏子项即可，不必绕。

        keepAlive=false：各阶段人数是实时值，缓存回来会显示过期数据。
      */
      path: 'project-detail',
      /*
        name 与后端 MenuService.routerToName 的派生结果保持一致：
        它按 / 切段后只大写首字母、不处理连字符，故 /certification/project-detail
        派生出的是 CertificationProject-detail。

        两边不一致的后果：mock 模式（走静态路由）能跳，真实环境（走后端菜单）报
        "No match for name"。跳转统一按 path 写就不依赖这个名字，但名字仍要对齐——
        免得下个人按 name 跳时又踩一次。
      */
      name: 'CertificationProject-detail',
      component: () => import('@/views/certification/project-detail/index.vue'),
      meta: {
        title: 'menus.certification.projectDetail',
        keepAlive: false,
        isHide: true
      }
    }
  ]
}
