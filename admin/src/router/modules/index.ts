import { AppRouteRecord } from '@/types/router'
import { organizationTemplateRoutes } from './organization-template'
import { permissionTemplateRoutes } from './permission-template'
import { externalCandidateRoutes } from './external-candidate'
import { examSiteRoutes } from './exam-site'
import { systemRoutes } from './system'
export const routeModules: AppRouteRecord[] = [
  externalCandidateRoutes,
  organizationTemplateRoutes,
  examSiteRoutes,
  permissionTemplateRoutes,
  systemRoutes
]
