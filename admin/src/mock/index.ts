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

// 部门
mockRoute('GET', '/admin/sys/department/tree', ({ params }) => getDepartmentTreeMock(params))
mockRoute('GET', '/admin/sys/department/list', ({ params }) => getDepartmentListMock(params))
mockRoute('POST', '/admin/sys/department/add', ({ data }) => addDepartmentMock(data))
mockRoute('PUT', '/admin/sys/department/update', ({ data }) => updateDepartmentMock(data.id, data))
mockRoute('PUT', '/admin/sys/department/update-status', ({ data }) => updateDepartmentStatusMock(data.id, data.status))
mockRoute('DELETE', '/admin/sys/department/delete/:id', ({ url }) => {
  deleteDepartmentMock(extractId(url))
  return {}
})

// 用户
mockRoute('GET', '/admin/sys/user/list', ({ params }) => getUserListMock(params))
mockRoute('GET', '/admin/sys/user/detail/:id', ({ url }) => getUserDetailMock(extractId(url)))
mockRoute('POST', '/admin/sys/user/add', ({ data }) => addUserMock(data))
mockRoute('PUT', '/admin/sys/user/update', ({ data }) => updateUserMock(data.id, data))
mockRoute('PUT', '/admin/sys/user/update-status', ({ data }) => updateUserStatusMock(data.id, data.status))
mockRoute('POST', '/admin/sys/user/batch-delete', ({ data }) => batchDeleteUsersMock(data?.ids))
mockRoute('POST', '/admin/sys/user/move', ({ data }) => moveUserMock(data.userId, data.departmentId))
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
mockRoute('PUT', '/admin/sys/role/update-status', ({ data }) => updateRoleStatusMock(data.id, data.status))
mockRoute('POST', '/admin/sys/role/batch-delete', ({ data }) => batchDeleteRolesMock(data?.ids))
mockRoute('GET', '/admin/sys/role/getMenus/:id', ({ url }) => getRoleMenusMock(extractId(url)))
mockRoute('POST', '/admin/sys/role/setMenus', ({ data }) => setRoleMenusMock(data.roleId, data.menuIds))
mockRoute('DELETE', '/admin/sys/role/delete/:id', ({ url }) => {
  deleteRoleMock(extractId(url))
  return {}
})

// 菜单
mockRoute('GET', '/admin/sys/menu/tree', () => getMenuTreeMock())
mockRoute('GET', '/admin/sys/menu/list', () => getMenuListMock())
mockRoute('POST', '/admin/sys/menu/add', ({ data }) => addMenuMock(data))
mockRoute('PUT', '/admin/sys/menu/update', ({ data }) => updateMenuMock(data.id, data))
mockRoute('PUT', '/admin/sys/menu/update-status', ({ data }) => updateMenuStatusMock(data.id, data.status))
mockRoute('DELETE', '/admin/sys/menu/delete/:id', ({ url }) => {
  deleteMenuMock(extractId(url))
  return {}
})

// ==================== 系统配置：基础配置 ====================
import { getBaseConfigMock, updateBaseConfigMock } from './system'

mockRoute('GET', '/admin/sys/base-config', () => getBaseConfigMock())
mockRoute('PUT', '/admin/sys/base-config', ({ data }) => updateBaseConfigMock(data))

// ==================== 系统配置：问题类型 ====================
import {
  getIssueTypeListMock,
  addIssueTypeMock,
  updateIssueTypeMock,
  deleteIssueTypeMock,
  updateIssueTypeStatusMock,
  getIssueTypeAuditorsMock
} from './issue-type'

mockRoute('GET', '/admin/sys/issue-type/list', ({ params }) => getIssueTypeListMock(params))
mockRoute('GET', '/admin/sys/issue-type/auditors', () => getIssueTypeAuditorsMock())
mockRoute('POST', '/admin/sys/issue-type/add', ({ data }) => addIssueTypeMock(data))
mockRoute('PUT', '/admin/sys/issue-type/update', ({ data }) => updateIssueTypeMock(data.id, data))
mockRoute('PUT', '/admin/sys/issue-type/update-status', ({ data }) =>
  updateIssueTypeStatusMock(data.id, data.status)
)
mockRoute('DELETE', '/admin/sys/issue-type/delete/:id', ({ url }) => {
  deleteIssueTypeMock(extractId(url))
  return {}
})

// ==================== 设备管理：设备分类 ====================
import {
  getCategoryTreeMock,
  getChecklistOptionsMock,
  addCategoryMock,
  updateCategoryMock,
  deleteCategoryMock,
  bindChecklistMock,
  importCategoriesMock,
  getCategoryExportDataMock
} from './equipment-category'

mockRoute('GET', '/admin/equipment/category/tree', ({ params }) => getCategoryTreeMock(params))
mockRoute('GET', '/admin/equipment/category/checklist-options', () => getChecklistOptionsMock())
mockRoute('GET', '/admin/equipment/category/export-data', () => getCategoryExportDataMock())
mockRoute('POST', '/admin/equipment/category/add', ({ data }) => addCategoryMock(data))
mockRoute('POST', '/admin/equipment/category/import', ({ data }) => importCategoriesMock(data?.rows))
mockRoute('PUT', '/admin/equipment/category/update', ({ data }) => updateCategoryMock(data.id, data))
mockRoute('PUT', '/admin/equipment/category/bind-checklist', ({ data }) =>
  bindChecklistMock(data.id, data.checklistId)
)
mockRoute('DELETE', '/admin/equipment/category/delete/:id', ({ url }) => {
  deleteCategoryMock(extractId(url))
  return {}
})

// ==================== 设备管理：厂商信息 ====================
import {
  getVendorListMock,
  addVendorMock,
  updateVendorMock,
  deleteVendorMock,
  batchDeleteVendorsMock,
  importVendorsMock,
  getVendorExportDataMock
} from './equipment-vendor'

mockRoute('GET', '/admin/equipment/vendor/list', ({ params }) => getVendorListMock(params))
mockRoute('GET', '/admin/equipment/vendor/export-data', ({ params }) => getVendorExportDataMock(params))
mockRoute('POST', '/admin/equipment/vendor/add', ({ data }) => addVendorMock(data))
mockRoute('POST', '/admin/equipment/vendor/batch-delete', ({ data }) => batchDeleteVendorsMock(data?.ids))
mockRoute('POST', '/admin/equipment/vendor/import', ({ data }) => importVendorsMock(data?.rows))
mockRoute('PUT', '/admin/equipment/vendor/update', ({ data }) => updateVendorMock(data.id, data))
mockRoute('DELETE', '/admin/equipment/vendor/delete/:id', ({ url }) => {
  deleteVendorMock(extractId(url))
  return {}
})

