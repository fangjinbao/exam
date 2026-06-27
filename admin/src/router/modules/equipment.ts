import { AppRouteRecord } from '@/types/router'

/**
 * 设备管理路由
 * 包含：设备分类、厂商信息（后续扩展：设备档案）
 */
export const equipmentRoutes: AppRouteRecord = {
  path: '/equipment',
  name: 'Equipment',
  component: () => import('@/views/index/index.vue'),
  meta: {
    title: 'menus.equipment.title',
    icon: 'Box',
    isFirstLevel: true
  },
  children: [
    {
      path: '',
      name: 'EquipmentIndex',
      redirect: '/equipment/category',
      meta: {
        title: 'menus.equipment.title',
        isHide: true
      }
    },
    {
      path: 'category',
      name: 'EquipmentCategory',
      component: () => import('@/views/equipment/category/index.vue'),
      meta: {
        title: 'menus.equipment.category',
        keepAlive: true
      }
    },
    {
      path: 'vendor',
      name: 'EquipmentVendor',
      component: () => import('@/views/equipment/vendor/index.vue'),
      meta: {
        title: 'menus.equipment.vendor',
        keepAlive: true
      }
    }
  ]
}
