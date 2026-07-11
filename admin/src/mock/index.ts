/**
 * Mock 路由统一注册
 * VITE_USE_MOCK=true 时由 main.ts 动态导入
 */

import { mockRoute, extractId } from '@/utils/http/mockRegistry'

// ==================== 认证 ====================
import {
  mockLogin,
  mockGetUserMenuTree,
  mockLogout,
  mockGetPerms,
  mockRefreshToken,
  mockVerifyCaptcha,
  MOCK_USERS
} from './auth'

mockRoute('POST', '/admin/open/login', ({ data }) => mockLogin(data?.username, data?.password))
mockRoute('GET', '/admin/open/person', () => MOCK_USERS[0].userInfo)
mockRoute('GET', '/admin/open/permmenu', () => mockGetUserMenuTree())
mockRoute('POST', '/admin/open/logout', () => mockLogout())
mockRoute('GET', '/admin/open/perms', () => mockGetPerms())
mockRoute('POST', '/admin/open/refreshToken', ({ data }) => mockRefreshToken(data?.refreshToken))
// 注：图形验证码（/api/captcha/image）在 api/captcha.ts 内部直接走 mock，不经此注册表
mockRoute('GET', '/api/captcha/verify', () => mockVerifyCaptcha())

// ==================== 组织管理：部门 / 用户 / 岗位 ====================
import {
  getDepartmentTreeMock,
  getDepartmentListMock,
  addDepartmentMock,
  updateDepartmentMock,
  updateDepartmentStatusMock,
  deleteDepartmentMock,
  getUserListMock,
  getUserDetailMock,
  addUserMock,
  updateUserMock,
  deleteUserMock,
  batchDeleteUsersMock,
  updateUserStatusMock,
  moveUserMock
} from './organization'

import {
  getPositionListMock,
  addPositionMock,
  updatePositionMock,
  deletePositionMock
} from './position'

import {
  getExamSiteListMock,
  addExamSiteMock,
  updateExamSiteMock,
  updateExamSiteStatusMock,
  deleteExamSiteMock
} from './examSite'

import {
  getExternalCandidateListMock,
  addExternalCandidateMock,
  updateExternalCandidateMock,
  updateExternalCandidateStatusMock,
  resetExternalCandidatePasswordMock,
  deleteExternalCandidateMock,
  importExternalCandidatesMock
} from './externalCandidate'

// 部门
mockRoute('GET', '/admin/sys/department/tree', ({ params }) => getDepartmentTreeMock(params))
mockRoute('GET', '/admin/sys/department/list', ({ params }) => getDepartmentListMock(params))
mockRoute('POST', '/admin/sys/department/add', ({ data }) => addDepartmentMock(data))
mockRoute('PUT', '/admin/sys/department/update', ({ data }) => updateDepartmentMock(data.id, data))
mockRoute('PUT', '/admin/sys/department/update-status', ({ data }) =>
  updateDepartmentStatusMock(data.id, data.status)
)
mockRoute('DELETE', '/admin/sys/department/delete/:id', ({ url }) => {
  deleteDepartmentMock(extractId(url))
  return {}
})

// 用户
mockRoute('GET', '/admin/sys/user/list', ({ params }) => getUserListMock(params))
mockRoute('GET', '/admin/sys/user/detail/:id', ({ url }) => getUserDetailMock(extractId(url)))
mockRoute('POST', '/admin/sys/user/add', ({ data }) => addUserMock(data))
mockRoute('PUT', '/admin/sys/user/update', ({ data }) => updateUserMock(data.id, data))
mockRoute('PUT', '/admin/sys/user/update-status', ({ data }) =>
  updateUserStatusMock(data.id, data.status)
)
mockRoute('POST', '/admin/sys/user/batch-delete', ({ data }) => batchDeleteUsersMock(data?.ids))
mockRoute('POST', '/admin/sys/user/move', ({ data }) =>
  moveUserMock(data.userId, data.departmentId)
)
mockRoute('DELETE', '/admin/sys/user/delete/:id', ({ url }) => {
  deleteUserMock(extractId(url))
  return {}
})

// 岗位
mockRoute('GET', '/admin/sys/position/list', ({ params }) => getPositionListMock(params))
mockRoute('POST', '/admin/sys/position/add', ({ data }) => addPositionMock(data))
mockRoute('PUT', '/admin/sys/position/update', ({ data }) => updatePositionMock(data.id, data))
mockRoute('DELETE', '/admin/sys/position/delete/:id', ({ url }) => {
  deletePositionMock(extractId(url))
  return {}
})

// 考点
mockRoute('GET', '/admin/sys/exam-site/list', ({ params }) => getExamSiteListMock(params))
mockRoute('POST', '/admin/sys/exam-site/add', ({ data }) => addExamSiteMock(data))
mockRoute('PUT', '/admin/sys/exam-site/update', ({ data }) => updateExamSiteMock(data.id, data))
mockRoute('PUT', '/admin/sys/exam-site/update-status', ({ data }) =>
  updateExamSiteStatusMock(data.id, data.status)
)
mockRoute('DELETE', '/admin/sys/exam-site/delete/:id', ({ url }) => {
  deleteExamSiteMock(extractId(url))
  return {}
})

