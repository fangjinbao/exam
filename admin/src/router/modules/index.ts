import { AppRouteRecord } from '@/types/router'
import { equipmentRoutes } from './equipment'
import { organizationTemplateRoutes } from './organization-template'
import { permissionTemplateRoutes } from './permission-template'
import { systemRoutes } from './system'
export const routeModules: AppRouteRecord[] = [
  equipmentRoutes,
  organizationTemplateRoutes,
  permissionTemplateRoutes,
  systemRoutes,
]
