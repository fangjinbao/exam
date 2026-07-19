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
    await this.seedNavMenus();
    await this.seedPositions();
    await this.seedParamConfig();
    await this.seedAiModel();
    await this.seedDict();

    this.logger.log('种子数据初始化完成，请登录后立即修改默认管理员密码');
  }
  // PART_2

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
   * 初始化导航菜单：系统管理、外部考生管理、考点管理
   *
   * 与 seedMenus 分开：seedMenus 仅在空库时整体初始化，无法为已建库补菜单；
   * 本方法按 router 幂等 upsert（router 无库级唯一约束，用 findFirst 兜底），可安全重复执行。
   * 同时清理历史遗留的「系统配置/基础配置」菜单（base-config 控制器已下线，且与 /system 冲突）。
   */
  private async seedNavMenus(): Promise<void> {
    // 1) 清理失效菜单：base-config 按钮 + 基础配置菜单 + 旧 /system 目录（名为「系统配置」）
    await this.prisma.sysMenu.deleteMany({ where: { perms: { startsWith: 'sys:base-config:' } } });
    await this.prisma.sysMenu.deleteMany({ where: { router: '/system', name: '系统配置' } });

    // 按 router 幂等创建目录/菜单：存在则按需回填字段，不存在则新建；返回节点
    const ensure = async (data: {
      name: string;
      type: number;
      router: string;
      perms?: string;
      icon?: string;
      orderNum: number;
      parentId?: number;
    }) => {
      const found = await this.prisma.sysMenu.findFirst({ where: { router: data.router } });
      if (found) {
        return this.prisma.sysMenu.update({
          where: { id: found.id },
          // 「声明即状态」幂等：未传的 icon/perms/parentId 显式回落 null，清除旧记录残留
          // （如子菜单由一级菜单降级而来时，需清掉原一级菜单的 icon）
          data: {
            name: data.name,
            type: data.type,
            perms: data.perms ?? null,
            icon: data.icon ?? null,
            orderNum: data.orderNum,
            parentId: data.parentId ?? null,
          },
        });
      }
      return this.prisma.sysMenu.create({ data });
    };
    // 2) 系统管理目录 + 子菜单（视图路径 views/system/* 与 router 层级一致，前端可直接命中）
    const sysDir = await ensure({ name: '系统管理', type: 0, router: '/system', icon: 'Setting', orderNum: 3 });
    await ensure({ name: '参数配置', type: 1, router: '/system/param-config', perms: 'sys:param-config:list', orderNum: 1, parentId: sysDir.id });
    await ensure({ name: 'AI模型配置', type: 1, router: '/system/ai-model', perms: 'sys:ai-model:list', orderNum: 2, parentId: sysDir.id });
    await ensure({ name: '数据字典', type: 1, router: '/system/data-dict', perms: 'sys:dict:type:list', orderNum: 3, parentId: sysDir.id });
    await ensure({ name: '操作日志', type: 1, router: '/system/operation-log', perms: 'sys:operation-log:list', orderNum: 4, parentId: sysDir.id });

    // 3) 外部考生管理：目录 + 「外部单位」「外部考生」两个子菜单
    //    历史上 /external-candidate 曾是一级单页菜单（type1 无父），此处改造为目录下子菜单：
    //    - 新建目录 /external（type0，套 Layout），承载两个子页
    //    - 子菜单 router 与前端 views 目录一致：/external-org → views/external-org，/external-candidate → views/external-candidate
    //    ensure 按 router 幂等：旧 /external-candidate 记录会被回填 parentId 并挂到目录下，其下按钮权限随父菜单 id 保留
    const externalDir = await ensure({ name: '外部考生管理', type: 0, router: '/external', icon: 'User', orderNum: 4 });
    await ensure({ name: '外部单位管理', type: 1, router: '/external-org', perms: 'exam:external-org:list', orderNum: 1, parentId: externalDir.id });
    await ensure({ name: '外部考生管理', type: 1, router: '/external-candidate', perms: 'exam:external-candidate:list', orderNum: 2, parentId: externalDir.id });

    // 4) 考点管理：单页一级菜单（type1 无父目录，视图为顶层单页）
    await ensure({ name: '考点管理', type: 1, router: '/exam-site', perms: 'sys:exam-site:list', icon: 'Location', orderNum: 5 });

    // 5) 题库管理：目录 + 「知识点分类」子菜单（router 与前端 views/question-bank 层级一致）
    const questionBankDir = await ensure({ name: '题库管理', type: 0, router: '/question-bank', icon: 'Collection', orderNum: 2 });
    await ensure({ name: '知识点分类', type: 1, router: '/question-bank/knowledge-point', perms: 'exam:knowledge-point:list', orderNum: 1, parentId: questionBankDir.id });

    this.logger.log('导航菜单（系统管理/外部考生/考点/题库）已初始化');
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

  /** 初始化参数配置（业务可调参数）；已存在则跳过 */
  private async seedParamConfig(): Promise<void> {
    const existing = await this.prisma.sysParamConfig.count();
    if (existing > 0) {
      this.logger.log('参数配置已存在，跳过初始化');
      return;
    }
    await this.prisma.sysParamConfig.createMany({
      data: [
        { name: '录像保留期限(天)', value: '30', description: '监考录像的自动保留天数，超期后系统自动清理，取值范围 1-365', valueType: 'int', minValue: 1, maxValue: 365 },
        { name: '考试自动交卷提前提醒时间(分钟)', value: '5', description: '考试结束前多少分钟提醒考生交卷，取值范围 1-30', valueType: 'int', minValue: 1, maxValue: 30 },
        { name: '登录密码最小长度', value: '8', description: '用户登录密码的最小字符数，取值范围 6-20', valueType: 'int', minValue: 6, maxValue: 20 },
        { name: '单次AI出题最大数量', value: '20', description: '单次调用AI出题可生成的题目上限，取值范围 1-100', valueType: 'int', minValue: 1, maxValue: 100 },
        { name: '操作日志保留期限(天)', value: '90', description: '操作日志的自动保留天数，超期后系统自动清理，取值范围 30-730', valueType: 'int', minValue: 30, maxValue: 730 },
      ],
    });
    this.logger.log('参数配置已初始化');
  }

  /** 初始化 AI 模型配置；已存在则跳过 */
  private async seedAiModel(): Promise<void> {
    const existing = await this.prisma.sysAiModel.count();
    if (existing > 0) {
      this.logger.log('AI 模型配置已存在，跳过初始化');
      return;
    }
    await this.prisma.sysAiModel.createMany({
      data: [
        { name: 'OpenAI-示例', provider: 'OpenAI', model: 'gpt-4o', apiUrl: 'https://api.openai.com/v1', apiKey: '', status: 0, connStatus: 'unknown' },
        { name: 'Anthropic-示例', provider: 'Anthropic', model: 'claude-sonnet-4-20250514', apiUrl: 'https://api.anthropic.com/v1', apiKey: '', status: 0, connStatus: 'unknown' },
      ],
    });
    this.logger.log('AI 模型配置已初始化');
  }

  /** 初始化数据字典（类型 + 字典项）；已存在则跳过 */
  private async seedDict(): Promise<void> {
    const existing = await this.prisma.dictType.count();
    if (existing > 0) {
      this.logger.log('数据字典已存在，跳过初始化');
      return;
    }
    // 类型：name→前端 typeName，key→前端 typeCode
    const types = [
      { key: 'question_type', name: '题型' },
      { key: 'difficulty', name: '难度' },
      { key: 'event_type', name: '事件类型' },
      { key: 'operation_type', name: '操作类型' },
    ];
    const keyToId: Record<string, number> = {};
    for (const t of types) {
      const created = await this.prisma.dictType.create({ data: t });
      keyToId[t.key] = created.id;
    }
    // 字典项：orderNum→前端 sort，referenced 标记引用保护
    const items = [
      { key: 'question_type', name: '单选题', value: 'single', orderNum: 1, status: 1, referenced: true },
      { key: 'question_type', name: '多选题', value: 'multiple', orderNum: 2, status: 1, referenced: true },
      { key: 'question_type', name: '判断题', value: 'judge', orderNum: 3, status: 1, referenced: false },
      { key: 'question_type', name: '填空题', value: 'blank', orderNum: 4, status: 1, referenced: false },
      { key: 'question_type', name: '问答题', value: 'qa', orderNum: 5, status: 1, referenced: false },
      { key: 'question_type', name: '论述题', value: 'essay', orderNum: 6, status: 0, referenced: false },
      { key: 'difficulty', name: '简单', value: 'easy', orderNum: 1, status: 1, referenced: true },
      { key: 'difficulty', name: '中等', value: 'medium', orderNum: 2, status: 1, referenced: false },
      { key: 'difficulty', name: '困难', value: 'hard', orderNum: 3, status: 1, referenced: false },
      { key: 'event_type', name: '切屏', value: 'switch_screen', orderNum: 1, status: 1, referenced: false },
      { key: 'event_type', name: '离屏', value: 'leave_screen', orderNum: 2, status: 1, referenced: false },
      { key: 'event_type', name: '人脸不匹配', value: 'face_mismatch', orderNum: 3, status: 1, referenced: false },
      { key: 'event_type', name: '多屏', value: 'multi_screen', orderNum: 4, status: 1, referenced: false },
      { key: 'event_type', name: '其他', value: 'other', orderNum: 5, status: 1, referenced: false },
      { key: 'operation_type', name: '新增', value: 'create', orderNum: 1, status: 1, referenced: false },
      { key: 'operation_type', name: '编辑', value: 'update', orderNum: 2, status: 1, referenced: false },
      { key: 'operation_type', name: '删除', value: 'delete', orderNum: 3, status: 1, referenced: false },
      { key: 'operation_type', name: '登录', value: 'login', orderNum: 4, status: 1, referenced: false },
    ];
    await this.prisma.dictInfo.createMany({
      data: items.map(({ key, ...rest }) => ({ ...rest, typeId: keyToId[key] })),
    });
    this.logger.log('数据字典已初始化');
  }
}