// 外部考生
mockRoute('GET', '/admin/exam/external-candidate/list', ({ params }) =>
  getExternalCandidateListMock(params)
)
mockRoute('POST', '/admin/exam/external-candidate/add', ({ data }) =>
  addExternalCandidateMock(data)
)
mockRoute('PUT', '/admin/exam/external-candidate/update', ({ data }) =>
  updateExternalCandidateMock(data.id, data)
)
mockRoute('PUT', '/admin/exam/external-candidate/update-status', ({ data }) =>
  updateExternalCandidateStatusMock(data.id, data.status)
)
mockRoute('PUT', '/admin/exam/external-candidate/reset-password', ({ data }) =>
  resetExternalCandidatePasswordMock(data.id)
)
mockRoute('POST', '/admin/exam/external-candidate/import', () => importExternalCandidatesMock())
mockRoute('DELETE', '/admin/exam/external-candidate/delete/:id', ({ url }) => {
  deleteExternalCandidateMock(extractId(url))
  return {}
})

// ==================== 权限管理：角色 / 菜单 ====================
import {
  getRoleListMock,
  getRoleDetailMock,
  addRoleMock,
  updateRoleMock,
  deleteRoleMock,
  batchDeleteRolesMock,
  updateRoleStatusMock,
  getRoleMenusMock,
  setRoleMenusMock,
  getMenuTreeMock,
  getMenuListMock,
  addMenuMock,
  updateMenuMock,
  deleteMenuMock,
  updateMenuStatusMock
} from './permission'

// 角色
mockRoute('GET', '/admin/sys/role/list', ({ params }) => getRoleListMock(params))
mockRoute('GET', '/admin/sys/role/detail/:id', ({ url }) => getRoleDetailMock(extractId(url)))
mockRoute('POST', '/admin/sys/role/add', ({ data }) => addRoleMock(data))
mockRoute('PUT', '/admin/sys/role/update', ({ data }) => updateRoleMock(data.id, data))
mockRoute('PUT', '/admin/sys/role/update-status', ({ data }) =>
  updateRoleStatusMock(data.id, data.status)
)
mockRoute('POST', '/admin/sys/role/batch-delete', ({ data }) => batchDeleteRolesMock(data?.ids))
mockRoute('GET', '/admin/sys/role/getMenus/:id', ({ url }) => getRoleMenusMock(extractId(url)))
mockRoute('POST', '/admin/sys/role/setMenus', ({ data }) =>
  setRoleMenusMock(data.roleId, data.menuIds)
)
mockRoute('DELETE', '/admin/sys/role/delete/:id', ({ url }) => {
  deleteRoleMock(extractId(url))
  return {}
})

// 菜单
mockRoute('GET', '/admin/sys/menu/tree', () => getMenuTreeMock())
mockRoute('GET', '/admin/sys/menu/list', () => getMenuListMock())
mockRoute('POST', '/admin/sys/menu/add', ({ data }) => addMenuMock(data))
mockRoute('PUT', '/admin/sys/menu/update', ({ data }) => updateMenuMock(data.id, data))
mockRoute('PUT', '/admin/sys/menu/update-status', ({ data }) =>
  updateMenuStatusMock(data.id, data.status)
)
mockRoute('DELETE', '/admin/sys/menu/delete/:id', ({ url }) => {
  deleteMenuMock(extractId(url))
  return {}
})

// ==================== 系统管理：参数配置 / AI模型配置 / 数据字典 / 操作日志 ====================
import { getParamConfigListMock, updateParamConfigMock } from './paramConfig'
import {
  getAiModelListMock,
  addAiModelMock,
  updateAiModelMock,
  deleteAiModelMock,
  enableAiModelMock,
  testAiModelMock
} from './aiModel'
import {
  getDictTypeListMock,
  getDictItemListMock,
  addDictItemMock,
  updateDictItemMock,
  deleteDictItemMock
} from './dataDict'
import { getOperationLogListMock } from './operationLog'

// 参数配置
mockRoute('GET', '/admin/sys/param-config/list', ({ params }) => getParamConfigListMock(params))
mockRoute('PUT', '/admin/sys/param-config/update', ({ data }) =>
  updateParamConfigMock(data.id, data.value)
)

// AI模型配置
mockRoute('GET', '/admin/sys/ai-model/list', ({ params }) => getAiModelListMock(params))
mockRoute('POST', '/admin/sys/ai-model/add', ({ data }) => addAiModelMock(data))
mockRoute('PUT', '/admin/sys/ai-model/update', ({ data }) => updateAiModelMock(data.id, data))
mockRoute('PUT', '/admin/sys/ai-model/enable', ({ data }) => enableAiModelMock(data.id))
mockRoute('POST', '/admin/sys/ai-model/test', ({ data }) => testAiModelMock(data.id))
mockRoute('DELETE', '/admin/sys/ai-model/delete/:id', ({ url }) => {
  deleteAiModelMock(extractId(url))
  return {}
})

// 数据字典
mockRoute('GET', '/admin/sys/dict/type/list', ({ params }) => getDictTypeListMock(params))
mockRoute('GET', '/admin/sys/dict/item/list', ({ params }) => getDictItemListMock(params))
mockRoute('POST', '/admin/sys/dict/item/add', ({ data }) => addDictItemMock(data))
mockRoute('PUT', '/admin/sys/dict/item/update', ({ data }) => updateDictItemMock(data.id, data))
mockRoute('DELETE', '/admin/sys/dict/item/delete/:id', ({ url }) => {
  deleteDictItemMock(extractId(url))
  return {}
})

// 操作日志
mockRoute('GET', '/admin/sys/operation-log/list', ({ params }) => getOperationLogListMock(params))
