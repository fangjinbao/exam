import { AppRouteRecord } from '@/types/router'
import { organizationTemplateRoutes } from './organization-template'
import { permissionTemplateRoutes } from './permission-template'
import { systemRoutes } from './system'
export const routeModules: AppRouteRecord[] = [
  organizationTemplateRoutes,
  permissionTemplateRoutes,
  systemRoutes,
]
