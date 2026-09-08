import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/common/prisma.service';
import { RedisService } from '@/common/redis.service';
import { AppUserType } from '../dto/app-auth.dto';
import { AppProfileVo } from '../vo/app-auth.vo';

/**
 * C 端（考生端）token 作用域标记
 * 与管理端的 'admin' 区分，写入 JWT payload 并由 AppAuthGuard 校验，
 * 确保两套 token 即使共用 JWT_SECRET 也不能互换使用。
 */
export const APP_TOKEN_SCOPE = 'app';

/** 账号或密码错误的统一文案：不区分「账号不存在」与「密码错误」，防账号枚举 */
const INVALID_CREDENTIAL_MESSAGE = '账号或密码错误';

/**
 * 视为「公司」的部门类型
 *
 * 取值与管理端「组织管理·部门管理」的部门类型下拉保持一致（省公司/分公司/部门）。
 * 内部员工的「所属单位」= 从其所在部门向上最近的公司节点。
 */
const COMPANY_DEPT_TYPES = ['省公司', '分公司'];

/** 部门树上溯的最大层数：兜底防止脏数据成环导致死循环 */
const MAX_DEPT_TREE_DEPTH = 20;

/**
 * 考生端认证服务
 *
 * 负责移动端（考生端）两类用户的登录、token 签发与刷新、登出、个人信息查询：
 * - internal：内部员工，来源组织管理·人员管理（SysUser），用 username 登录
 * - external：外部考生，来源外部考生管理（ExternalCandidate），用 phone 登录
 *
 * token 与 Redis key 使用 `app:` 命名空间并编入 userType，与管理端 `admin:` 完全隔离：
 * 同一个人在移动端登录不会顶掉管理后台会话，且两类用户各自独立自增的 id 不会撞号。
 */
@Injectable()
export class AppAuthService {
  private readonly logger = new Logger(AppAuthService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * 考生端登录
   * @param account 登录账号（internal 为 username，external 为 phone）
   * @param password 明文密码
   * @param userType 用户类型
   * @returns access token、refresh token、过期秒数及用户类型
   * @throws BadRequestException 账号不存在、密码错误或账号已停用
   */
  async login(account: string, password: string, userType: AppUserType) {
    const identity = await this.findIdentity(account, userType);

    // 账号不存在与密码错误返回同一文案，避免通过响应差异枚举有效账号
    if (!identity) {
      throw new BadRequestException(INVALID_CREDENTIAL_MESSAGE);
    }

    if (identity.status === 0) {
      throw new BadRequestException('账号已停用，请联系管理员');
    }

    const valid = await bcrypt.compare(password, identity.password);
    if (!valid) {
      throw new BadRequestException(INVALID_CREDENTIAL_MESSAGE);
    }

    return this.issueTokens(identity.id, userType, identity.passwordV);
  }

  /**
   * 刷新 access token
   * 校验 refresh token 的签名、scope、isRefresh 标记、Redis 留存及密码版本，
   * 通过后签发新的 access token。
   * @param refreshToken 客户端持有的 refresh token
   * @returns 新的 access token 及过期秒数
   * @throws BadRequestException token 无效或已失效
   */
  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken);

      // 必须是 C 端签发的 refresh token，管理端 token 或 access token 一律拒绝
      if (payload.scope !== APP_TOKEN_SCOPE || !payload.isRefresh) {
        throw new BadRequestException('token 无效');
      }

      const { userId, userType } = payload;
      const cached = await this.redis.get(this.refreshTokenKey(userType, userId));
      if (!cached || cached !== refreshToken) {
        throw new BadRequestException('token 已失效');
      }

      // 回源核对账号当前状态与密码版本：停用或已改密的账号不允许续期
      const identity = await this.findIdentityById(userId, userType);
      if (!identity || identity.status === 0 || identity.passwordV !== payload.passwordVersion) {
        throw new BadRequestException('token 已失效');
      }

      const accessExpire = this.getAccessExpire();
      const newToken = this.jwtService.sign(
        {
          userId,
          userType,
          passwordVersion: identity.passwordV,
          scope: APP_TOKEN_SCOPE,
        },
        { expiresIn: accessExpire },
      );
      await this.redis.set(this.tokenKey(userType, userId), newToken, accessExpire);

