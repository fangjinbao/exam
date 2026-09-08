import { ApiProperty } from '@nestjs/swagger';
import { APP_USER_TYPES, AppUserType } from '../dto/app-auth.dto';

/**
 * 考生端登录结果 VO
 */
export class AppLoginResultVo {
  @ApiProperty({ description: '访问 token' })
  token: string;

  @ApiProperty({ description: '刷新 token' })
  refreshToken: string;

  @ApiProperty({ description: '访问 token 过期秒数' })
  expire: number;

  @ApiProperty({
    description: '用户类型：internal=石化员工，external=外部考生',
    enum: APP_USER_TYPES,
  })
  userType: AppUserType;
}

/**
 * 考生端刷新 token 结果 VO
 */
export class AppRefreshResultVo {
  @ApiProperty({ description: '新的访问 token' })
  token: string;

  @ApiProperty({ description: '访问 token 过期秒数' })
  expire: number;
}

/**
 * 考生端个人信息 VO
 *
 * 两类用户（内部员工 / 外部考生）返回同一形状，字段语义不适用时为 null，
 * 由 userType 区分来源，前端无需按类型分支解析。
 *
 * 注意：password / passwordV 为敏感字段，不在 VO 中，service 的 select 白名单
 * 也不选取；外部考生的 idCard（身份证号）非展示所需，同样不返回。
 */
export class AppProfileVo {
  @ApiProperty({ description: '用户 ID（internal/external 各自独立自增，跨类型会重号）' })
  id: number;

  @ApiProperty({
    description: '用户类型：internal=石化员工，external=外部考生',
    enum: APP_USER_TYPES,
  })
  userType: AppUserType;

  @ApiProperty({ description: '登录账号：internal 为统一身份账号，external 为手机号' })
  account: string;

  @ApiProperty({ description: '姓名', nullable: true })
  name: string | null;

  @ApiProperty({ description: '手机号', nullable: true })
  phone: string | null;

  @ApiProperty({ description: '邮箱', nullable: true })
  email: string | null;

  @ApiProperty({ description: '头像 URL（外部考生恒为 null）', nullable: true })
  headImg: string | null;

  @ApiProperty({ description: '所属部门 ID（外部考生恒为 null）', nullable: true })
  departmentId: number | null;

  @ApiProperty({ description: '所属部门名称（外部考生恒为 null）', nullable: true })
  departmentName: string | null;

  @ApiProperty({ description: '所属外部单位 ID（内部员工恒为 null）', nullable: true })
  orgId: number | null;

  @ApiProperty({ description: '所属外部单位名称（内部员工恒为 null）', nullable: true })
  orgName: string | null;

  @ApiProperty({ description: '账号状态 1=启用 0=停用' })
  status: number;
}
