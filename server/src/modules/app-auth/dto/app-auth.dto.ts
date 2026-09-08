import {
  IsNotEmpty,
  IsString,
  IsIn,
  MaxLength,
  Length,
  Matches,
  IsEmail,
  IsOptional,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** C 端用户类型：internal=内部员工（SysUser），external=外部考生（ExternalCandidate） */
export const APP_USER_TYPES = ['internal', 'external'] as const;

/** C 端用户类型联合类型 */
export type AppUserType = (typeof APP_USER_TYPES)[number];

/**
 * 考生端登录入参
 * account 的语义随 userType 变化：internal 时为统一身份账号（SysUser.username，
 * 实际等于工号），external 时为手机号（ExternalCandidate.phone）。
 * 统一成一个字段而非两个可选字段，避免同时传入或都不传的歧义状态。
 */
export class AppLoginDto {
  @ApiProperty({
    description: '登录账号：internal 传统一身份账号，external 传手机号',
    example: 'E0001',
  })
  @IsString()
  @IsNotEmpty({ message: '账号不能为空' })
  @MaxLength(100)
  account: string;

  @ApiProperty({ description: '密码', example: '123456' })
  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MaxLength(128)
  password: string;

  @ApiProperty({
    description: '用户类型：internal=石化员工，external=外部考生',
    enum: APP_USER_TYPES,
    example: 'internal',
  })
  @IsIn(APP_USER_TYPES, { message: '用户类型不合法' })
  userType: AppUserType;
}

/**
 * 考生端修改个人信息入参
 *
 * 只开放姓名、联系电话、电子邮箱三项：所属单位/部门由管理端维护，
 * 账号与用户类型不可自助变更，故均不在此 DTO 内（多传的字段由全局
 * ValidationPipe 的 whitelist 剥离，不会进入更新语句）。
 */
export class AppUpdateProfileDto {
  @ApiProperty({ description: '姓名', example: '张伟' })
  @IsString()
  @IsNotEmpty({ message: '姓名不能为空' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(2, 20, { message: '姓名长度须为 2-20 字' })
  name: string;

  @ApiProperty({ description: '联系电话（11 位手机号）', example: '13900010001' })
  @IsString()
  @IsNotEmpty({ message: '联系电话不能为空' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^1[3-9]\d{9}$/, { message: '请输入正确的手机号' })
  phone: string;

  @ApiProperty({ description: '电子邮箱（选填）', example: 'zhangwei@example.com', required: false })
  @IsOptional()
  // 空字符串代表「清空邮箱」，需在 IsEmail 之前放行，否则用户无法删除已填的邮箱
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, value) => value !== '' && value !== null && value !== undefined)
  @IsEmail({}, { message: '请输入正确的电子邮箱' })
  @MaxLength(50, { message: '电子邮箱长度不能超过 50 字' })
  email?: string;
}

/**
 * 考生端刷新 token 入参
 */
export class AppRefreshTokenDto {
  @ApiProperty({ description: '刷新 token' })
  @IsString()
  @IsNotEmpty({ message: 'refreshToken 不能为空' })
  refreshToken: string;
}