      return { token: newToken, expire: accessExpire };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('token 无效');
    }
  }

  /**
   * 考生端登出
   * 仅清除 `app:` 命名空间下的缓存，不影响该用户可能存在的管理后台会话。
   * @param userId 用户 ID
   * @param userType 用户类型
   */
  async logout(userId: number, userType: AppUserType) {
    await this.redis.del(this.tokenKey(userType, userId));
    await this.redis.del(this.refreshTokenKey(userType, userId));
    await this.redis.del(this.passwordVersionKey(userType, userId));
  }

  /**
   * 获取当前登录考生的个人信息
   * 两类用户归一为同一结构返回，不适用的字段置 null。
   * @param userId 用户 ID
   * @param userType 用户类型
   * @returns 个人信息；账号已不存在时返回 null
   */
  /**
   * 沿部门树上溯，找到离该部门最近的公司节点（即员工的「所属单位」）
   *
   * 内部员工的组织结构只有 SysDepartment 一张树表（type 取值：省公司/分公司/部门），
   * 没有独立的公司表，因此「所属单位」只能由部门反查：
   * 自身即公司则直接返回，否则逐级向上找第一个公司类型的祖先。
   *
   * 逐级查询而非一次性取全表：部门树通常只有 3-4 层，循环次数远小于全表扫描；
   * 同时用 visited 集合与 MAX_DEPT_TREE_DEPTH 双重兜底，避免 parentId 脏数据成环时死循环。
   *
   * @param department 员工所在部门（含 id/name/type/parentId），未挂部门时为 null
   * @returns 最近的公司节点；未挂部门或树上没有公司节点时返回 null
   */
  private async resolveCompanyOfDepartment(
    department: { id: number; name: string; type: string | null; parentId: number | null } | null,
  ): Promise<{ id: number; name: string } | null> {
    if (!department) return null;

    let current = department;
    // 记录已访问节点，parentId 成环时立即中断而不是耗到深度上限
    const visited = new Set<number>([current.id]);

    for (let depth = 0; depth < MAX_DEPT_TREE_DEPTH; depth += 1) {
      if (current.type && COMPANY_DEPT_TYPES.includes(current.type)) {
        return { id: current.id, name: current.name };
      }
      if (current.parentId === null) break;
      if (visited.has(current.parentId)) {
        this.logger.warn(
          `部门树存在环：部门 ${current.id} 的 parentId ${current.parentId} 已访问过，停止上溯`,
        );
        break;
      }

      const parent = await this.prisma.sysDepartment.findUnique({
        where: { id: current.parentId },
        select: { id: true, name: true, type: true, parentId: true },
      });
      // 父节点被删但子节点未清理，视为断链，按「查不到公司」处理
      if (!parent) break;

      visited.add(parent.id);
      current = parent;
    }

    return null;
  }

  /**
   * 修改个人信息
   *
   * 只允许改姓名、联系电话、电子邮箱三项，其余字段（账号、单位、部门、状态）
   * 由管理端维护，考生端不提供入口。
   *
   * 手机号对外部考生而言就是登录账号，因此改号前必须查重：
   * 若与他人重复会直接导致两人登录冲突。内部员工的手机号仅为联系方式，
   * 但同样查重，避免后续以手机号找回密码时无法定位唯一账号。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型，决定更新哪张表
   * @param data 待更新的字段
   * @returns 更新后的完整个人信息
   * @throws BadRequestException 手机号已被占用，或账号已不存在
   */
  async updateProfile(
    userId: number,
    userType: AppUserType,
    data: { name: string; phone: string; email?: string },
  ): Promise<AppProfileVo> {
    // 空字符串按「清空」处理，存 null 而不是空串，与库内其他可空字段保持一致
    const email = data.email === '' || data.email === undefined ? null : data.email;

    if (userType === 'internal') {
      const existing = await this.prisma.sysUser.findFirst({
        where: { phone: data.phone, id: { not: userId } },
        select: { id: true },
      });
      if (existing) {
        throw new BadRequestException('该手机号已被其他账号使用');
      }

      const updated = await this.prisma.sysUser.update({
        where: { id: userId },
        data: { name: data.name, phone: data.phone, email },
        select: { id: true },
      });
      // 复用 getProfile 拼装返回值，避免两处各写一遍字段映射与公司上溯逻辑
      const profile = await this.getProfile(updated.id, userType);
      if (!profile) throw new BadRequestException('账号不存在或已被删除');
      return profile;
    }

    // 外部考生：手机号即登录账号，重复会导致登录时无法定位唯一账号
    const existing = await this.prisma.externalCandidate.findFirst({
      where: { phone: data.phone, id: { not: userId } },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('该手机号已被其他考生使用');
    }

    const updated = await this.prisma.externalCandidate.update({
      where: { id: userId },
      data: { name: data.name, phone: data.phone, email },
      select: { id: true },
    });
    const profile = await this.getProfile(updated.id, userType);
    if (!profile) throw new BadRequestException('账号不存在或已被删除');
    return profile;
  }

  async getProfile(userId: number, userType: AppUserType): Promise<AppProfileVo | null> {
    if (userType === 'internal') {
      const user = await this.prisma.sysUser.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          name: true,
          nickName: true,
          headImg: true,
          phone: true,
          email: true,
          status: true,
          departmentId: true,
          department: { select: { id: true, name: true, type: true, parentId: true } },
        },
      });
      if (!user) return null;

      // 内部员工无独立单位表，「所属单位」需从所在部门沿 parentId 上溯到最近的公司节点
      const company = await this.resolveCompanyOfDepartment(user.department);

      return {
        id: user.id,
        userType,
        account: user.username,
        name: user.name || user.nickName || null,
        phone: user.phone,
        email: user.email,
        headImg: user.headImg,
        departmentId: user.departmentId,
        departmentName: user.department?.name ?? null,
        orgId: company?.id ?? null,
        orgName: company?.name ?? null,
        status: user.status,
      };
    }

    const candidate = await this.prisma.externalCandidate.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        orgId: true,
        org: { select: { name: true } },
      },
    });
    if (!candidate) return null;

    return {
      id: candidate.id,
      userType,
      account: candidate.phone,
      name: candidate.name,
      phone: candidate.phone,
      email: candidate.email,
      headImg: null,
      departmentId: null,
      departmentName: null,
      orgId: candidate.orgId,
      orgName: candidate.org?.name ?? null,
      status: candidate.status,
    };
  }

  /**
   * 按账号查询身份（含密码哈希，仅供登录校验内部使用）
   *
   * 注意：这里必须显式取出 password/passwordV 以做 bcrypt 比对，
   * 这两个字段仅在本方法与 login 内部流转，不写入 token/Redis/响应。
   * @param account 登录账号
   * @param userType 用户类型
   * @returns 身份信息，不存在时返回 null
   */
  private async findIdentity(account: string, userType: AppUserType) {
    if (userType === 'internal') {
      return this.prisma.sysUser.findUnique({
        where: { username: account },
        select: { id: true, password: true, passwordV: true, status: true },
      });
    }
    return this.prisma.externalCandidate.findUnique({
      where: { phone: account },
      select: { id: true, password: true, passwordV: true, status: true },
    });
  }

  /**
   * 按 ID 查询身份状态与密码版本（供刷新 token 时回源校验）
   * @param userId 用户 ID
   * @param userType 用户类型
   * @returns 状态与密码版本，不存在时返回 null
   */
  private async findIdentityById(userId: number, userType: AppUserType) {
    if (userType === 'internal') {
      return this.prisma.sysUser.findUnique({
        where: { id: userId },
        select: { passwordV: true, status: true },
      });
    }
    return this.prisma.externalCandidate.findUnique({
      where: { id: userId },
      select: { passwordV: true, status: true },
    });
  }

  /**
   * 签发 access/refresh token 并写入 Redis
   * @param userId 用户 ID
   * @param userType 用户类型
   * @param passwordV 当前密码版本
   * @returns 登录结果
   */
  private async issueTokens(userId: number, userType: AppUserType, passwordV: number) {
    const payload = {
      userId,
      userType,
      passwordVersion: passwordV,
      scope: APP_TOKEN_SCOPE,
    };

    // configService.get 运行时返回字符串，必须转数字：
    // 否则 jsonwebtoken 会把 "7200" 当 ms 时间串解析为 7.2 秒（与 admin 侧同一处理）
    const accessExpire = this.getAccessExpire();
    const refreshExpire = Number(
      this.configService.get<number>('JWT_REFRESH_EXPIRE', 1296000),
    );

    const token = this.jwtService.sign(payload, { expiresIn: accessExpire });
    const refreshToken = this.jwtService.sign(
      { ...payload, isRefresh: true },
      { expiresIn: refreshExpire },
    );

    await this.redis.set(this.tokenKey(userType, userId), token, accessExpire);
    await this.redis.set(
      this.refreshTokenKey(userType, userId),
      refreshToken,
      refreshExpire,
    );
    await this.redis.set(
      this.passwordVersionKey(userType, userId),
      String(passwordV),
      refreshExpire,
    );

    this.logger.log(`考生端登录成功 userType=${userType} userId=${userId}`);

    return { token, refreshToken, expire: accessExpire, userType };
  }

  /** access token 过期秒数 */
  private getAccessExpire(): number {
    return Number(this.configService.get<number>('JWT_ACCESS_EXPIRE', 7200));
  }

  /** access token 缓存 key */
  private tokenKey(userType: AppUserType, userId: number): string {
    return `app:token:${userType}:${userId}`;
  }

  /** refresh token 缓存 key */
  private refreshTokenKey(userType: AppUserType, userId: number): string {
    return `app:refreshToken:${userType}:${userId}`;
  }

  /** 密码版本缓存 key */
  private passwordVersionKey(userType: AppUserType, userId: number): string {
    return `app:passwordVersion:${userType}:${userId}`;
  }
}
