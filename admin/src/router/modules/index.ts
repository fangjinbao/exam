import { AppRouteRecord } from '@/types/router'
import { organizationTemplateRoutes } from './organization-template'
import { permissionTemplateRoutes } from './permission-template'
import { externalCandidateRoutes } from './external-candidate'
import { examSiteRoutes } from './exam-site'
import { questionBankRoutes } from './question-bank'
import { paperRoutes, paperEditRoutes } from './paper'
import { examRoutes, examEditRoutes, examDetailRoutes } from './exam'
import { practiceRoutes, practiceEditRoutes, practiceDetailRoutes } from './practice'
import { gradingRoutes, gradingWorkspaceRoutes } from './grading'
import { proctorRoutes, proctorWorkspaceRoutes } from './proctor'
import { certificationRoutes } from './certification'
import { certificateRoutes } from './certificate'
import { systemRoutes } from './system'
export const routeModules: AppRouteRecord[] = [
  questionBankRoutes,
  paperRoutes,
  paperEditRoutes,
  examRoutes,
  examEditRoutes,
  examDetailRoutes,
  practiceRoutes,
  practiceEditRoutes,
  practiceDetailRoutes,
  gradingRoutes,
  gradingWorkspaceRoutes,
  proctorRoutes,
  proctorWorkspaceRoutes,
  certificationRoutes,
  certificateRoutes,
  externalCandidateRoutes,
  organizationTemplateRoutes,
  examSiteRoutes,
  permissionTemplateRoutes,
  systemRoutes
]
