import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from './prisma.service';

/**
 * 种子数据初始化服务
 *
 * 编译进 dist，生产环境无需 ts-node 即可运行。
 * 幂等：所有写入用 upsert / 存在性检查，可重复执行。
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 执行种子数据初始化（超级管理员 + 默认角色 + 系统菜单） */
  async run(): Promise<void> {
    this.logger.log('开始初始化种子数据...');

    const password = await bcrypt.hash('123456', 12);

    const admin = await this.prisma.sysUser.upsert({
      where: { username: 'admin' },
      update: {},
      create: {
        username: 'admin',
        password,
        name: '超级管理员',
        nickName: 'Admin',
        status: 1,
        passwordV: 1,
      },
    });

    const adminRole = await this.prisma.sysRole.upsert({
      where: { label: 'admin' },
      update: {},
      create: {
        name: '管理员',
        label: 'admin',
        remark: '系统默认管理员角色',
        relevance: 1,
        status: 1,
      },
    });

    await this.prisma.sysUserRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
      update: {},
      create: { userId: admin.id, roleId: adminRole.id },
    });

    await this.seedMenus();
    await this.ensureSystemConfigMenu();
    await this.seedPositions();
    await this.seedBaseConfig();

    this.logger.log('种子数据初始化完成，请登录后立即修改默认管理员密码');
  }
  // PART_2

  /** 初始化基础配置参数（base.config.* 键值对）；已存在则跳过，幂等 */
  private async seedBaseConfig(): Promise<void> {
    const configs = [
      { keyName: 'base.config.sysName', name: '系统名称', data: '智慧厂区巡检平台' },
      { keyName: 'base.config.sysLogo', name: '系统Logo', data: '' },
      { keyName: 'base.config.sysDesc', name: '系统描述', data: '' },
      { keyName: 'base.config.timezone', name: '默认时区', data: '(UTC+08:00) 北京' },
      { keyName: 'base.config.dateFormat', name: '日期格式', data: 'YYYY-MM-DD' },
    ];
    for (const cfg of configs) {
      await this.prisma.sysParam.upsert({
        where: { keyName: cfg.keyName },
        update: {},
        create: cfg,
      });
    }
  }

  /** 初始化系统菜单（type: 0=目录 1=菜单 2=权限按钮）；已存在则跳过 */
  private async seedMenus(): Promise<void> {
    const existing = await this.prisma.sysMenu.count();
    if (existing > 0) {
      this.logger.log('菜单已存在，跳过菜单初始化');
      return;
    }

    // 组织管理
    const orgDir = await this.prisma.sysMenu.create({
      data: { name: '组织管理', type: 0, router: '/organization', icon: 'OfficeBuilding', orderNum: 1 },
    });
    await this.prisma.sysMenu.create({
      data: { name: '部门管理', type: 1, router: '/organization/department', perms: 'sys:department:list', orderNum: 1, parentId: orgDir.id },
    });
    await this.prisma.sysMenu.create({
      data: { name: '人员管理', type: 1, router: '/organization/user', perms: 'sys:user:list', orderNum: 2, parentId: orgDir.id },
    });
    await this.prisma.sysMenu.create({
      data: { name: '岗位管理', type: 1, router: '/organization/position', perms: 'sys:position:list', orderNum: 3, parentId: orgDir.id },
    });

    // 权限管理
    const permDir = await this.prisma.sysMenu.create({
      data: { name: '权限管理', type: 0, router: '/permission', icon: 'Lock', orderNum: 2 },
    });
    // 仅建目录与菜单（type 0/1）；按钮（type 2）由 PermsSyncService 启动时自动登记
    await this.prisma.sysMenu.create({
      data: { name: '角色管理', type: 1, router: '/permission/role', perms: 'sys:role:list', orderNum: 1, parentId: permDir.id },
    });
    await this.prisma.sysMenu.create({
      data: { name: '菜单管理', type: 1, router: '/permission/menu', perms: 'sys:menu:list', orderNum: 2, parentId: permDir.id },
    });

    this.logger.log('系统菜单已初始化（按钮权限由 PermsSyncService 自动登记）');
  }

  /**
   * 确保「系统配置」菜单存在（独立于 seedMenus 的整体跳过逻辑，按 router 幂等补建）
   * seedMenus 在库中已有菜单时整体跳过，故新增的系统配置菜单需单独按存在性补建，
   * 使存量库与全新库都能拿到该菜单。
   */
  private async ensureSystemConfigMenu(): Promise<void> {
    const existing = await this.prisma.sysMenu.findFirst({
      where: { router: '/system' },
      select: { id: true },
    });
    if (existing) return;

    // 目录 + 子菜单同事务创建，避免中途失败留下无子菜单的孤儿目录
    // （perms 与 SysConfigController @Perms('detail') 派生权限点一致）
    await this.prisma.$transaction(async (tx) => {
      const sysDir = await tx.sysMenu.create({
        data: { name: '系统配置', type: 0, router: '/system', icon: 'Setting', orderNum: 3 },
      });
      await tx.sysMenu.create({
        data: {
          name: '基础配置',
          type: 1,
          router: '/system/base-config',
          perms: 'sys:base-config:detail',
          orderNum: 1,
          parentId: sysDir.id,
        },
      });
    });
    this.logger.log('系统配置菜单已补建');
  }

  /** 初始化默认岗位数据（巡检员/维修工等）；已存在则跳过 */
  private async seedPositions(): Promise<void> {
    const existing = await this.prisma.sysPosition.count();
    if (existing > 0) {
      this.logger.log('岗位已存在，跳过岗位初始化');
      return;
    }

    await this.prisma.sysPosition.createMany({
      data: [
        { name: '巡检员', description: '负责日常设备巡检工作', orderNum: 1 },
        { name: '维修工', description: '负责设备维修保养工作', orderNum: 2 },
        { name: '安全员', description: '负责安全监督检查工作', orderNum: 3 },
        { name: '班组长', description: '负责班组日常管理工作', orderNum: 4 },
        { name: '部门经理', description: '负责部门整体管理工作', orderNum: 5 },
      ],
    });

    this.logger.log('默认岗位已初始化');
  }
}
