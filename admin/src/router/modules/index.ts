import { AppRouteRecord } from '@/types/router'
import { organizationTemplateRoutes } from './organization-template'
import { permissionTemplateRoutes } from './permission-template'
import { externalCandidateRoutes } from './external-candidate'
import { examSiteRoutes } from './exam-site'
import { questionBankRoutes } from './question-bank'
import { systemRoutes } from './system'
export const routeModules: AppRouteRecord[] = [
  questionBankRoutes,
  externalCandidateRoutes,
  organizationTemplateRoutes,
  examSiteRoutes,
  permissionTemplateRoutes,
  systemRoutes
]
