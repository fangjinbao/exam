import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { stripHtml } from './utils/rich-text.util';
import { PrismaService } from './prisma.service';
import {
  CERT_TEMPLATE_SNAPSHOT_SELECT,
  buildCertTemplateSnapshot,
} from '@/modules/exam/utils/cert-template-snapshot';

/**
 * 演示证书模板的默认版式（A4 竖版画布 420×594，与设计器 CANVAS_SIZE[2] 一致）
 *
 * 不给版式的模板在考生端会退化成纯字段清单（CertificateDetail.vue 的 hasLayout
 * 为假时走回退卡片），演示模板因此演示不出证书该有的样子。这里预置一份可直接
 * 渲染的排版，管理端「设计」入口仍可在此基础上改。
 *
 * 坐标单位为画布内像素；x 为元素左上角，align 在 width 范围内生效。
 * fieldKey 取值须在 FIELD_OPTIONS 内（certTitle/issuingOrg/candidateName/
 * certNo/projectName/issueDate/expireDate），写错会被服务端解析成空串并剔除。
 * seal 元素在模板未上传印章图时不渲染，预留位置便于后续上传即生效。
 */
/**
 * 演示证书模板名（seed 与回填脚本共用同一常量）
 *
 * 回填脚本据此精确匹配目标模板。不可放宽成「名称包含演示」之类的模糊匹配：
 * 用户自建的、名字里恰好含「演示」且尚未设计版式的模板会被写入下面这份
 * 特种作业证书专用文案。
 */
export const DEMO_CERT_TEMPLATE_NAME = '【演示】特种作业操作证书模板';

export const DEMO_CERT_LAYOUT = {
  /*
    「这份版式由 seed 生成、未经人工编辑」的标记，供回填脚本判断能否安全覆盖。
    不靠元素 id 前缀推断：设计器的 parseContent 会保留原 id，人工改完保存后
    id 仍是 seed_ 前缀，按前缀判断会把人工排版误判成 seed 版式而覆盖掉。
    设计器存盘只序列化 { elements }（见 stringifyContent），因此只要有人在
    设计器里保存过，这个标记就会消失 —— 正好是可靠的「已被人工接管」信号。
  */
  origin: 'seed',
  elements: [
    // 主标题
    e('seed_title', 'field', 40, 68, 340, 30, { bold: true, fieldKey: 'certTitle' }),
    // 「兹证明」+ 姓名（姓名带下划线，模拟填写栏）
    e('seed_lead', 'text', 40, 152, 340, 16, { text: '兹 证 明', color: '#333333' }),
    e('seed_name', 'field', 110, 190, 200, 24, {
      bold: true,
      underline: true,
      fieldKey: 'candidateName',
    }),
    /*
      项目名在结论句之前，且结论句不提「认证项目」：
      独立发证（考试只挂模板、不挂认证项目）时 projectName 为空串，会被
      buildCertElements 剔掉，此时若结论句写成「参加下列认证项目考核…」
      就会指向一片空白。现在两种情形都读得通，缺项只表现为一处纵向留白。
    */
    e('seed_project', 'field', 40, 242, 340, 17, { bold: true, fieldKey: 'projectName' }),
    e('seed_body', 'text', 40, 286, 340, 14, {
      text: '经考核成绩合格，特发此证。',
      color: '#333333',
    }),
    // 明细区：标签右对齐、取值左对齐，形成两列
    e('seed_no_label', 'text', 68, 362, 90, 13, {
      text: '证书编号',
      color: '#555555',
      align: 'right',
    }),
    e('seed_no', 'field', 172, 362, 180, 13, { align: 'left', fieldKey: 'certNo' }),
    e('seed_issue_label', 'text', 68, 392, 90, 13, {
      text: '颁发日期',
      color: '#555555',
      align: 'right',
    }),
    e('seed_issue', 'field', 172, 392, 180, 13, { align: 'left', fieldKey: 'issueDate' }),
    e('seed_expire_label', 'text', 68, 422, 90, 13, {
      text: '有效期至',
      color: '#555555',
      align: 'right',
    }),
    e('seed_expire', 'field', 172, 422, 180, 13, { align: 'left', fieldKey: 'expireDate' }),
    // 落款与印章位：印章压在机构名上，与纸质证书的盖章位置一致
    e('seed_org', 'field', 120, 500, 240, 16, {
      bold: true,
      align: 'right',
      fieldKey: 'issuingOrg',
    }),
    e('seed_seal', 'seal', 252, 462, 96, 24, {}),
  ],
};

/**
 * 版式元素构造器：把重复的默认值（颜色、加粗、对齐）收在一处，
 * 让上面的版式定义只写与默认值不同的部分，便于人工核对坐标
 *
 * @param id 元素 id（用固定值而非时间戳，保证多次 seed 产出同一份版式便于比对）
 * @param type 元素类型 text 静态文案 / field 占位符 / seal 印章位
 * @param x 左上角 X（画布内 px）
 * @param y 左上角 Y（画布内 px）
 * @param width 元素宽度（px）
 * @param fontSize 字号（px；seal 忽略）
 * @param extra 覆盖项：静态文案 text、占位符 fieldKey、颜色、加粗、下划线、对齐
 */
function e(
  id: string,
  type: 'text' | 'field' | 'seal',
  x: number,
  y: number,
  width: number,
  fontSize: number,
  extra: {
    text?: string;
    fieldKey?: string;
    color?: string;
    bold?: boolean;
    underline?: boolean;
    align?: 'left' | 'center' | 'right';
  },
) {
  return {
    id,
    type,
    x,
    y,
    width,
    fontSize,
    color: extra.color ?? '#1a1a1a',
    bold: extra.bold ?? false,
    underline: extra.underline ?? false,
    align: extra.align ?? 'center',
    ...(extra.text !== undefined ? { text: extra.text } : {}),
    ...(extra.fieldKey !== undefined ? { fieldKey: extra.fieldKey } : {}),
  };
}

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
    await this.seedRoles();
    await this.seedParamConfig();
    await this.seedAiModel();
    await this.seedDict();
    await this.seedDepartments();
    await this.seedEmployees();
    await this.seedBulkEmployees();
    await this.seedExternalOrgs();
    await this.seedExternalCandidates();
    await this.seedExamSites();
    await this.seedCertOccupations();
    await this.seedQuestionBanks();
    await this.seedDemoData(admin.id);
    await this.seedAppHomeDemoData(admin.id);

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
      data: { name: '组织管理', type: 0, router: '/organization', icon: 'OfficeBuilding', orderNum: 12, declVersion: 2 },
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
      data: { name: '权限管理', type: 0, router: '/permission', icon: 'Lock', orderNum: 13, declVersion: 2 },
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
   *
   * 公开给 BootstrapService 每次启动单独调用，理由同 syncDict：菜单是代码里定死的
   * 导航结构，新增一个模块必须能进到已有库里。此前本方法只挂在 run() 里，而 run()
   * 被「已有用户则跳过」整体挡掉，导致这套幂等 upsert 在任何已建库上都是死代码——
   * 表现就是新加的菜单在侧边栏死活不出现，且没有任何报错。
   * 同时清理历史遗留的「系统配置/基础配置」菜单（base-config 控制器已下线，且与 /system 冲突）。
   */
  async seedNavMenus(): Promise<void> {
    // 1) 清理失效菜单：base-config 按钮 + 基础配置菜单 + 旧 /system 目录（名为「系统配置」）
    await this.prisma.sysMenu.deleteMany({ where: { perms: { startsWith: 'sys:base-config:' } } });
    await this.prisma.sysMenu.deleteMany({ where: { router: '/system', name: '系统配置' } });

    /*
      1.0) 清理旧监考中心的残留：子页菜单 + 监考安排/异常事件/录像回放的按钮权限

      ⚠️ 范围必须是 '/proctor/'（带斜杠）而非 '/proctor'：
      监考中心已于本次重建，新菜单的 router 是 '/proctor' 与 '/proctor-workspace'，
      而本方法每次启动都执行、下面又会 ensure 出这两行。若按 '/proctor' 前缀删，
      就变成「每次启动先删掉上次建的，再以新自增 id 重建」，后果有两个：
        - SysRoleMenu.menuId 是级联删除，管理员给角色勾上的监考中心授权每次重启都被清空；
        - perms-sync 建的按钮是 type=2 / router=null，NULL LIKE '/proctor%' 不匹配、删不掉，
          但它们的 parentId 还指向已删除的旧菜单 id，而 perms-sync 见 perm 已存在就跳过、
          不会改 parentId —— exam:proctor:* 三个按钮从第二次启动起永久悬空，
          getUserMenuTree 按 parentId 归集按钮，authList 恒空，前端按钮再也不出现。
      旧模块的子页 router 形如 '/proctor/assignment'，带斜杠即可精确命中且不误伤新菜单。
      旧的 '/proctor' 目录行（type=0）不必删：ensure 按 router 命中后会把 type 回写为 1。
    */
    await this.prisma.sysMenu.deleteMany({ where: { router: { startsWith: '/proctor/' } } });
    for (const prefix of ['exam:proctor-assignment:', 'exam:abnormal-event:', 'exam:exam-recording:']) {
      await this.prisma.sysMenu.deleteMany({ where: { perms: { startsWith: prefix } } });
    }
    await this.repairOrphanProctorButtons();

    // 1.1) 清理只读/受限台账控制器不应存在的写权限按钮（历史 perms-sync 可能已登记）。
    //   报考审核/证书发放为只读或受限台账，其 add/update/update-status/delete/batch-delete
    //   路由已在控制器层屏蔽（子类覆盖且不加装饰器→不注册路由），但早期版本曾无条件继承基类写接口并被
    //   perms-sync 登记为按钮。perms-sync 只增不删，故此处显式清除残留，避免角色管理误勾选已下线的危险权限。
    //   认证项目为可管理实体，仅清除其不支持的 batch-delete（删除须逐个走 ensureDeletable 报考保护）。
    await this.prisma.sysMenu.deleteMany({
      where: {
        type: 2,
        perms: {
          in: [
            'exam:cert-application:add', 'exam:cert-application:update', 'exam:cert-application:update-status', 'exam:cert-application:delete', 'exam:cert-application:batch-delete',
            'exam:certificate:add', 'exam:certificate:update', 'exam:certificate:update-status', 'exam:certificate:delete', 'exam:certificate:batch-delete',
            // 认证项目：批量删除须逐个走 ensureDeletable 的报考保护，不支持；
            // 启用/停用与「未发布↔已发布」重叠且已被撤回取代，留着会把项目改成
            // status=0 而界面上再无处恢复，故一并下线
            'exam:cert-project:batch-delete', 'exam:cert-project:update-status',
            // 练习：状态只能走 publish/withdraw/finish，通用改状态接口已在控制器屏蔽
            'exam:practice:update-status',
            // 自主练习：配置以 bankId 为主体读写（config/toggle），基类通用 CRUD 已全部屏蔽
            'exam:self-practice:add', 'exam:self-practice:update-status', 'exam:self-practice:detail', 'exam:self-practice:batch-delete',
          ],
        },
      },
    });

    // 按 router 幂等创建目录/菜单：存在则按需回填字段，不存在则新建；返回节点
    const ensure = async (data: {
      name: string;
      type: number;
      router: string;
      perms?: string;
      icon?: string;
      orderNum: number;
      parentId?: number;
      isShow?: number;
      keepAlive?: number;
      /**
       * 声明版本号，默认 0
       *
       * 需要把外观字段（名称/图标/排序/显隐/缓存）下发到已建库时，把它加一。
       * 不写或不改，则已存在的菜单保留管理员的手工调整。
       */
      declVersion?: number;
    }) => {
      const found = await this.prisma.sysMenu.findFirst({ where: { router: data.router } });
      if (found) {
        /*
          结构字段每次回写，外观字段按版本号门控。

          本方法每次启动都执行（BootstrapService.syncNavMenus），两种极端都不可取：
          - 全字段无条件回写：管理员在菜单管理页的改名/换图标/调序/隐藏，重启即被静默还原；
          - 一律不回写：代码里新调的排序对已建库永久无效，改了图标线上也永不更新。

          故分两类处理：
          - 结构字段（type/perms/parentId）始终回写。它们错了会导致路由挂不上或鉴权错位，
            属于「页面打不开」级别，必须由代码兜住，管理员也没有正当理由改它们。
          - 外观字段（name/icon/orderNum/isShow/keepAlive）仅当声明版本高于库中值时回写，
            回写后把 declVersion 提到声明值。管理员改菜单不动 declVersion，
            因此他的调整不会在下次重启被覆盖；而开发者想下发新排序时，
            只需在声明里把 declVersion 加一。

          未声明 declVersion 的菜单默认版本 0，与库中默认值相等，即不回写外观字段——
          对既有菜单保持「不覆盖管理员」的行为，需要下发变更的菜单才显式写版本号。
        */
        const declVersion = data.declVersion ?? 0;
        const structural = {
          type: data.type,
          perms: data.perms ?? null,
          parentId: data.parentId ?? null,
        };
        if (declVersion <= found.declVersion) {
          return this.prisma.sysMenu.update({ where: { id: found.id }, data: structural });
        }
        return this.prisma.sysMenu.update({
          where: { id: found.id },
          data: {
            ...structural,
            name: data.name,
            icon: data.icon ?? null,
            orderNum: data.orderNum,
            isShow: data.isShow ?? 1,
            keepAlive: data.keepAlive ?? 1,
            declVersion,
          },
        });
      }
      return this.prisma.sysMenu.create({ data });
    };
    // 2) 系统管理目录 + 子菜单（视图路径 views/system/* 与 router 层级一致，前端可直接命中）
    const sysDir = await ensure({ name: '系统管理', type: 0, router: '/system', icon: 'Setting', orderNum: 14, declVersion: 2 });
    await ensure({ name: '参数配置', type: 1, router: '/system/param-config', perms: 'sys:param-config:list', orderNum: 1, parentId: sysDir.id });
    await ensure({ name: 'AI模型配置', type: 1, router: '/system/ai-model', perms: 'sys:ai-model:list', orderNum: 2, parentId: sysDir.id });
    await ensure({ name: '数据字典', type: 1, router: '/system/data-dict', perms: 'sys:dict:type:list', orderNum: 3, parentId: sysDir.id });
    await ensure({ name: '操作日志', type: 1, router: '/system/operation-log', perms: 'sys:operation-log:list', orderNum: 4, parentId: sysDir.id });

    // 3) 外部考生管理：目录 + 「外部单位」「外部考生」两个子菜单
    //    历史上 /external-candidate 曾是一级单页菜单（type1 无父），此处改造为目录下子菜单：
    //    - 新建目录 /external（type0，套 Layout），承载两个子页
    //    - 子菜单 router 与前端 views 目录一致：/external-org → views/external-org，/external-candidate → views/external-candidate
    //    ensure 按 router 幂等：旧 /external-candidate 记录会被回填 parentId 并挂到目录下，其下按钮权限随父菜单 id 保留
    const externalDir = await ensure({ name: '外部考生管理', type: 0, router: '/external', icon: 'User', orderNum: 6, declVersion: 1 });
    await ensure({ name: '外部单位管理', type: 1, router: '/external-org', perms: 'exam:external-org:list', orderNum: 1, parentId: externalDir.id });
    await ensure({ name: '外部考生管理', type: 1, router: '/external-candidate', perms: 'exam:external-candidate:list', orderNum: 2, parentId: externalDir.id });

    // 4) 考点管理：单页一级菜单（type1 无父目录，视图为顶层单页）
    await ensure({ name: '考点管理', type: 1, router: '/exam-site', perms: 'sys:exam-site:list', icon: 'Location', orderNum: 5 });

    // 5) 题库管理：目录 + 「题库列表」「知识点分类」子菜单（router 与前端 views/question-bank 层级一致）
    const questionBankDir = await ensure({ name: '题库管理', type: 0, router: '/question-bank', icon: 'Collection', orderNum: 1 });
    await ensure({ name: '题库列表', type: 1, router: '/question-bank/list', perms: 'exam:question-bank:list', orderNum: 1, parentId: questionBankDir.id });
    await ensure({ name: '知识点分类', type: 1, router: '/question-bank/knowledge-point', perms: 'exam:knowledge-point:list', orderNum: 2, parentId: questionBankDir.id });
    // 题目管理为「进入题库」后的子页（带 bankId query），侧边栏隐藏（isShow=0）。
    // 其 type=1 + perms=exam:question:list 作为 perms-sync 挂 add/update/delete/detail/audit/batch-delete 按钮的父节点，
    // 前端 v-auth 依赖该菜单 meta.authList 才能显示操作按钮。
    // keepAlive=0 同 /exam-edit：bankId 走 query 而本页只在 onMounted 取数，
    // 缓存后从题库 A 换到题库 B 不会重新挂载，题目列表与 canManage 权限位都会残留 A 的。
    await ensure({ name: '题目管理', type: 1, router: '/question-bank/questions', perms: 'exam:question:list', orderNum: 3, parentId: questionBankDir.id, isShow: 0, keepAlive: 0 });

    // 5.1) 试卷管理：单页一级菜单（type1 无父目录）。perms=exam:paper:list 作为 perms-sync 挂
    //      add/update/delete/detail/publish/batch-delete 按钮的父节点，前端 v-auth 依赖其 authList。
    await ensure({ name: '试卷管理', type: 1, router: '/paper', perms: 'exam:paper:list', icon: 'Document', orderNum: 2 });
    // 创建/编辑试卷为独立页（手动/AI/随机组卷，走 query）。试卷管理是单页一级菜单无法承载子页，
    // 故 edit 作为独立一级隐藏菜单（isShow=0），router=/paper-edit 与前端 views/paper-edit 对应。
    // keepAlive=0：换试卷进来必须重新拉数据，缓存会残留上一份试卷的组卷内容。
    // 此处显式声明是为了与库中现状对齐——存量库该行已是 0，若声明里省略则会被「声明即状态」回落成 1。
    await ensure({ name: '创建编辑试卷', type: 1, router: '/paper-edit', orderNum: 21, isShow: 0, keepAlive: 0 });

    // 5.2) 考试管理：单页一级菜单。perms=exam:exam:list 承载 add/update/delete/detail/publish/withdraw/batch-delete 按钮。
    await ensure({ name: '考试管理', type: 1, router: '/exam', perms: 'exam:exam:list', icon: 'EditPen', orderNum: 3 });
    // 创建/编辑考试为独立页（基本信息/考生/防作弊）。同上，作为独立一级隐藏菜单，router=/exam-edit。
    // keepAlive=0 同 /paper-edit：这类「id 走 query」的编辑页被缓存后，换 id 进来不会重新挂载，
    // 表单会残留上一场考试的数据（含隐藏的 form.id），保存时按旧 id 提交——
    // 复制考试后编辑副本却报「考试已发布，无法编辑」就是这么来的（提交的是源考试 id）。
    await ensure({ name: '创建编辑考试', type: 1, router: '/exam-edit', orderNum: 31, isShow: 0, keepAlive: 0 });
    // 考试详情为独立页（页内 Tab 切「考试详情 / 考生成绩」），同上作为独立一级隐藏菜单。
    // 不挂 perms：成绩与导出接口复用 exam:exam:detail 权限点，已由「考试管理」节点承载。
    // keepAlive=0 同上：详情页同样按 query 上的 id 取数，缓存会串场显示上一场的成绩。
    await ensure({ name: '考试详情', type: 1, router: '/exam-detail', orderNum: 32, isShow: 0, keepAlive: 0 });

    /*
      5.3.0) 练习菜单改版的存量迁移：把两个旧节点改名为二级菜单的 router。

      必须跑在下面三个 ensure 之前。ensure 按 router 匹配，若先执行
      ensure({ router: '/practice', type: 0 })，它会命中旧的 /practice 单页菜单行
      并把 type 改成 0、perms 清空——那一行挂着 9 个 exam:practice:* 按钮，
      按钮会留在一个已变成目录的父节点下，前端 v-auth 从当前路由 meta.authList
      取不到权限点，整排操作按钮消失；PermsSyncService 对已存在的权限点是跳过而非重挂，不会自愈。

      故先改名、再让 ensure 按新 router 认领这两行，按钮的 parentId 始终不变。

      幂等：改完 router 就不再命中 where，重复启动无副作用。
      与 prisma/migrations/20260828000000_practice_submenus 同义——
      本地库由 db push + 本 seed 维护（无 _prisma_migrations 表），迁移文件只对走
      migrate deploy 的环境生效，两边都需要，故一处逻辑两处表达。
    */
    await this.prisma.sysMenu.updateMany({
      where: { router: '/practice', type: 1 },
      data: { name: '岗位练兵', router: '/practice/assigned', orderNum: 1, isShow: 1 },
    });
    await this.prisma.sysMenu.updateMany({
      where: { router: '/practice-self' },
      data: { name: '自主练习', router: '/practice/self', orderNum: 2, isShow: 1 },
    });

    // 5.3) 练习管理：目录 + 「岗位练兵」「自主练习」两个二级菜单。
    //      两种练习形态不同（岗位练兵是指派任务、有状态机；自主练习是按题库开放），
    //      原先挤在一页里用 Tab 切，改为二级菜单后侧边栏直接进入，少一层切换。
    const practiceDir = await ensure({ name: '练习管理', type: 0, router: '/practice', icon: 'Notebook', orderNum: 7, declVersion: 3 });
    /*
      perms 必须留在 type=1 的子节点上，不能挂到目录。

      PermsSyncService 的 menuByGroup 只收 type=1 且有 perms 的节点，
      目录进不了索引；若把 exam:practice:list 留在目录上，
      exam:practice:* 的新增按钮会找不到挂载点而被记为 orphan。

      另：这两行原本是 /practice 与 /practice-self（后者 isShow=0，仅作按钮挂载点）。
      迁移 20260828000000_practice_submenus 把它们改名为现在的 router 并挂到目录下，
      是改名而非新建——两者共挂着 11 个 type=2 按钮，新建会让按钮悬空、
      前端 v-auth 读不到 authList 而整排消失，且 perms-sync 对已存在权限点是跳过、不会自愈。
    */
    await ensure({ name: '岗位练兵', type: 1, router: '/practice/assigned', perms: 'exam:practice:list', orderNum: 1, parentId: practiceDir.id, declVersion: 3 });
    await ensure({ name: '自主练习', type: 1, router: '/practice/self', perms: 'exam:self-practice:list', orderNum: 2, parentId: practiceDir.id, declVersion: 1 });

    /*
      5.3.1) 收敛练习菜单：去重 + 把按钮挂回正确的父节点。

      上面的改名只在「ensure 之前先跑到」时才保住按钮归属。实际会出现跑不到的情况：
      开发机上 nest --watch 会在改完 ensure、还没写改名逻辑的中间态就重启并播种一次，
      结果是旧 /practice 行被 ensure 直接改成目录（perms 清空、按钮留在目录下），
      随后的改名再把 /practice-self 改成 /practice/self，与 ensure 新建的那行撞成两条。

      故不依赖执行顺序，改为每次启动都朝目标形态收敛：
      - 同 router 多行时只留 id 最小的一行（最早创建、最可能被角色授权引用），
        把另一行的角色授权与子按钮迁移过去后删除；
      - type=2 按钮的 parentId 一律指向「同前缀且 perms 以 :list 结尾」的 type=1 菜单。
        这是 v-auth 能取到 authList 的前提：前端从当前路由的 meta.authList 读权限点，
        而 authList 由 buttonsByParent 按 parentId 归集。

      只作用于练习相关的两个前缀，不动其他模块。
    */
    await this.consolidatePracticeMenus();
    // 创建/编辑练习为独立页（基础信息/题库与抽题/参与人员/练习设置），保持独立一级隐藏菜单。
    // 练习管理已改为目录、本可承载子页，但这两页仍按 `${router}-edit` / `-detail` 命名约定
    // 由 getUserMenuTree 自动带出（目录仍占 router=/practice，约定照旧命中），
    // 挪到目录下要连带改 router 与 views 路径，收益不抵改动面，故不动。
    // keepAlive=0 同 /exam-edit：id 走 query 的编辑页缓存后换 id 不重挂载，会拿旧 id 提交。
    await ensure({ name: '创建编辑练习', type: 1, router: '/practice-edit', orderNum: 62, isShow: 0, keepAlive: 0 });
    // 练习详情为独立页（页内 Tab 切「练习详情 / 练习记录」），同上作为独立一级隐藏菜单。
    // 不挂 perms：记录接口复用 exam:practice:detail 权限点，已由「练习管理」节点承载。
    // keepAlive=0 同上：详情页按 query 上的 id 取数，缓存会串场。
    await ensure({ name: '练习详情', type: 1, router: '/practice-detail', orderNum: 63, isShow: 0, keepAlive: 0 });

    // 5.4) 阅卷中心：单页一级菜单，列表为考试维度（显示各场待阅卷份数）。
    //      perms=exam:grading:list 承载 detail/review/publish/withdraw 按钮。
    await ensure({ name: '阅卷中心', type: 1, router: '/grading', perms: 'exam:grading:list', icon: 'Checked', orderNum: 8, declVersion: 1 });
    // 阅卷工作台为独立页（左考生名单 + 中卷面逐题批阅 + 右答题卡，考试 id 走 query），
    // 阅卷中心是单页一级菜单无法承载子页，故作为独立一级隐藏菜单，与 /exam-detail 同款。
    // 不挂 perms：工作台内接口复用 exam:grading:* 权限点，已由「阅卷中心」节点承载。
    // keepAlive=0：换考试进来必须重新拉考生名单，缓存会残留上一场的人。
    await ensure({ name: '阅卷工作台', type: 1, router: '/grading-workspace', orderNum: 71, isShow: 0, keepAlive: 0 });

    // 5.5) 监考中心：单页一级菜单，列表为考试维度（只含指派给自己监考的考试）。
    //      perms=exam:proctor:list 承载 detail/force-submit/reset 按钮。
    //      【历史】该模块曾于 20260816010000_remove_proctor_center 下线，本次重建复用
    //      ExamStaff(role=proctor) 指派与 AnswerSheet.switchCount，未恢复当时删掉的
    //      监考安排表与逐条异常事件台账。旧菜单按 router LIKE '/proctor%' 被删过，
    //      故此处 ensure 会重新插入而不是命中残留行。
    await ensure({ name: '监考中心', type: 1, router: '/proctor', perms: 'exam:proctor:list', icon: 'View', orderNum: 9, declVersion: 1 });
    // 监考工作台为独立页（考生名单 + 切屏次数 + 强制交卷/解锁/重考，考试 id 走 query），
    // 监考中心是单页一级菜单无法承载子页，故作为独立一级隐藏菜单，与阅卷工作台同款。
    // 不挂 perms：工作台内接口复用 exam:proctor:* 权限点，已由「监考中心」节点承载。
    // keepAlive=0：换考试进来必须重新拉考生名单，缓存会残留上一场的人。
    await ensure({ name: '监考工作台', type: 1, router: '/proctor-workspace', orderNum: 91, isShow: 0, keepAlive: 0 });

    /*
      6) 技能鉴定：目录 + 「鉴定工种管理」「认证项目」「报考审核」子菜单
         （router 与前端 views/certification 层级一致）

      本轮由「资格认证」改名为「技能鉴定」。只改菜单显示名（declVersion 加到 1 下发），
      router 仍是 /certification、权限点仍是 exam:cert-*、视图目录仍是 views/certification：
      改这些要连带迁移菜单行 router、角色授权、每个 @Perms 的前缀与前端整个目录，
      而这些都是用户看不见的内部标识，动它们只增加出错面。
    */
    const certificationDir = await ensure({ name: '技能鉴定', type: 0, router: '/certification', icon: 'Postcard', orderNum: 4, declVersion: 1 });
    // 鉴定工种管理：工种与其级别在同一棵树形表格里维护（工种父行 / 级别子行）。
    // perms=exam:cert-occupation:list 承载 detail/add/update/update-status/delete/batch-delete 按钮。
    await ensure({ name: '鉴定工种管理', type: 1, router: '/certification/occupation', perms: 'exam:cert-occupation:list', orderNum: 1, parentId: certificationDir.id });
    await ensure({ name: '认证项目', type: 1, router: '/certification/project', perms: 'exam:cert-project:list', orderNum: 2, parentId: certificationDir.id, declVersion: 1 });
    // 鉴定报名：单位管理员按本单位名额挑人报名。
    // perms=exam:cert-enroll:list 承载 submit/cancel 按钮。
    // 必须存在这个 type=1 节点：PermsSyncService 的 menuByGroup 只收 type=1，
    // 找不到分组 exam:cert-enroll 的话，submit/cancel 会被判为孤儿权限点只记录不创建，
    // 结果除超管外没有任何角色能被授予。
    await ensure({ name: '鉴定报名', type: 1, router: '/certification/enroll', perms: 'exam:cert-enroll:list', orderNum: 3, parentId: certificationDir.id });
    // 报名审核 perms=exam:cert-application:list 承载 detail/review/review-batch 按钮。
    //
    // 本轮由「报考审核」改名「报名审核」：审的对象已经变了——原先设想是考生自主
    // 报考（但那条写入路径从未实现，certApplication.create 全项目只有 seed 演示数据
    // 用过），现在实际来源是「鉴定报名」里各单位按名额报上来的人。
    // 只改显示名，router 与权限点不动：改这些要连带迁移菜单行、角色授权与前端目录，
    // 而它们都是用户看不见的内部标识。
    await ensure({ name: '报名审核', type: 1, router: '/certification/application', perms: 'exam:cert-application:list', orderNum: 4, parentId: certificationDir.id, declVersion: 2 });
    // 鉴定项目详情：认证项目列表「详情」按钮跳转的隐藏页，汇总报名/审核/考试各阶段进展。
    //
    // isShow=0 不进侧边栏，只供列表跳转（与「题目管理」同款）。
    // 不挂独立 perms：progress 接口复用 exam:cert-project:detail，
    // 已由上面的「认证项目」节点承载；另立权限点只会让配权限的人多一步。
    // keepAlive=0：各阶段人数是实时值，缓存回来会显示过期数据。
    await ensure({ name: '鉴定项目详情', type: 1, router: '/certification/project-detail', orderNum: 5, parentId: certificationDir.id, isShow: 0, keepAlive: 0 });

    // 7) 证书管理：目录 + 「证书模板」「证书发放」子菜单（router 与前端 views/certificate 层级一致）
    const certDir = await ensure({ name: '证书管理', type: 0, router: '/certificate', icon: 'Medal', orderNum: 11, declVersion: 2 });
    await ensure({ name: '证书模板', type: 1, router: '/certificate/template', perms: 'exam:certificate-template:list', orderNum: 1, parentId: certDir.id });
    // 证书发放为台账页 perms=exam:certificate:list 承载 detail 按钮（查看/下载复用 detail）
    await ensure({ name: '证书发放', type: 1, router: '/certificate/issue', perms: 'exam:certificate:list', orderNum: 2, parentId: certDir.id });

    /*
      8) 组织管理 / 权限管理：目录与子菜单都在此声明。

      原先此处只 ensure 两个目录、注释写「子菜单由 seedMenus 建，此处不动」，
      但 seedMenus 有 `if (existing > 0) return` 的空库守卫：任何在它之前就已
      写入过菜单的库（如先跑过 seedNavMenus 的旧版本），这五个子菜单永远不会被创建，
      而本步的 ensure 照样把父目录建出来——结果是两个点开没有任何子项的空目录。

      故这里补齐子菜单，与本方法其余部分一致遵循「声明即状态」：
      seedNavMenus 独自就能把菜单树收敛到正确形态，不依赖 seedMenus 是否跑过。
      两处声明的字段保持一致，seedMenus 那份留给空库首次初始化。
    */
    const orgDir = await ensure({ name: '组织管理', type: 0, router: '/organization', icon: 'OfficeBuilding', orderNum: 12, declVersion: 2 });
    await ensure({ name: '部门管理', type: 1, router: '/organization/department', perms: 'sys:department:list', orderNum: 1, parentId: orgDir.id });
    await ensure({ name: '人员管理', type: 1, router: '/organization/user', perms: 'sys:user:list', orderNum: 2, parentId: orgDir.id });
    await ensure({ name: '岗位管理', type: 1, router: '/organization/position', perms: 'sys:position:list', orderNum: 3, parentId: orgDir.id });

    const permDir = await ensure({ name: '权限管理', type: 0, router: '/permission', icon: 'Lock', orderNum: 13, declVersion: 2 });
    await ensure({ name: '角色管理', type: 1, router: '/permission/role', perms: 'sys:role:list', orderNum: 1, parentId: permDir.id });
    await ensure({ name: '菜单管理', type: 1, router: '/permission/menu', perms: 'sys:menu:list', orderNum: 2, parentId: permDir.id });

    /*
      9) 首页：orderNum 0 排在全部业务菜单之前。

      不给 perms：首页是登录后的落地页，不该按功能点鉴权——它只聚合各模块的
      概览数字，每个数字背后的接口各自有 @Perms 把关，无权的模块拿不到数据。
      但「无 perms」不等于「人人可见」：getUserMenuTree 对非超管只返回
      sysRoleMenu 里分配过的菜单，故本方法末尾还要把首页显式挂到所有角色上，
      否则除 admin 之外谁登录都看不到首页。
    */
    const dashboardMenu = await ensure({
      name: '首页',
      type: 1,
      router: '/dashboard',
      icon: 'HomeFilled',
      orderNum: 0,
    });
    await this.grantMenuToAllRoles(dashboardMenu.id);

    /*
      10) 统计分析：落在监考中心（9）之后、证书管理（11）之前——
      先监考、再阅卷出分、再看统计，顺序符合业务流。

      先只播「考试台账」一个子菜单。成绩分析/考生成绩台账/题目分析的统计口径
      （应考人数如何算、重考的多份答卷如何去重）尚未与既有实现对齐，
      菜单先播出来会给出一个点进去是空页的入口，不如等页面就绪再补。
    */
    const analyticsDir = await ensure({
      name: '统计分析',
      type: 0,
      // 由 9 后移一位：监考中心插到阅卷中心之后（先监考、再阅卷、再看统计），
      // 其后的证书/组织/权限/系统管理同步各后移一位，declVersion 一并加一以下发新排序
      router: '/analytics',
      icon: 'DataLine',
      orderNum: 10,
      declVersion: 2,
    });
    /*
      perms 用 exam:analytics:list 而非 exam:analytics-ledger:list。

      统计分析模块的接口前缀是 admin/exam/analytics，派生出的权限点分组为
      exam:analytics。PermsSyncService 靠「菜单 perms 去末段」建分组索引，
      若这里写 analytics-ledger，分组就是 exam:analytics-ledger，与接口的
      exam:analytics 对不上，模块前缀兜底也匹配不到（analytics-ledger 不以
      "analytics:" 开头），该模块所有权限点都会成为孤儿——只记录不创建，
      结果是除超管外没人能被授予，统计接口对普通角色恒 403。

      故台账菜单直接承载模块级 list 权限。后续新增成绩分析等页面时，
      它们共用这一个 list 权限点即可（同一份数据的不同视图），
      与阅卷中心 exams/list 两接口复用同一权限点的做法一致。
    */
    await ensure({
      name: '考试台账',
      type: 1,
      router: '/analytics/exam-ledger',
      perms: 'exam:analytics:list',
      orderNum: 1,
      parentId: analyticsDir.id,
    });

    this.logger.log('导航菜单（首页/统计分析/系统管理/外部考生/考点/题库/技能鉴定/证书）已初始化');
  }

  /**
   * 把练习菜单收敛到「目录 + 岗位练兵 / 自主练习」形态
   *
   * 每次启动执行，幂等。做两件事：
   * 1) 同一 router 出现多行时只留 id 最小的一行，迁移角色授权与子按钮后删除多余行；
   * 2) exam:practice:* / exam:self-practice:* 的按钮 parentId 指向承载对应 `:list`
   *    权限点的 type=1 菜单。
   *
   * 不依赖执行顺序：改名式迁移只在「先于 ensure 执行」时有效，而开发机 watch 重启
   * 会在中间态播种，导致按钮留在目录下、并产生同 router 重复行。此方法负责兜住这些情况。
   */
  private async consolidatePracticeMenus(): Promise<void> {
    // 1) 同 router 去重
    for (const router of ['/practice/assigned', '/practice/self']) {
      const rows = await this.prisma.sysMenu.findMany({
        where: { router },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      if (rows.length < 2) continue;
      const keep = rows[0].id;
      const dupes = rows.slice(1).map((r) => r.id);
      /*
        先迁角色授权再删行：SysRoleMenu.menuId 是级联删除，
        直接删重复行会把管理员给该菜单勾选的授权一起带走。
        skipDuplicates 应对「两行都被授权给同一角色」——复合唯一键会冲突。
      */
      const grants = await this.prisma.sysRoleMenu.findMany({
        where: { menuId: { in: dupes } },
        select: { roleId: true },
      });
      if (grants.length) {
        await this.prisma.sysRoleMenu.createMany({
          data: [...new Set(grants.map((g) => g.roleId))].map((roleId) => ({ roleId, menuId: keep })),
          skipDuplicates: true,
        });
      }
      // 子按钮改挂到保留行，避免随父行级联删除
      await this.prisma.sysMenu.updateMany({
        where: { parentId: { in: dupes } },
        data: { parentId: keep },
      });
      await this.prisma.sysMenu.deleteMany({ where: { id: { in: dupes } } });
      this.logger.log(`练习菜单去重：router=${router} 保留 id=${keep}，删除 ${dupes.join(',')}`);
    }

    // 2) 按钮归位：parentId 指向承载同前缀 :list 的 type=1 菜单
    for (const prefix of ['exam:practice', 'exam:self-practice']) {
      const owner = await this.prisma.sysMenu.findFirst({
        where: { type: 1, perms: `${prefix}:list` },
        select: { id: true },
      });
      if (!owner) continue;
      /*
        精确按前缀取按钮，不能用 startsWith('exam:practice:')——
        它会把 exam:self-practice:* 一起捞进来（两者都含 practice: 子串时按前缀截取会错配），
        故用 perms 的「去末段」等于 prefix 来判定，逻辑与 PermsSyncService 的分组一致。
      */
      const buttons = await this.prisma.sysMenu.findMany({
        where: { type: 2, perms: { not: null } },
        select: { id: true, perms: true, parentId: true },
      });
      const misplaced = buttons
        .filter((b) => b.perms!.slice(0, b.perms!.lastIndexOf(':')) === prefix)
        .filter((b) => b.parentId !== owner.id)
        .map((b) => b.id);
      if (!misplaced.length) continue;
      await this.prisma.sysMenu.updateMany({
        where: { id: { in: misplaced } },
        data: { parentId: owner.id },
      });
      this.logger.log(`练习按钮归位：${prefix}:* 共 ${misplaced.length} 个改挂到 id=${owner.id}`);
    }
  }

  /**
   * 修复悬空的 exam:proctor:* 按钮（父菜单已不存在）
   *
   * 监考中心重建前，seedNavMenus 里那条按 '/proctor' 前缀的清理会每次启动删掉菜单再重建，
   * 而 perms-sync 建的按钮（type=2 / router=null）删不掉、也不会被改 parentId，
   * 于是它们的 parentId 指向了已消失的旧菜单 id。删掉这些悬空行后，
   * perms-sync 会在本次启动的后续步骤（syncNavMenus → syncPerms）按新菜单 id 重建。
   *
   * 只删父菜单确实不存在的那些，不能无条件删：
   * SysRoleMenu.menuId 是级联删除，把仍然正常的按钮删掉重建，会连带清空管理员
   * 给角色勾选的按钮授权——那正是本方法要修的同一类缺陷。
   */
  private async repairOrphanProctorButtons(): Promise<void> {
    const buttons = await this.prisma.sysMenu.findMany({
      where: { type: 2, perms: { startsWith: 'exam:proctor:' } },
      select: { id: true, parentId: true },
    });
    if (!buttons.length) return;

    const parentIds = [...new Set(buttons.map((b) => b.parentId).filter((v): v is number => !!v))];
    const alive = parentIds.length
      ? await this.prisma.sysMenu.findMany({
          where: { id: { in: parentIds } },
          select: { id: true },
        })
      : [];
    const aliveIds = new Set(alive.map((m) => m.id));

    // parentId 为空也算悬空：菜单树按 parentId 归集按钮，挂不上任何父节点
    const orphanIds = buttons
      .filter((b) => !b.parentId || !aliveIds.has(b.parentId))
      .map((b) => b.id);
    if (!orphanIds.length) return;

    await this.prisma.sysMenu.deleteMany({ where: { id: { in: orphanIds } } });
    this.logger.log(`清理悬空的监考按钮 ${orphanIds.length} 个，将由权限同步按新菜单重建`);
  }

  /**
   * 初始化默认岗位数据（业务岗位 + 考试管理相关岗位）
   * 按 name（唯一约束）逐个 upsert，缺失才补，已存在不覆盖，可安全重复执行。
   */
  private async seedPositions(): Promise<void> {
    const positions = [
      { name: '巡检员', description: '负责日常设备巡检工作', orderNum: 1 },
      { name: '维修工', description: '负责设备维修保养工作', orderNum: 2 },
      { name: '安全员', description: '负责安全监督检查工作', orderNum: 3 },
      { name: '班组长', description: '负责班组日常管理工作', orderNum: 4 },
      { name: '部门经理', description: '负责部门整体管理工作', orderNum: 5 },
      // 考试管理相关岗位
      { name: '考务管理员', description: '负责考试组织、考场编排与考务协调工作', orderNum: 6 },
      { name: '监考员', description: '负责考试现场监考与违规处置工作', orderNum: 7 },
      { name: '阅卷员', description: '负责主观题评阅与成绩录入工作', orderNum: 8 },
      { name: '命题专家', description: '负责试题命制、审核与题库维护工作', orderNum: 9 },
      { name: '考评员', description: '负责实操考核评定与认证审核工作', orderNum: 10 },
    ];
    let added = 0;
    for (const p of positions) {
      const exists = await this.prisma.sysPosition.findUnique({ where: { name: p.name } });
      if (exists) continue;
      await this.prisma.sysPosition.create({ data: p });
      added++;
    }
    this.logger.log(`默认岗位已初始化（新增 ${added} 个）`);
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

  /**
   * 补齐数据字典（类型 + 字典项）；按 key/value 幂等，缺失才补，已存在不覆盖
   *
   * 公开给 BootstrapService 每次启动单独调用：字典项是代码里定死的枚举，
   * 新增一项必须能进到已有库里，不能跟演示数据一样被「库非空则跳过」挡掉。
   */
  async syncDict(): Promise<void> {
    return this.seedDict();
  }

  /** 字典补齐的实际实现 */
  private async seedDict(): Promise<void> {
    // 类型：name→前端 typeName，key→前端 typeCode。按 key 幂等（缺则建）
    const types = [
      { key: 'question_type', name: '题型' },
      { key: 'difficulty', name: '难度' },
      { key: 'operation_type', name: '操作类型' },
    ];
    const keyToId: Record<string, number> = {};
    for (const t of types) {
      const found = await this.prisma.dictType.findFirst({ where: { key: t.key } });
      const row = found ?? (await this.prisma.dictType.create({ data: t }));
      keyToId[t.key] = row.id;
    }
    // 字典项：orderNum→前端 sort，referenced 标记引用保护
    const items = [
      { key: 'question_type', name: '单选题', value: 'single', orderNum: 1, status: 1, referenced: true },
      { key: 'question_type', name: '多选题', value: 'multiple', orderNum: 2, status: 1, referenced: true },
      { key: 'question_type', name: '判断题', value: 'judge', orderNum: 3, status: 1, referenced: false },
      { key: 'question_type', name: '填空题', value: 'blank', orderNum: 4, status: 1, referenced: false },
      { key: 'question_type', name: '问答题', value: 'qa', orderNum: 5, status: 1, referenced: false },
      { key: 'question_type', name: '论述题', value: 'essay', orderNum: 6, status: 0, referenced: false },
      // 材料题：题干存共享材料，本身不作答，作答位由其下小题产生。
      // 不能进随机抽题规则——规则的 scorePerQuestion 是「每题固定分」，
      // 而材料题分值是小题之和、每道都不同，该字段表达不了。
      { key: 'question_type', name: '材料题', value: 'composite', orderNum: 7, status: 1, referenced: false },
      { key: 'difficulty', name: '简单', value: 'easy', orderNum: 1, status: 1, referenced: true },
      { key: 'difficulty', name: '中等', value: 'medium', orderNum: 2, status: 1, referenced: false },
      { key: 'difficulty', name: '困难', value: 'hard', orderNum: 3, status: 1, referenced: false },
      { key: 'operation_type', name: '新增', value: 'create', orderNum: 1, status: 1, referenced: false },
      { key: 'operation_type', name: '编辑', value: 'update', orderNum: 2, status: 1, referenced: false },
      { key: 'operation_type', name: '删除', value: 'delete', orderNum: 3, status: 1, referenced: false },
      { key: 'operation_type', name: '登录', value: 'login', orderNum: 4, status: 1, referenced: false },
    ];
    // 逐项按 (typeId,value) 幂等：已存在跳过，缺失才补，避免重复插入
    let added = 0;
    for (const { key, ...rest } of items) {
      const typeId = keyToId[key];
      const exists = await this.prisma.dictInfo.findFirst({ where: { typeId, value: rest.value } });
      if (exists) continue;
      await this.prisma.dictInfo.create({ data: { ...rest, typeId } });
      added++;
    }
    this.logger.log(`数据字典已初始化（新增字典项 ${added} 个）`);
  }

  /**
   * 初始化演示数据（资格认证/证书发放）
   *
   * 这两块的真实数据来源于尚未实现的考生端报考与阅卷自动发证链路，
   * 为让管理后台页面打开即有内容，此处构造自包含的演示链路（演示试卷→演示考试→
   * 认证项目→报考申请→证书）。
   * 幂等：以演示考试名称为总开关，已存在则整体跳过。演示考生统一用内部类型指向管理员（快照姓名区分）。
   * @param adminUserId 管理员用户 ID（演示考生 internalUserId 占位）
   */
  private async seedDemoData(adminUserId: number): Promise<void> {
    const DEMO_EXAM_NAME = '【演示】特种作业操作证考试';
    const existed = await this.prisma.exam.findFirst({
      where: { name: DEMO_EXAM_NAME },
      select: { id: true },
    });
    if (existed) {
      this.logger.log('演示数据已存在，跳过演示数据初始化');
      return;
    }

    // 1) 演示试卷（固定卷，已发布，供演示考试引用）
    const paper = await this.prisma.paper.create({
      data: {
        name: '【演示】特种作业操作证试卷',
        type: 'fixed',
        status: 'published',
        totalScore: 100,
        questionCount: 0,
        suggestDuration: 90,
        // 归属管理员并保持全部可见可管理，与迁移里存量数据的处理一致
        createBy: adminUserId,
        visibleScope: 'all',
        shareLevel: 'manage',
      },
    });

    // 2) 演示考试（开启防切屏与操作限制，进行中：开始于昨天、结束于明天）
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const exam = await this.prisma.exam.create({
      data: {
        name: DEMO_EXAM_NAME,
        description: '演示用考试，开启防切屏与操作限制，用于展示考试防作弊配置',
        paperId: paper.id,
        startTime: new Date(now - day),
        endTime: new Date(now + day),
        duration: 90,
        passScore: 60,
        status: 'published',
        setting: { create: { screenSwitchDetect: true, operationRestrict: true } },
      },
    });

    await this.seedDemoCertAndEvents(exam.id, adminUserId);
    this.logger.log('演示数据（认证/证书）已初始化');
  }

  /**
   * 取内部用户的展示姓名（用于姓名快照字段）
   *
   * @param userId 用户 ID
   * @returns 姓名，取不到时回退为「考生」
   */
  private async resolveInternalUserName(userId: number): Promise<string> {
    const user = await this.prisma.sysUser.findUnique({
      where: { id: userId },
      select: { name: true, nickName: true, username: true },
    });
    return user?.name || user?.nickName || user?.username || '考生';
  }

  /**
   * 初始化演示数据的证书/认证部分（由 seedDemoData 调用，拆分以控制单方法规模）
   * 构造：演示证书模板→认证项目→报考申请（三态）→证书（有效/过期）。
   * 演示考生统一用内部类型指向管理员，candidateName 快照区分。
   * @param examId 演示考试 ID
   * @param adminUserId 管理员用户 ID（演示考生占位）
   */
  private async seedDemoCertAndEvents(examId: number, adminUserId: number): Promise<void> {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const inner = (name: string) => ({
      candidateType: 'internal',
      internalUserId: adminUserId,
      candidateName: name,
    });

    // 1) 演示证书模板（启用，供认证项目引用与证书发放）
    const template = await this.prisma.certificateTemplate.create({
      data: {
        name: DEMO_CERT_TEMPLATE_NAME,
        title: '特种作业操作证',
        issuingOrg: '应急管理部特种作业考核中心',
        description: '兹证明该同志已通过特种作业操作证考试，准予从事相应特种作业。',
        numberRule: '年份+6位流水号',
        // 预置版式，否则考生端拿到空 elements 会退化成纯字段清单，演示不出证书样子
        content: JSON.stringify(DEMO_CERT_LAYOUT),
        status: 1,
      },
    });

    // 2) 鉴定项目（挂工种与级别、负责人、时间区间，启用）
    //    工种/级别取种子里的电工——它铺满五级，演示时级别下拉不会只有一项。
    //    seedCertOccupations 在 seedDemoData 之前跑，此处必然取得到。
    const occupation = await this.prisma.certOccupation.findFirst({
      where: { name: '电工（站内维保）' },
      include: { levels: { orderBy: { orderNum: 'asc' } } },
    });
    if (!occupation?.levels.length) {
      this.logger.warn('未找到演示用鉴定工种，跳过鉴定项目的演示数据');
      return;
    }
    const project = await this.prisma.certProject.create({
      data: {
        name: '【演示】特种作业操作资格认证',
        description: '面向特种作业人员的操作资格认证项目',
        occupationId: occupation.id,
        // 取「三级/高级工」这一档，比首档更像真实开班的级别
        levelId: (occupation.levels[2] ?? occupation.levels[0]).id,
        managerId: adminUserId,
        contactPhone: '0571-88886666',
        applyDeadline: new Date(now + 7 * day),
        startTime: new Date(now + 14 * day),
        endTime: new Date(now + 15 * day),
        applyCondition: '年满 18 周岁，身体健康，具备初中以上文化程度',
        status: 1,
      },
    });

    // 3) 报考申请（待审核/已通过/已驳回三态）
    await this.prisma.certApplication.createMany({
      data: [
        { projectId: project.id, ...inner('演示考生·张三'), status: 'pending', applyTime: new Date(now - 2 * day) },
        {
          projectId: project.id,
          ...inner('演示考生·李四'),
          status: 'approved',
          reviewerId: adminUserId,
          reviewerName: '超级管理员',
          reviewTime: new Date(now - day),
          applyTime: new Date(now - 3 * day),
        },
        {
          projectId: project.id,
          ...inner('演示考生·王五'),
          status: 'rejected',
          reviewerId: adminUserId,
          reviewerName: '超级管理员',
          rejectReason: '报考材料不齐全，缺少学历证明',
          reviewTime: new Date(now - day),
          applyTime: new Date(now - 4 * day),
        },
      ],
    });

    // 4) 证书（有效 + 已过期各一）
    const year = new Date().getFullYear();
    // 证书的持证人姓名必须与归属账号一致：演示数据都挂在 admin 名下，
    // 若沿用「演示考生·李四」这类虚构名，考生端「我的证书」会显示成别人的
    // 名字（页面标题是本人，持证人却是李四），看起来像串号。
    const holderName = await this.resolveInternalUserName(adminUserId);
    // 与真实发证一致：定格模板快照，模板日后改版不会改写这批已发出的证书
    const templateSnapshot = buildCertTemplateSnapshot(
      await this.prisma.certificateTemplate.findUniqueOrThrow({
        where: { id: template.id },
        select: CERT_TEMPLATE_SNAPSHOT_SELECT,
      }),
    );
    await this.prisma.certificate.createMany({
      data: [
        {
          certNo: `${year}000001`,
          projectId: project.id,
          templateId: template.id,
          templateSnapshot,
          ...inner(holderName),
          issueDate: new Date(now - 30 * day),
          expireDate: new Date(now + 1000 * day),
        },
        {
          certNo: `${year - 4}000002`,
          projectId: project.id,
          templateId: template.id,
          templateSnapshot,
          ...inner(holderName),
          issueDate: new Date(now - 1500 * day),
          expireDate: new Date(now - 100 * day),
        },
      ],
    });
  }

  /**
   * 初始化考试管理相关角色（在 admin 之外补充）
   * 按 label（唯一约束）幂等 upsert，缺失才补，权限点后续在角色管理中勾选。
   */
  private async seedRoles(): Promise<void> {
    const roles = [
      { name: '考务管理员', label: 'exam_admin', remark: '负责考试组织、考场编排与考务协调' },
      { name: '阅卷员', label: 'grader', remark: '负责主观题评阅与成绩录入' },
      { name: '命题人', label: 'question_setter', remark: '负责试题命制、审核与题库维护' },
      { name: '考生管理员', label: 'candidate_admin', remark: '负责外部单位与外部考生的维护管理' },
    ];
    let added = 0;
    for (const r of roles) {
      const exists = await this.prisma.sysRole.findUnique({ where: { label: r.label } });
      if (exists) continue;
      await this.prisma.sysRole.create({
        data: { name: r.name, label: r.label, remark: r.remark, relevance: 1, status: 1 },
      });
      added++;
    }
    this.logger.log(`考试相关角色已初始化（新增 ${added} 个）`);
    await this.grantUploadPerm();
  }

  /**
   * 给需要录题的角色授予文件上传权限点（space:info:upload）
   *
   * 题干/选项/解析支持富文本插图后，编辑器的图片上传走 POST space/upload，
   * 该接口带 @Perms('upload')。权限按钮节点由 PermsSyncService 在启动时自动登记，
   * 但**不会**自动分配给任何角色——不补这一步，命题人点图片按钮直接 403。
   *
   * 执行顺序安全：BootstrapService 先 permsSyncService.sync() 再 seedService.run()，
   * 故此处菜单节点已存在。仍做存在性判断，节点缺失时告警而非抛错。
   */
  /**
   * 把某个菜单挂到全部角色上（幂等）
   *
   * 用于「所有人都该看到」的菜单。getUserMenuTree 对非超管只返回 sysRoleMenu
   * 里分配过的菜单，不显式挂载则该菜单只有 admin 可见。
   *
   * 与 grantUploadPerm 的区别：那个只授给特定几个角色（按 label 点名），
   * 这里是无差别授予全部角色，故不接受角色白名单。
   *
   * 新建的角色不会自动获得——本方法只在启动播种时跑一次。这对首页是可接受的：
   * 角色管理页建角色时会勾选菜单，而首页在菜单树里可见、勾得到。
   *
   * @param menuId 目标菜单 ID
   */
  private async grantMenuToAllRoles(menuId: number): Promise<void> {
    const roles = await this.prisma.sysRole.findMany({ select: { id: true } });
    // 一次查出已有关联，避免逐角色查库
    const existing = await this.prisma.sysRoleMenu.findMany({
      where: { menuId },
      select: { roleId: true },
    });
    const granted = new Set(existing.map((e) => e.roleId));
    const missing = roles.filter((r) => !granted.has(r.id));
    if (!missing.length) return;
    await this.prisma.sysRoleMenu.createMany({
      data: missing.map((r) => ({ roleId: r.id, menuId })),
    });
    this.logger.log(`菜单 ${menuId} 已授予 ${missing.length} 个角色`);
  }

  private async grantUploadPerm(): Promise<void> {
    const uploadMenu = await this.prisma.sysMenu.findFirst({
      where: { perms: 'space:info:upload' },
      select: { id: true },
    });
    if (!uploadMenu) {
      this.logger.warn('未找到 space:info:upload 权限节点，跳过上传权限授予（富文本插图将不可用）');
      return;
    }

    // 命题人与考务管理员都需要录题
    const labels = ['question_setter', 'exam_admin'];
    let granted = 0;
    for (const label of labels) {
      const role = await this.prisma.sysRole.findUnique({
        where: { label },
        select: { id: true },
      });
      if (!role) continue;
      const exists = await this.prisma.sysRoleMenu.findFirst({
        where: { roleId: role.id, menuId: uploadMenu.id },
      });
      if (exists) continue;
      await this.prisma.sysRoleMenu.create({
        data: { roleId: role.id, menuId: uploadMenu.id },
      });
      granted++;
    }
    if (granted > 0) {
      this.logger.log(`已为 ${granted} 个角色授予富文本图片上传权限`);
    }
  }
  /**
   * 初始化部门树，四级结构：集团公司 → 省公司 → 分公司 → 部门。
   *
   * 中国石化销售股份有限公司为根（集团公司），其下先列本部各部门，再列各省公司；
   * 每个省公司下模拟若干部门与分公司。浙江石油分公司是本平台业务主体，
   * 保留完整的职能部门 + 地市分公司 + 三级科室结构。
   *
   * 同级排序约定：部门用 orderNum 1~N，公司类节点从 100 起，
   * 保证部门恒排在公司之前。
   *
   * 部门表无唯一约束，按 name + parentId 组合 findFirst 幂等，可安全重复执行。
   */
  private async seedDepartments(): Promise<void> {
    // 演示用负责人姓名池。批量生成的科室/分公司按稳定下标取用，
    // 保证重跑 seed 得到同一批负责人，不会每次刷出不同的人名。
    const leaderNames = [
      '陈志远', '王建国', '李秀珍', '张国庆', '刘文斌', '杨慧敏', '赵学明', '孙玉华',
      '周振海', '吴晓东', '徐立群', '朱建平', '马凤兰', '胡永强', '郭春梅', '林伟民',
      '何俊杰', '高淑芬', '罗建军', '梁志强', '宋佳明', '唐雅琴', '许文远', '韩立新',
      '冯玉琴', '曹德海', '彭建华', '董秀英', '袁志刚', '蒋明辉', '余小波', '潘雪梅',
      '杜国栋', '戴春华', '夏志勇', '钟秀兰', '汪海涛', '田金龙', '任建斌', '姜丽华',
      '范文涛', '方国平', '石永民', '姚淑华', '谭志斌', '廖建国', '邹雅芳', '熊立伟',
    ];
    // 按序号取负责人姓名（取模循环，超出池长度后复用）
    const pickLeader = (seed: number): string => leaderNames[seed % leaderNames.length];
    // 按序号生成 11 位演示手机号，与姓名同序，便于核对
    const pickPhone = (seed: number): string =>
      `139${String(10000000 + (seed % leaderNames.length) * 137).slice(0, 8)}`;

    // 按 name+parentId 幂等创建单个部门，返回其 id
    const ensureDept = async (
      name: string,
      parentId: number | null,
      orderNum: number,
      extra?: { type?: string; leader?: string; phone?: string; status?: number },
    ): Promise<number> => {
      const found = await this.prisma.sysDepartment.findFirst({ where: { name, parentId } });
      if (found) {
        // 已存在时同步 orderNum / type / leader / phone：这几项均由 seed 定义，
        // 存量记录可能带着旧版本的值（如排序撞值、类型仍是旧枚举、负责人写成职务名），
        // 不纠正则改了 seed 也不生效。
        // status 例外，仅首次创建时写入，避免重跑冲掉运维手工的启用/停用调整。
        const patch: Record<string, unknown> = {};
        if (found.orderNum !== orderNum) patch.orderNum = orderNum;
        if (extra?.type && found.type !== extra.type) patch.type = extra.type;
        if (extra?.leader && found.leader !== extra.leader) patch.leader = extra.leader;
        if (extra?.phone && found.phone !== extra.phone) patch.phone = extra.phone;
        if (Object.keys(patch).length > 0) {
          await this.prisma.sysDepartment.update({ where: { id: found.id }, data: patch });
        }
        return found.id;
      }
      const created = await this.prisma.sysDepartment.create({
        data: { name, parentId, orderNum, status: 1, ...extra },
      });
      return created.id;
    };

    // 根：中国石化销售股份有限公司（集团公司）
    const hqId = await ensureDept('中国石化销售股份有限公司', null, 1, {
      type: '集团公司',
      leader: '陈志远',
      phone: '010-59968000',
    });

    // 存量提升：早期版本以浙江石油分公司为根（parentId=null）。集团公司层引入后，
    // 需把遗留的顶层节点改挂到集团公司下，否则下面按 name+parentId 幂等查找会失配，
    // 从而新建出一条重复的同名公司。
    const orphanTops = await this.prisma.sysDepartment.findMany({
      where: { parentId: null, id: { not: hqId } },
      select: { id: true, name: true },
    });
    if (orphanTops.length > 0) {
      await this.prisma.sysDepartment.updateMany({
        where: { id: { in: orphanTops.map((d) => d.id) } },
        data: { parentId: hqId },
      });
      this.logger.log(
        `已将 ${orphanTops.length} 个遗留顶层部门（${orphanTops
          .map((d) => d.name)
          .join('、')}）改挂到集团公司下`,
      );
    }

    // 集团本部部门（type=部门）。orderNum 用 1~N，省公司从 100 起，
    // 保证部门恒排在所有省公司之前。负责人逐个指定，便于演示时辨识。
    const hqDepts: { name: string; leader: string; phone: string }[] = [
      { name: '本部机关', leader: '王建国', phone: '010-59968010' },
      { name: '办公室', leader: '李秀珍', phone: '010-59968020' },
      { name: '人力资源部', leader: '张国庆', phone: '010-59968030' },
      { name: '财务部', leader: '刘文斌', phone: '010-59968040' },
      { name: '安全监管部', leader: '杨慧敏', phone: '010-59968050' },
      { name: '零售业务部', leader: '赵学明', phone: '010-59968060' },
      { name: '非油品业务部', leader: '孙玉华', phone: '010-59968070' },
      { name: '油品销售部', leader: '周振海', phone: '010-59968080' },
      { name: '信息管理部', leader: '吴晓东', phone: '010-59968090' },
      { name: '审计部', leader: '徐立群', phone: '010-59968100' },
    ];
    for (let i = 0; i < hqDepts.length; i++) {
      await ensureDept(hqDepts[i].name, hqId, i + 1, {
        type: '部门',
        leader: hqDepts[i].leader,
        phone: hqDepts[i].phone,
      });
    }

    // 省公司（含大区公司与直属公司，均与浙江同级直挂集团）。
    // prefix 用于给下级分公司命名，取编号式（如「华北第一石油分公司」）以避开
    // 真实省公司名，防止跨公司同名影响 deptId() 的按名消歧。
    // 西北分公司现状为作废，仅在首次创建时置为停用，重跑不覆盖运维的手工调整。
    const provinces: {
      name: string;
      prefix: string;
      leader: string;
      phone: string;
      status?: number;
    }[] = [
      { name: '销售华北分公司', prefix: '华北', leader: '朱建平', phone: '010-63512000' },
      { name: '销售华东分公司', prefix: '华东', leader: '马凤兰', phone: '021-63213000' },
      { name: '销售华中分公司', prefix: '华中', leader: '胡永强', phone: '027-85794000' },
      { name: '销售华南分公司', prefix: '华南', leader: '郭春梅', phone: '020-38825000' },
      { name: '销售东北分公司', prefix: '东北', leader: '林伟民', phone: '024-22836000' },
      {
        name: '销售西北分公司（作废）',
        prefix: '西北',
        leader: '何俊杰',
        phone: '029-87613000',
        status: 0,
      },
      { name: '销售川渝分公司', prefix: '川渝', leader: '高淑芬', phone: '028-86527000' },
      { name: '云南石油分公司', prefix: '云南', leader: '罗建军', phone: '0871-63158000' },
      { name: '上海石油分公司', prefix: '上海', leader: '梁志强', phone: '021-52375000' },
      { name: '北京石油分公司', prefix: '北京', leader: '宋佳明', phone: '010-88062000' },
      { name: '天津石油分公司', prefix: '天津', leader: '唐雅琴', phone: '022-23394000' },
      { name: '河北石油分公司', prefix: '河北', leader: '许文远', phone: '0311-86051000' },
      { name: '山西石油分公司', prefix: '山西', leader: '韩立新', phone: '0351-46829000' },
      { name: '江苏石油分公司', prefix: '江苏', leader: '冯玉琴', phone: '025-83247000' },
      {
        name: '上海石油天然气有限公司',
        prefix: '沪气',
        leader: '曹德海',
        phone: '021-68415000',
      },
      { name: '合资公司', prefix: '合资', leader: '彭建华', phone: '021-60739000' },
    ];

    // 省公司下的通用部门。刻意避开浙江职能部门与集团本部部门的用名，
    // 避免 deptId() 按名查询时命中过多同名记录。
    const provinceDepts = ['综合办公室', '安全监督部', '零售管理部'];
    const numberLabels = ['第一', '第二', '第三'];

    for (let i = 0; i < provinces.length; i++) {
      const p = provinces[i];
      const pid = await ensureDept(p.name, hqId, 100 + i, {
        type: '省公司',
        leader: p.leader,
        phone: p.phone,
        ...(p.status != null ? { status: p.status } : {}),
      });
      // 部门排在分公司之前。下级负责人按 (公司序号, 子节点序号) 错位取名，
      // 避免同一姓名在相邻公司重复出现。
      for (let j = 0; j < provinceDepts.length; j++) {
        const seed = i * 5 + j + 3;
        await ensureDept(provinceDepts[j], pid, j + 1, {
          type: '部门',
          leader: pickLeader(seed),
          phone: pickPhone(seed),
        });
      }
      for (let k = 0; k < 2; k++) {
        const seed = i * 5 + provinceDepts.length + k + 3;
        await ensureDept(`${p.prefix}${numberLabels[k]}石油分公司`, pid, 100 + k, {
          type: '分公司',
          leader: pickLeader(seed),
          phone: pickPhone(seed),
        });
      }
    }

    // 浙江石油分公司：本平台的业务主体，保留完整下级结构。
    // orderNum 取 99，紧跟集团本部部门、排在其余省公司之前，便于演示时定位。
    const rootId = await ensureDept('浙江石油分公司', hqId, 99, {
      type: '省公司',
      leader: '董秀英',
      phone: '0571-85156000',
    });

    // 浙江直属职能部门（type=部门）。作为演示主体，负责人逐个指定。
    const funcDepts: { name: string; leader: string; phone: string }[] = [
      { name: '安全环保部', leader: '袁志刚', phone: '0571-85156010' },
      { name: '安全总监', leader: '蒋明辉', phone: '0571-85156020' },
      { name: '非油品中心', leader: '余小波', phone: '0571-85156030' },
      { name: '物流中心', leader: '潘雪梅', phone: '0571-85156040' },
      { name: '重点工程建设办', leader: '杜国栋', phone: '0571-85156050' },
      { name: '新能源办', leader: '戴春华', phone: '0571-85156060' },
      { name: '物业公司', leader: '夏志勇', phone: '0571-85156070' },
      { name: '基建发展部', leader: '钟秀兰', phone: '0571-85156080' },
      { name: '科技信息部', leader: '汪海涛', phone: '0571-85156090' },
      { name: '零售管理中心', leader: '田金龙', phone: '0571-85156100' },
      { name: '战略客户部', leader: '任建斌', phone: '0571-85156110' },
      { name: '虎跑山庄（后勤服务中心）', leader: '姜丽华', phone: '0571-85156120' },
    ];
    for (let i = 0; i < funcDepts.length; i++) {
      await ensureDept(funcDepts[i].name, rootId, i + 1, {
        type: '部门',
        leader: funcDepts[i].leader,
        phone: funcDepts[i].phone,
      });
    }

    // 浙江地市分公司（type=分公司），各自下设通用三级科室。电话用当地真实区号。
    const branches: { name: string; leader: string; phone: string }[] = [
      { name: '杭州石油分公司', leader: '范文涛', phone: '0571-87652000' },
      { name: '宁波石油分公司', leader: '方国平', phone: '0574-87361000' },
      { name: '温州石油分公司', leader: '石永民', phone: '0577-88824000' },
      { name: '嘉兴石油分公司', leader: '姚淑华', phone: '0573-82073000' },
      { name: '湖州石油分公司', leader: '谭志斌', phone: '0572-20315000' },
      { name: '金华石油分公司', leader: '廖建国', phone: '0579-82348000' },
      { name: '台州石油分公司', leader: '邹雅芳', phone: '0576-88516000' },
      { name: '舟山石油分公司', leader: '熊立伟', phone: '0580-20627000' },
      { name: '绍兴石油分公司', leader: '陈志远', phone: '0575-85139000' },
      { name: '衢州石油分公司', leader: '王建国', phone: '0570-30284000' },
      { name: '丽水石油分公司', leader: '李秀珍', phone: '0578-21396000' },
      { name: '浙江油品储运公司', leader: '张国庆', phone: '0571-86745000' },
    ];
    const subDepts = ['经营部', '安全科', '财务科', '油库管理科'];
    for (let i = 0; i < branches.length; i++) {
      const branchId = await ensureDept(branches[i].name, rootId, 100 + i, {
        type: '分公司',
        leader: branches[i].leader,
        phone: branches[i].phone,
      });
      // 科室负责人按 (分公司序号, 科室序号) 错位取名，避免相邻分公司重名
      for (let j = 0; j < subDepts.length; j++) {
        const seed = i * 7 + j + 11;
        await ensureDept(subDepts[j], branchId, j + 1, {
          type: '部门',
          leader: pickLeader(seed),
          phone: pickPhone(seed),
        });
      }
    }

    this.logger.log('部门树已初始化（集团公司 → 省公司 → 分公司 → 部门，四级结构）');
  }
  /**
   * 批量铺开演示员工，覆盖集团本部、各省公司本级及其综合办公室、
   * 浙江职能部门与地市分公司，使人员管理页点任意主要部门都有数据。
   *
   * 工号 E0100 起（E0001~E0018 由 seedEmployees 占用），默认密码 123456。
   * 按 username（唯一约束）幂等，缺失才建；姓名按稳定算法生成，重跑结果一致。
   */
  private async seedBulkEmployees(): Promise<void> {
    // 姓氏与名字分池，用互质步长错位组合，避免出现「同姓连排」的假数据观感
    const surnames = [
      '陈', '王', '李', '张', '刘', '杨', '赵', '孙', '周', '吴',
      '徐', '朱', '马', '胡', '郭', '林', '何', '高', '罗', '梁',
      '宋', '唐', '许', '韩', '冯', '曹', '彭', '董', '袁', '蒋',
    ];
    const givenNames = [
      '志远', '建国', '秀珍', '国庆', '文斌', '慧敏', '学明', '玉华',
      '振海', '晓东', '立群', '建平', '凤兰', '永强', '春梅', '伟民',
      '俊杰', '淑芬', '建军', '志强', '佳明', '雅琴', '文远', '立新',
      '玉琴', '德海', '建华', '秀英', '志刚', '明辉', '小波', '雪梅',
    ];
    // 步长 7 / 13 与池长 30 / 32 互质，保证在总量内不重复循环
    const makeName = (i: number): string =>
      surnames[(i * 7) % surnames.length] + givenNames[(i * 13) % givenNames.length];

    // 岗位按序轮换；部门经理固定给每个部门的第一个人
    const positionCycle = ['安全员', '巡检员', '班组长', '维修工', '考评员'];
    // 少量员工绑定考试相关角色，便于演示阅卷/命题的人员选择
    const roleCycle = ['grader', 'question_setter', 'exam_admin'];

    // 一次性拉全部门与岗位/角色，避免每个员工都查库
    const allDepts = await this.prisma.sysDepartment.findMany({
      select: { id: true, name: true, parentId: true, type: true },
    });
    const hq = allDepts.find((d) => d.parentId === null && d.type === '集团公司');
    const zj = allDepts.find((d) => d.name === '浙江石油分公司');
    if (!hq) {
      this.logger.warn('未找到集团公司根部门，跳过批量员工初始化');
      return;
    }

    const positions = await this.prisma.sysPosition.findMany({ select: { id: true, name: true } });
    const posMap = new Map(positions.map((p) => [p.name, p.id]));
    const roles = await this.prisma.sysRole.findMany({ select: { id: true, label: true } });
    const roleMap = new Map(roles.map((r) => [r.label, r.id]));

    // 待铺开的部门与人数：集团本部部门 3 人，公司本级与其余部门 2 人
    const targets: { deptId: number; count: number }[] = [];
    const pushTarget = (deptId: number, count: number) => targets.push({ deptId, count });

    // 1) 集团本部各部门
    allDepts
      .filter((d) => d.parentId === hq.id && d.type === '部门')
      .forEach((d) => pushTarget(d.id, 3));
    // 2) 各省公司本级（含浙江）
    allDepts.filter((d) => d.type === '省公司').forEach((d) => pushTarget(d.id, 2));
    // 3) 各省公司下的综合办公室
    allDepts
      .filter((d) => d.name === '综合办公室' && d.type === '部门')
      .forEach((d) => pushTarget(d.id, 2));
    // 4) 浙江职能部门与地市分公司
    if (zj) {
      allDepts
        .filter((d) => d.parentId === zj.id && (d.type === '部门' || d.type === '分公司'))
        .forEach((d) => pushTarget(d.id, 2));
    }

    const password = await bcrypt.hash('123456', 12);
    let seq = 0; // 全局序号，决定工号与姓名，保证重跑一致
    let added = 0;
    let skipped = 0;

    for (const t of targets) {
      for (let k = 0; k < t.count; k++) {
        const workId = `E${String(100 + seq).padStart(4, '0')}`;
        seq++;

        const exists = await this.prisma.sysUser.findUnique({ where: { username: workId } });
        if (exists) {
          skipped++;
          continue;
        }

        // 每个部门第一人给部门经理，其余按岗位池轮换
        const posName = k === 0 ? '部门经理' : positionCycle[seq % positionCycle.length];
        // 每 3 人给 1 个考试相关角色，避免角色过于集中
        const roleLabel = seq % 3 === 0 ? roleCycle[seq % roleCycle.length] : undefined;
        const name = makeName(seq);

        const user = await this.prisma.sysUser.create({
          data: {
            username: workId,
            workId,
            password,
            name,
            nickName: name,
            phone: `137${String(10000000 + seq * 31).slice(0, 8)}`,
            status: 1,
            passwordV: 1,
            departmentId: t.deptId,
            positionId: posMap.get(posName) ?? null,
          },
        });
        added++;

        const rid = roleLabel ? roleMap.get(roleLabel) : undefined;
        if (rid) {
          await this.prisma.sysUserRole.create({ data: { userId: user.id, roleId: rid } });
        }
      }
    }

    this.logger.log(
      `批量演示员工已初始化（覆盖 ${targets.length} 个部门，新增 ${added} 人，已存在跳过 ${skipped} 人）`,
    );
  }

  /**
   * 初始化内部员工：分布到各部门 + 岗位，并按需绑定考试相关角色。
   * 工号 E0001 起、默认密码 123456（bcrypt）。按 username（唯一约束）幂等，缺失才建。
   */
  private async seedEmployees(): Promise<void> {
    const password = await bcrypt.hash('123456', 12);

    // 按名称查部门/岗位/角色 id（找不到返回 null，不阻断）
    // 注意：地市分公司下存在同名科室（经营部/安全科等），仅按 name 查可能匹配到多条。
    // 命中多条时打警告并优先取浙江石油分公司的直属部门，避免静默误绑到某个地市分公司科室。
    // 员工清单里的部门均归属浙江，故消歧基准固定为浙江而非集团公司。
    const zjRoot = await this.prisma.sysDepartment.findFirst({
      where: { name: '浙江石油分公司' },
      select: { id: true },
    });
    const deptId = async (name: string) => {
      const matches = await this.prisma.sysDepartment.findMany({ where: { name } });
      if (matches.length === 0) return null;
      if (matches.length === 1) return matches[0].id;
      const underZj = zjRoot ? matches.find((d) => d.parentId === zjRoot.id) : undefined;
      this.logger.warn(
        `部门名「${name}」匹配到 ${matches.length} 条（存在同名科室），已选用${underZj ? '浙江直属部门' : '首条'}，建议员工清单改用唯一部门名`,
      );
      return (underZj ?? matches[0]).id;
    };
    const posId = async (name: string) =>
      (await this.prisma.sysPosition.findUnique({ where: { name } }))?.id ?? null;
    const roleId = async (label: string) =>
      (await this.prisma.sysRole.findUnique({ where: { label } }))?.id ?? null;

    // 员工清单：工号、姓名、部门名、岗位名、手机、可选绑定角色 label
    const employees: Array<{
      workId: string;
      name: string;
      dept: string;
      position: string;
      phone: string;
      roleLabel?: string;
    }> = [
      { workId: 'E0001', name: '陈建国', dept: '安全环保部', position: '部门经理', phone: '13800010001', roleLabel: 'exam_admin' },
      { workId: 'E0002', name: '林伟民', dept: '安全环保部', position: '安全员', phone: '13800010002' },
      { workId: 'E0003', name: '王志强', dept: '安全总监', position: '考评员', phone: '13800010003', roleLabel: 'question_setter' },
      { workId: 'E0004', name: '赵晓东', dept: '科技信息部', position: '部门经理', phone: '13800010004', roleLabel: 'candidate_admin' },
      { workId: 'E0005', name: '孙丽华', dept: '科技信息部', position: '巡检员', phone: '13800010005' },
      { workId: 'E0006', name: '周文斌', dept: '物流中心', position: '班组长', phone: '13800010006' },
      { workId: 'E0007', name: '吴海燕', dept: '零售管理中心', position: '考务管理员', phone: '13800010007', roleLabel: 'exam_admin' },
      { workId: 'E0008', name: '郑国强', dept: '杭州石油分公司', position: '部门经理', phone: '13800010008' },
      { workId: 'E0009', name: '冯建华', dept: '杭州石油分公司', position: '监考员', phone: '13800010009' },
      { workId: 'E0010', name: '许志明', dept: '宁波石油分公司', position: '监考员', phone: '13800010010' },
      { workId: 'E0011', name: '何秀兰', dept: '宁波石油分公司', position: '阅卷员', phone: '13800010011', roleLabel: 'grader' },
      { workId: 'E0012', name: '高峰', dept: '温州石油分公司', position: '巡检员', phone: '13800010012' },
      { workId: 'E0013', name: '罗建平', dept: '金华石油分公司', position: '维修工', phone: '13800010013' },
      { workId: 'E0014', name: '梁春燕', dept: '绍兴石油分公司', position: '阅卷员', phone: '13800010014', roleLabel: 'grader' },
      { workId: 'E0015', name: '宋志刚', dept: '重点工程建设办', position: '命题专家', phone: '13800010015', roleLabel: 'question_setter' },
      { workId: 'E0016', name: '唐丽', dept: '新能源办', position: '考务管理员', phone: '13800010016', roleLabel: 'exam_admin' },
      { workId: 'E0017', name: '韩雪梅', dept: '战略客户部', position: '班组长', phone: '13800010017' },
      { workId: 'E0018', name: '邓超群', dept: '基建发展部', position: '监考员', phone: '13800010018' },
    ];

    let added = 0;
    for (const emp of employees) {
      const exists = await this.prisma.sysUser.findUnique({ where: { username: emp.workId } });
      if (exists) continue;
      const user = await this.prisma.sysUser.create({
        data: {
          username: emp.workId,
          workId: emp.workId,
          password,
          name: emp.name,
          nickName: emp.name,
          phone: emp.phone,
          status: 1,
          passwordV: 1,
          departmentId: await deptId(emp.dept),
          positionId: await posId(emp.position),
        },
      });
      if (emp.roleLabel) {
        const rid = await roleId(emp.roleLabel);
        if (rid) {
          await this.prisma.sysUserRole.upsert({
            where: { userId_roleId: { userId: user.id, roleId: rid } },
            update: {},
            create: { userId: user.id, roleId: rid },
          });
        }
      }
      added++;
    }
    this.logger.log(`内部员工已初始化（新增 ${added} 人，默认密码 123456）`);
  }
  /** 初始化外部单位；按 name（唯一约束）幂等，缺失才建。 */
  private async seedExternalOrgs(): Promise<void> {
    const orgs = [
      { name: '中石化浙江管道有限公司', code: 'ZJGD001', contact: '刘经理', phone: '13910010001', address: '杭州市江干区钱江路 100 号' },
      { name: '浙江省交通投资集团有限公司', code: 'ZJJT002', contact: '陈主任', phone: '13910010002', address: '杭州市西湖区文三路 200 号' },
      { name: '杭州燃气集团有限公司', code: 'HZRQ003', contact: '王工', phone: '13910010003', address: '杭州市拱墅区莫干山路 300 号' },
      { name: '宁波舟山港集团有限公司', code: 'NBZSG004', contact: '赵科长', phone: '13910010004', address: '宁波市北仑区港区路 400 号' },
      { name: '浙江省能源集团有限公司', code: 'ZNJT005', contact: '孙经理', phone: '13910010005', address: '杭州市滨江区江南大道 500 号' },
      { name: '浙江海港集团有限公司', code: 'ZJHG006', contact: '周主管', phone: '13910010006', address: '宁波市镇海区临港路 600 号' },
    ];
    let added = 0;
    for (const o of orgs) {
      const exists = await this.prisma.externalOrg.findUnique({ where: { name: o.name } });
      if (exists) continue;
      await this.prisma.externalOrg.create({ data: { ...o, status: 1 } });
      added++;
    }
    this.logger.log(`外部单位已初始化（新增 ${added} 家）`);
  }

  /**
   * 初始化外部考生：挂到各外部单位下，手机号为登录名，
   * 密码取手机号后 6 位（bcrypt，与业务 createWithAccount 约定一致）。
   * 按 phone（唯一约束）幂等，缺失才建。
   */
  private async seedExternalCandidates(): Promise<void> {
    // 单位名 → 该单位下考生清单（姓名 + 手机号）
    const plan: Array<{ orgName: string; people: Array<{ name: string; phone: string }> }> = [
      {
        orgName: '中石化浙江管道有限公司',
        people: [
          { name: '张伟', phone: '13920010001' },
          { name: '李娜', phone: '13920010002' },
          { name: '王强', phone: '13920010003' },
          { name: '刘洋', phone: '13920010004' },
        ],
      },
      {
        orgName: '浙江省交通投资集团有限公司',
        people: [
          { name: '陈静', phone: '13920010005' },
          { name: '杨帆', phone: '13920010006' },
          { name: '黄磊', phone: '13920010007' },
        ],
      },
      {
        orgName: '杭州燃气集团有限公司',
        people: [
          { name: '吴敏', phone: '13920010008' },
          { name: '徐刚', phone: '13920010009' },
          { name: '孙悦', phone: '13920010010' },
          { name: '朱琳', phone: '13920010011' },
        ],
      },
      {
        orgName: '宁波舟山港集团有限公司',
        people: [
          { name: '马超', phone: '13920010012' },
          { name: '胡兵', phone: '13920010013' },
          { name: '郭涛', phone: '13920010014' },
        ],
      },
      {
        orgName: '浙江省能源集团有限公司',
        people: [
          { name: '林峰', phone: '13920010015' },
          { name: '何丽', phone: '13920010016' },
          { name: '罗勇', phone: '13920010017' },
          { name: '高翔', phone: '13920010018' },
        ],
      },
      {
        orgName: '浙江海港集团有限公司',
        people: [
          { name: '梁艳', phone: '13920010019' },
          { name: '宋涛', phone: '13920010020' },
          { name: '唐磊', phone: '13920010021' },
        ],
      },
    ];

    let added = 0;
    for (const group of plan) {
      const org = await this.prisma.externalOrg.findUnique({ where: { name: group.orgName } });
      if (!org) continue;
      for (const person of group.people) {
        const exists = await this.prisma.externalCandidate.findUnique({ where: { phone: person.phone } });
        if (exists) continue;
        // 密码默认取手机号后 6 位，bcrypt 哈希（与 external-candidate.service 约定一致）
        const password = await bcrypt.hash(person.phone.slice(-6), 12);
        await this.prisma.externalCandidate.create({
          data: { name: person.name, orgId: org.id, phone: person.phone, password, status: 1, passwordV: 1 },
        });
        added++;
      }
    }
    this.logger.log(`外部考生已初始化（新增 ${added} 人，默认密码为手机号后 6 位）`);
  }

  /** 初始化考点；按 name（唯一约束）幂等，缺失才建。 */
  private async seedExamSites(): Promise<void> {
    const sites = [
      { name: '杭州考试中心', address: '杭州市西湖区文一西路 500 号', capacity: 200, contact: '钱老师', phone: '13930010001' },
      { name: '宁波考点', address: '宁波市海曙区中山西路 100 号', capacity: 120, contact: '孙老师', phone: '13930010002' },
      { name: '温州考点', address: '温州市鹿城区车站大道 80 号', capacity: 100, contact: '李老师', phone: '13930010003' },
      { name: '金华考点', address: '金华市婺城区八一南街 60 号', capacity: 80, contact: '周老师', phone: '13930010004' },
      { name: '绍兴考点', address: '绍兴市越城区解放大道 200 号', capacity: 90, contact: '吴老师', phone: '13930010005' },
    ];
    let added = 0;
    for (const s of sites) {
      const exists = await this.prisma.examSite.findUnique({ where: { name: s.name } });
      if (exists) continue;
      await this.prisma.examSite.create({ data: { ...s, status: 1 } });
      added++;
    }
    this.logger.log(`考点已初始化（新增 ${added} 个）`);
  }

  /**
   * 初始化鉴定工种与其鉴定级别。
   *
   * 工种取石化销售企业实际在考的岗位；级别按国家职业技能等级的五级制取用，
   * 只有确实分级的工种才铺满五级——安全员按岗位资格考，不分初中高，只给一个「合格」，
   * 免得列表里出现「安全员 / 高级技师」这种现实中不存在的组合。
   *
   * 幂等：工种按 name 查，已存在则跳过（连级别一起跳，避免重复插子行）。
   */
  private async seedCertOccupations(): Promise<void> {
    const occupations: {
      name: string;
      code: string;
      description: string;
      orderNum: number;
      levels: string[];
    }[] = [
      {
        name: '加油站加油员',
        code: 'GZ001',
        description: '成品油零售加油作业，含计量、收银与现场安全规范',
        orderNum: 1,
        levels: ['五级/初级工', '四级/中级工', '三级/高级工'],
      },
      {
        name: '油品化验员',
        code: 'GZ002',
        description: '油品取样、理化指标检测与化验报告出具',
        orderNum: 2,
        levels: ['五级/初级工', '四级/中级工', '三级/高级工', '二级/技师'],
      },
      {
        name: '危险化学品运输押运员',
        code: 'GZ003',
        description: '危化品道路运输押运、装卸监护与应急处置',
        orderNum: 3,
        levels: ['四级/中级工', '三级/高级工'],
      },
      {
        name: '油库操作工',
        code: 'GZ004',
        description: '储罐收发油、计量交接与油库设备巡检',
        orderNum: 4,
        levels: ['五级/初级工', '四级/中级工', '三级/高级工', '二级/技师'],
      },
      {
        name: '电工（站内维保）',
        code: 'GZ005',
        description: '加油站及油库低压电气设备安装、检修与维护',
        orderNum: 5,
        levels: ['五级/初级工', '四级/中级工', '三级/高级工', '二级/技师', '一级/高级技师'],
      },
      {
        name: '安全管理员',
        code: 'GZ006',
        description: '安全生产岗位资格，按岗位考核不分技能等级',
        orderNum: 6,
        levels: ['岗位合格'],
      },
    ];

    let added = 0;
    for (const occ of occupations) {
      const exists = await this.prisma.certOccupation.findFirst({
        where: { name: occ.name },
      });
      if (exists) continue;

      const { levels, ...occData } = occ;
      await this.prisma.certOccupation.create({
        data: {
          ...occData,
          status: 1,
          levels: {
            create: levels.map((name, i) => ({ name, orderNum: i + 1 })),
          },
        },
      });
      added++;
    }
    this.logger.log(`鉴定工种已初始化（新增 ${added} 个）`);
  }

  /**
   * 初始化企业题库：题库 + 知识点分类树 + 题目（含题目↔知识点关联）。
   * 三层均幂等：题库按 name（唯一）、知识点按 name+parentId、题目按 stem+questionBankId。
   * 题型/难度存数据字典 question_type/difficulty 的 value；选项/答案格式与前端约定一致：
   *   single: options「A. 内容\n...」answer 字母；multiple: answer「A,C」；
   *   judge: options「正确\n错误」answer「正确/错误」；blank: 题干挖空、answer 多空以 \n 分隔；qa: 无选项。
   */
  private async seedQuestionBanks(): Promise<void> {
    await this.seedInfoSecurityBank();
    await this.seedSafetyEduBank();
    await this.seedConstructionSafetyBank();
    this.logger.log('企业题库（信息安全/安全教育/施工安全）已初始化');
  }

  /**
   * 幂等创建题库，返回其 id。
   * @param name 题库名称（唯一）
   * @param code 题库编码（唯一）
   * @param description 描述
   */
  private async ensureBank(name: string, code: string, description: string): Promise<number> {
    const found = await this.prisma.questionBank.findUnique({ where: { name } });
    if (found) return found.id;
    const created = await this.prisma.questionBank.create({
      data: { name, code, description, status: 1 },
    });
    return created.id;
  }

  /**
   * 幂等创建知识点（顶级 parentId=null），返回其 id。
   * 按 name+parentId 组合 findFirst 去重（该组合无唯一约束，code 的唯一约束不适合做去重键：
   * 种子不预设编号，靠它判重会把已存在的节点重复插入）。
   *
   * code 采用「先插入临时值、拿到自增 id 后回填」两步：编号规则是 KP + 8 位补零主键
   * （与 20260822000000_add_knowledge_point_code 回填存量数据的规则一致，
   * 使种子数据与历史数据编号形态统一），而 id 在插入前不可知。
   * 临时值带 TMP- 段，正常编号规则永远不会生成该形态，故不会与真实编号撞唯一约束。
   * @param name 知识点名称
   * @param parentId 父级 id（顶级传 null）
   * @param orderNum 同级排序
   */
  private async ensureKp(name: string, parentId: number | null, orderNum: number): Promise<number> {
    const found = await this.prisma.knowledgePoint.findFirst({ where: { name, parentId } });
    if (found) return found.id;
    const tmpCode = `KP-TMP-${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    const created = await this.prisma.knowledgePoint.create({
      data: { name, parentId, orderNum, code: tmpCode },
    });
    await this.prisma.knowledgePoint.update({
      where: { id: created.id },
      data: { code: `KP${String(created.id).padStart(8, '0')}` },
    });
    return created.id;
  }

  /**
   * 幂等创建题目并关联知识点。按 stem+questionBankId 去重（题目无唯一约束）。
   * @param bankId 所属题库 id
   * @param q 题目数据（type/difficulty 为字典 value）
   * @param kpIds 关联知识点 id 列表
   * @returns 新建返回 true，已存在返回 false
   */
  private async ensureQuestion(
    bankId: number,
    q: {
      stem: string;
      type: string;
      options: string | null;
      answer: string;
      analysis?: string;
      difficulty: string;
      suggestedScore: number;
    },
    kpIds: number[],
  ): Promise<boolean> {
    const found = await this.prisma.question.findFirst({
      where: { stem: q.stem, questionBankId: bankId },
      select: { id: true },
    });
    if (found) return false;
    await this.prisma.question.create({
      data: {
        stem: q.stem,
        // stemText 是题干的纯文本镜像，题目列表搜索打的是这一列。
        // 种子题干为纯文本，stripHtml 等价于原样复制；不写这列则新建的种子题搜不到。
        stemText: stripHtml(q.stem),
        type: q.type,
        options: q.options,
        answer: q.answer,
        analysis: q.analysis ?? null,
        difficulty: q.difficulty,
        suggestedScore: q.suggestedScore,
        status: 'formal',
        questionBankId: bankId,
        knowledgePoints: {
          create: kpIds.map((knowledgePointId) => ({ knowledgePointId })),
        },
      },
    });
    return true;
  }
  /**
   * 幂等创建一道材料题及其小题
   *
   * 材料题只承载共享材料（stem，可含富文本图片），本身无选项无答案、不产生作答位；
   * 分值由小题之和派生。小题继承材料题的题库与状态，避免「材料题正式、小题待审」的割裂。
   *
   * @param bankId 归属题库
   * @param parent 材料题字段（stem 为共享材料）
   * @param children 小题列表，数组顺序即 sortNo
   * @param kpIds 材料题关联的知识点
   * @returns 新建返回 true，已存在返回 false
   */
  private async ensureCompositeQuestion(
    bankId: number,
    parent: { stem: string; difficulty: string; analysis?: string },
    children: Array<{
      stem: string;
      type: string;
      options: string | null;
      answer: string;
      analysis?: string;
      difficulty: string;
      suggestedScore: number;
    }>,
    kpIds: number[],
  ): Promise<boolean> {
    const found = await this.prisma.question.findFirst({
      where: { stem: parent.stem, questionBankId: bankId },
      select: { id: true },
    });
    if (found) return false;

    const total = children.reduce((sum, c) => sum + c.suggestedScore, 0);
    const created = await this.prisma.question.create({
      data: {
        stem: parent.stem,
        stemText: stripHtml(parent.stem),
        type: 'composite',
        options: null,
        answer: '',
        analysis: parent.analysis ?? null,
        difficulty: parent.difficulty,
        // 材料题分值 = 小题之和（派生落库，抽题统计与卷面总分都要用）
        suggestedScore: Math.round(total * 100) / 100,
        status: 'formal',
        questionBankId: bankId,
        knowledgePoints: { create: kpIds.map((knowledgePointId) => ({ knowledgePointId })) },
      },
    });

    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      await this.prisma.question.create({
        data: {
          stem: c.stem,
          stemText: stripHtml(c.stem),
          type: c.type,
          options: c.options,
          answer: c.answer,
          analysis: c.analysis ?? null,
          difficulty: c.difficulty,
          suggestedScore: c.suggestedScore,
          status: 'formal',
          questionBankId: bankId,
          parentId: created.id,
          sortNo: i + 1,
        },
      });
    }
    return true;
  }

  /** 信息安全题库：知识点（密码安全/网络安全/数据保护）+ 7 道题 */
  private async seedInfoSecurityBank(): Promise<void> {
    const bankId = await this.ensureBank('信息安全题库', 'QB_INFOSEC', '面向企业员工的信息安全意识与防护知识题库');
    const kpPwd = await this.ensureKp('密码安全', null, 1);
    const kpNet = await this.ensureKp('网络安全', null, 2);
    const kpData = await this.ensureKp('数据保护', null, 3);

    let added = 0;
    const add = async (q: Parameters<SeedService['ensureQuestion']>[1], kpIds: number[]) =>
      (await this.ensureQuestion(bankId, q, kpIds)) && added++;

    await add(
      {
        stem: '以下哪种做法最有利于保障账户密码安全？',
        type: 'single',
        options: 'A. 多个系统使用同一个简单密码\nB. 使用包含大小写字母、数字和符号的复杂密码并定期更换\nC. 把密码写在办公桌便签上\nD. 用生日作为密码',
        answer: 'B',
        analysis: '强密码应具备足够的复杂度与长度，并定期更换，避免复用与易猜信息。',
        difficulty: 'easy',
        suggestedScore: 5,
      },
      [kpPwd],
    );
    await add(
      {
        stem: '下列哪些属于常见的网络钓鱼攻击特征？',
        type: 'multiple',
        options: 'A. 伪造成银行或公司发来的紧急邮件\nB. 诱导点击可疑链接填写账号密码\nC. 发件人地址与官方域名高度相似但有细微差异\nD. 由公司 IT 部门当面协助安装的正版软件',
        answer: 'A,B,C',
        analysis: '钓鱼邮件通常伪装可信来源、制造紧迫感并诱导点击链接或提交敏感信息；D 项为正常的可信操作，不属于钓鱼特征。',
        difficulty: 'medium',
        suggestedScore: 8,
      },
      [kpNet],
    );
    await add(
      {
        stem: '收到陌生来源的邮件附件时，应立即打开查看内容。',
        type: 'judge',
        options: '正确\n错误',
        answer: '错误',
        analysis: '陌生附件可能携带木马或勒索软件，应先核实来源，必要时经安全扫描后再打开。',
        difficulty: 'easy',
        suggestedScore: 4,
      },
      [kpNet],
    );
    await add(
      {
        stem: '企业内部对敏感数据进行加密存储的主要目的是防止数据在被非法获取后______。',
        type: 'blank',
        options: null,
        answer: '被读取利用',
        analysis: '加密使得即使数据被窃取，攻击者在没有密钥的情况下也无法读取明文内容。',
        difficulty: 'medium',
        suggestedScore: 6,
      },
      [kpData],
    );
    await add(
      {
        stem: '公司要求重要系统开启双因素认证（2FA），其安全价值主要体现在哪里？',
        type: 'qa',
        options: null,
        answer: '在密码泄露的情况下，攻击者仍需第二重验证（如动态验证码、硬件令牌）才能登录，显著降低账户被盗用风险。',
        analysis: '要点：单一密码易泄露；2FA 增加独立验证因子；即便密码失窃也能拦截非法登录。',
        difficulty: 'medium',
        suggestedScore: 10,
      },
      [kpPwd, kpNet],
    );
    await add(
      {
        stem: '员工离职时，关于其账号权限的正确处理方式是？',
        type: 'single',
        options: 'A. 保留账号以便后续联系\nB. 立即禁用或回收其所有系统访问权限\nC. 把账号转给同组其他同事共用\nD. 仅修改密码但保留权限',
        answer: 'B',
        analysis: '离职应遵循最小权限与及时回收原则，防止遗留账号成为安全隐患。',
        difficulty: 'easy',
        suggestedScore: 5,
      },
      [kpData],
    );
    await add(
      {
        stem: '关于个人隐私数据的处理，下列哪些符合数据保护要求？',
        type: 'multiple',
        options: 'A. 仅在业务必要范围内收集\nB. 对存储的敏感数据加密\nC. 未经授权将客户数据分享给第三方\nD. 按最小权限原则控制访问',
        answer: 'A,B,D',
        analysis: 'C 项未经授权对外分享违反数据保护原则；其余符合最小化、加密、最小权限要求。',
        difficulty: 'hard',
        suggestedScore: 8,
      },
      [kpData],
    );

    // 材料题演示：共享材料 + 3 个混合题型小题。
    // 题干用富文本，验证 HTML 存储与考生端渲染链路；不放 <img> 是因为种子跑在
    // 空 uploads 目录上，引用不存在的图片路径会在页面上显示破图。
    const compositeAdded = await this.ensureCompositeQuestion(
      bankId,
      {
        stem:
          '<p><strong>【情景材料】</strong>某加油站员工小李收到一封邮件，' +
          '发件人显示为「中国石化信息中心」，邮件称其 OA 账号存在异常登录，' +
          '要求在 2 小时内点击链接重置密码，否则账号将被冻结。' +
          '小李查看发件人地址为 <em>info-sinopec@sinopec-service.com</em>，' +
          '链接指向 <em>http://oa-sinopec.login-verify.cn</em>。</p>' +
          '<p>请根据以上材料回答下列问题。</p>',
        difficulty: 'medium',
        analysis: '本题考查钓鱼邮件识别、正确处置流程与事后防护措施三个层次。',
      },
      [
        {
          stem: '该邮件最可能属于下列哪种攻击方式？',
          type: 'single',
          options:
            'A. 拒绝服务攻击\nB. 钓鱼邮件攻击\nC. SQL 注入攻击\nD. 中间人攻击',
          answer: 'B',
          analysis: '伪造可信发件人、制造紧迫感、诱导点击非官方域名链接，是钓鱼邮件的典型特征。',
          difficulty: 'easy',
          suggestedScore: 4,
        },
        {
          stem: '材料中哪些细节可以判断该邮件可疑？',
          type: 'multiple',
          options:
            'A. 发件人域名与官方域名不一致\nB. 链接域名并非公司官方域名\nC. 以冻结账号制造时间压力\nD. 邮件提到了 OA 系统',
          answer: 'A,B,C',
          analysis: 'D 项提及 OA 属正常业务内容，不构成可疑特征；A、B、C 均为钓鱼典型信号。',
          difficulty: 'medium',
          suggestedScore: 6,
        },
        {
          stem: '若小李已点击链接并输入了账号密码，请简述他应立即采取的处置措施。',
          type: 'qa',
          options: null,
          answer:
            '立即通过官方渠道修改 OA 及同密码的其他系统密码；第一时间上报信息中心与直属领导；'
            + '配合排查账号异常操作记录；开启二次验证。',
          analysis: '重点在「先改密、再上报、后排查」的处置顺序与密码复用范围的排查。',
          difficulty: 'hard',
          suggestedScore: 10,
        },
      ],
      [kpNet, kpPwd],
    );
    if (compositeAdded) added++;

    this.logger.log(`信息安全题库已初始化（新增题目 ${added} 道）`);
  }
  /** 安全教育题库：知识点（消防安全/应急处置/职业健康）+ 7 道题 */
  private async seedSafetyEduBank(): Promise<void> {
    const bankId = await this.ensureBank('安全教育题库', 'QB_SAFEEDU', '面向全员的安全生产教育与应急知识题库');
    const kpFire = await this.ensureKp('消防安全', null, 1);
    const kpEmer = await this.ensureKp('应急处置', null, 2);
    const kpHealth = await this.ensureKp('职业健康', null, 3);

    let added = 0;
    const add = async (q: Parameters<SeedService['ensureQuestion']>[1], kpIds: number[]) =>
      (await this.ensureQuestion(bankId, q, kpIds)) && added++;

    await add(
      {
        stem: '发现初起火灾时，下列哪种做法是正确的？',
        type: 'single',
        options: 'A. 先乘坐电梯逃离现场\nB. 立即拨打 119 并根据火情使用灭火器扑救\nC. 打开所有门窗通风\nD. 返回工位收拾个人物品',
        answer: 'B',
        analysis: '火灾时禁乘电梯；应及时报警并在安全前提下使用灭火器扑救初起火灾。',
        difficulty: 'easy',
        suggestedScore: 5,
      },
      [kpFire],
    );
    await add(
      {
        stem: '使用干粉灭火器扑救火灾的正确步骤包括哪些？',
        type: 'multiple',
        options: 'A. 拔掉保险销\nB. 握住喷管对准火焰根部\nC. 压下压把喷射\nD. 对准火焰顶部喷射',
        answer: 'A,B,C',
        analysis: '灭火应对准火焰根部而非顶部；正确步骤为拔销、对准根部、压把喷射，并保持在上风方向以策安全。D 项对准顶部无法有效灭火，为错误做法。',
        difficulty: 'medium',
        suggestedScore: 8,
      },
      [kpFire],
    );
    await add(
      {
        stem: '安全出口的疏散通道可以临时堆放杂物，只要不完全堵死即可。',
        type: 'judge',
        options: '正确\n错误',
        answer: '错误',
        analysis: '疏散通道和安全出口必须保持畅通，严禁堆放任何杂物，以保障紧急疏散。',
        difficulty: 'easy',
        suggestedScore: 4,
      },
      [kpEmer],
    );
    await add(
      {
        stem: '发生人员触电事故时，救护的第一步应是迅速______，使触电者脱离电源。',
        type: 'blank',
        options: null,
        answer: '切断电源',
        analysis: '触电急救首要是安全断电，切忌直接徒手接触触电者，防止救护人一同触电。',
        difficulty: 'medium',
        suggestedScore: 6,
      },
      [kpEmer],
    );
    await add(
      {
        stem: '长期在噪声较大的作业环境中工作，企业应采取哪些职业健康防护措施？',
        type: 'qa',
        options: null,
        answer: '为员工配备合格的防噪耳塞/耳罩等个人防护用品；对设备采取降噪隔音改造；合理安排轮岗缩短暴露时间；定期组织职业健康体检并建立健康档案。',
        analysis: '要点：个人防护、工程降噪、管理轮岗、定期体检建档，多措并举。',
        difficulty: 'hard',
        suggestedScore: 10,
      },
      [kpHealth],
    );
    await add(
      {
        stem: '员工上岗前必须完成的"三级安全教育"通常指哪三级？',
        type: 'single',
        options: 'A. 公司级、部门级、班组级\nB. 国家级、省级、市级\nC. 初级、中级、高级\nD. 岗前、岗中、岗后',
        answer: 'A',
        analysis: '"三级安全教育"指公司（厂）级、车间（部门）级、班组级三个层级的安全教育培训。',
        difficulty: 'easy',
        suggestedScore: 5,
      },
      [kpHealth],
    );
    await add(
      {
        stem: '关于个人劳动防护用品（PPE）的使用，下列哪些说法正确？',
        type: 'multiple',
        options: 'A. 进入施工现场必须佩戴安全帽\nB. 防护用品可根据个人喜好选择是否佩戴\nC. 高处作业须正确系挂安全带\nD. 防护用品损坏后应及时更换',
        answer: 'A,C,D',
        analysis: 'B 项错误，PPE 佩戴是强制要求而非个人选择；其余均为正确的防护要求。',
        difficulty: 'medium',
        suggestedScore: 8,
      },
      [kpHealth],
    );

    this.logger.log(`安全教育题库已初始化（新增题目 ${added} 道）`);
  }
  /** 施工安全题库：知识点（高处作业/动火作业/受限空间/机械设备）+ 8 道题 */
  private async seedConstructionSafetyBank(): Promise<void> {
    const bankId = await this.ensureBank('施工安全题库', 'QB_CONSTR', '面向施工作业人员的现场安全操作与危险作业管理题库');
    const kpHigh = await this.ensureKp('高处作业', null, 1);
    const kpFire = await this.ensureKp('动火作业', null, 2);
    const kpConfined = await this.ensureKp('受限空间', null, 3);
    const kpMachine = await this.ensureKp('机械设备', null, 4);

    let added = 0;
    const add = async (q: Parameters<SeedService['ensureQuestion']>[1], kpIds: number[]) =>
      (await this.ensureQuestion(bankId, q, kpIds)) && added++;

    await add(
      {
        stem: '在多少米及以上的高度进行的作业属于国家标准定义的"高处作业"？',
        type: 'single',
        options: 'A. 1 米\nB. 2 米\nC. 3 米\nD. 5 米',
        answer: 'B',
        analysis: '按 GB/T 3608 规定，在坠落高度基准面 2 米及以上有可能坠落的作业即为高处作业。',
        difficulty: 'easy',
        suggestedScore: 5,
      },
      [kpHigh],
    );
    await add(
      {
        stem: '高处作业时，安全带的正确使用要求包括哪些？',
        type: 'multiple',
        options: 'A. 高挂低用\nB. 挂在牢固可靠的固定点上\nC. 可随意系挂在脚手架的活动杆件上\nD. 使用前检查是否完好',
        answer: 'A,B,D',
        analysis: 'C 项错误，安全带不得挂在不牢固或活动的构件上；应做到高挂低用、挂靠牢固、使用前检查。',
        difficulty: 'medium',
        suggestedScore: 8,
      },
      [kpHigh],
    );
    await add(
      {
        stem: '动火作业前必须办理动火作业许可证并进行可燃气体检测。',
        type: 'judge',
        options: '正确\n错误',
        answer: '正确',
        analysis: '动火作业属于危险作业，须履行审批许可并检测环境可燃气体浓度合格后方可作业。',
        difficulty: 'easy',
        suggestedScore: 4,
      },
      [kpFire],
    );
    await add(
      {
        stem: '进入受限空间作业前，必须严格执行"先通风、再______、后作业"的原则。',
        type: 'blank',
        options: null,
        answer: '检测',
        analysis: '受限空间作业铁律：先通风置换、再检测氧含量与有毒有害气体、合格后方可进入作业。',
        difficulty: 'medium',
        suggestedScore: 6,
      },
      [kpConfined],
    );
    await add(
      {
        stem: '受限空间作业为什么必须安排专人在外部进行监护？',
        type: 'qa',
        options: null,
        answer: '受限空间内可能存在缺氧、中毒、窒息等突发风险，作业人员一旦发生意外难以自救；外部监护人可实时观察、保持联络，并在紧急情况下立即报警和组织科学施救，避免盲目施救造成伤亡扩大。',
        analysis: '要点：内部风险突发难自救；监护人观察联络；紧急报警与科学施救、防止盲目施救。',
        difficulty: 'hard',
        suggestedScore: 10,
      },
      [kpConfined],
    );
    await add(
      {
        stem: '操作旋转类机械设备时，下列哪种行为是被严格禁止的？',
        type: 'single',
        options: 'A. 作业前检查设备防护装置\nB. 戴手套操作高速旋转的钻床\nC. 停机后再清理设备\nD. 按规程佩戴防护眼镜',
        answer: 'B',
        analysis: '操作高速旋转设备（如钻床）严禁戴手套，防止手套被卷入造成绞伤。',
        difficulty: 'medium',
        suggestedScore: 5,
      },
      [kpMachine],
    );
    await add(
      {
        stem: '机械设备的安全防护应遵循哪些要求？',
        type: 'multiple',
        options: 'A. 传动部位设置防护罩\nB. 设备带病运行以赶工期\nC. 设置急停按钮\nD. 检修时执行上锁挂牌（LOTO）',
        answer: 'A,C,D',
        analysis: 'B 项错误，严禁设备带病运行；其余为传动防护、急停、检修上锁挂牌等基本安全要求。',
        difficulty: 'medium',
        suggestedScore: 8,
      },
      [kpMachine],
    );
    await add(
      {
        stem: '脚手架搭设完成后，在投入使用前应经过验收合格。',
        type: 'judge',
        options: '正确\n错误',
        answer: '正确',
        analysis: '脚手架属于危险性较大的设施，搭设完毕须经验收合格并挂牌后方可投入使用。',
        difficulty: 'easy',
        suggestedScore: 4,
      },
      [kpHigh],
    );

    this.logger.log(`施工安全题库已初始化（新增题目 ${added} 道）`);
  }

  /**
   * 初始化考生端（移动端）首页演示数据
   *
   * 首页四项统计与「待考提醒」都按登录考生过滤，若该账号名下没有
   * 考试分配与答卷，页面会全空。此方法给管理员账号补齐可见数据：
   * 挂部门（供「所属单位/部门」解析）、两场待考考试、一份已交答卷。
   *
   * 幂等：以待考考试名为标记，已存在则整体跳过。
   *
   * @param adminUserId 管理员用户 ID（演示考生）
   */
  private async seedAppHomeDemoData(adminUserId: number): Promise<void> {
    const ONGOING_EXAM_NAME = '2026年度安全生产知识考核';
    const existed = await this.prisma.exam.findFirst({
      where: { name: ONGOING_EXAM_NAME },
      select: { id: true },
    });
    if (existed) {
      this.logger.log('考生端首页演示数据已存在，跳过');
      return;
    }

    // 1) 给管理员挂部门：内部员工的「所属单位」由部门沿 parentId 上溯到公司节点得出，
    //    departmentId 为空时移动端「所属单位/所属部门」都会显示 -
    const dept = await this.prisma.sysDepartment.findFirst({
      where: { type: '部门' },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    // 仅在未设置时补默认部门，避免覆盖后台手工调整过的归属
    const adminRow = await this.prisma.sysUser.findUnique({
      where: { id: adminUserId },
      select: { departmentId: true },
    });
    if (dept && !adminRow?.departmentId) {
      await this.prisma.sysUser.update({
        where: { id: adminUserId },
        data: { departmentId: dept.id },
      });
    }

    const now = Date.now();
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;

    // 2) 两场考试各自的试卷（Exam.paperId 必填）
    const paperA = await this.createSeedPaper(
      '2026年度安全生产知识试卷',
      60,
      adminUserId,
    );
    const paperB = await this.createSeedPaper(
      '危险化学品管理专项试卷',
      90,
      adminUserId,
    );

    // 3) 一场进行中（30 分钟前开始）、一场 2 天后开始，覆盖首页两种状态展示
    const ongoingExam = await this.prisma.exam.create({
      data: {
        name: ONGOING_EXAM_NAME,
        description: '覆盖安全生产法律法规与劳动防护用品使用规范，及格分 60 分。',
        paperId: paperA.id,
        startTime: new Date(now - 30 * 60 * 1000),
        endTime: new Date(now + 2 * HOUR),
        duration: 60,
        // 及格线按试卷实际总分的 60% 算：题库题目分值之和不一定是 100，
        // 写死 60 会让及格线相对总分过高（63 分卷要求 95% 正确率）
        passScore: Math.round(paperA.totalScore * 0.6),
        status: 'ongoing',
        createBy: adminUserId,
      },
    });
    const upcomingExam = await this.prisma.exam.create({
      data: {
        name: '危险化学品管理专项考试',
        description: '危化品储存规范与泄漏应急处置，含简答题，及格分 60 分。',
        paperId: paperB.id,
        startTime: new Date(now + 2 * DAY),
        endTime: new Date(now + 2 * DAY + 90 * 60 * 1000),
        duration: 90,
        passScore: Math.round(paperB.totalScore * 0.6),
        status: 'published',
        createBy: adminUserId,
      },
    });

    const admin = await this.prisma.sysUser.findUnique({
      where: { id: adminUserId },
      select: { name: true, nickName: true },
    });
    const adminName = admin?.name || admin?.nickName || '管理员';

    // 4) 把管理员分配为两场考试的考生：首页待考提醒只取该考生名下的考试
    await this.prisma.examCandidate.createMany({
      data: [
        {
          examId: ongoingExam.id,
          candidateType: 'internal',
          internalUserId: adminUserId,
        },
        {
          examId: upcomingExam.id,
          candidateType: 'internal',
          internalUserId: adminUserId,
        },
      ],
    });

    await this.seedAppHomeAnswerSheet(adminUserId, adminName);
    this.logger.log('考生端首页演示数据已初始化（部门/待考考试/答卷）');
  }

  /**
   * 造一个「确定不等于标准答案」的错误作答，用于演示答卷的错题
   *
   * 判断题只有两个选项，取反即错；选择题避开标准答案里出现过的选项字母；
   * 填空/其他题型直接给一段明显不同的文本。
   *
   * @param standardAnswer 题目的标准答案
   * @returns 与标准答案不同的作答
   */
  private makeWrongAnswer(standardAnswer: string): string {
    const answer = (standardAnswer ?? '').trim();
    if (answer === '正确') return '错误';
    if (answer === '错误') return '正确';

    // 选择题：标准答案由 A-D 组成时，挑一个没被选中的字母
    if (/^[A-D](,[A-D])*$/.test(answer)) {
      const chosen = new Set(answer.split(','));
      const unused = ['A', 'B', 'C', 'D'].find((letter) => !chosen.has(letter));
      // 四个选项全选中的极端情况下，少选一个也算错
      return unused ?? answer.split(',').slice(0, -1).join(',');
    }

    return '演示错误作答';
  }

  /**
   * 创建一张挂满题目的固定试卷（考生端取卷依赖 PaperQuestion，空卷会取不到题）
   *
   * 题目取题库前 10 道，分值用题目自带的建议分值，试卷总分与题量按实际挂题回填。
   *
   * @param name 试卷名称
   * @param suggestDuration 建议时长（分钟）
   * @param adminUserId 创建人用户 ID
   * @returns 创建出的试卷（含 id）
   */
  private async createSeedPaper(
    name: string,
    suggestDuration: number,
    adminUserId: number,
  ) {
    // parentId: null 排除材料题下的小题——小题不能作为独立题目挂上试卷，
    // 否则它会脱离材料单独出现在卷面上
    const questions = await this.prisma.question.findMany({
      where: { parentId: null },
      select: { id: true, suggestedScore: true },
      orderBy: { id: 'asc' },
      take: 10,
    });
    const totalScore = questions.reduce((sum, q) => sum + q.suggestedScore, 0);

    const paper = await this.prisma.paper.create({
      data: {
        name,
        type: 'fixed',
        status: 'published',
        totalScore,
        questionCount: questions.length,
        suggestDuration,
        createBy: adminUserId,
        visibleScope: 'all',
        shareLevel: 'manage',
      },
    });

    if (questions.length > 0) {
      await this.prisma.paperQuestion.createMany({
        data: questions.map((q, index) => ({
          paperId: paper.id,
          questionId: q.id,
          score: q.suggestedScore,
          sortNo: index + 1,
        })),
      });
    }
    return paper;
  }

  /**
   * 为考生端首页造一份已交答卷及其答题明细
   *
   * 首页「已考次数」取已提交答卷数（submitTime 非空），「错题数」取
   * 判错的答题项数（isCorrect=false），两者都需要真实答卷支撑。
   * 挂到既有的演示考试上，不新建考试，避免污染待考提醒。
   *
   * @param adminUserId 管理员用户 ID（演示考生）
   * @param candidateName 考生姓名快照
   */
  private async seedAppHomeAnswerSheet(
    adminUserId: number,
    candidateName: string,
  ): Promise<void> {
    const questions = await this.prisma.question.findMany({
      // parentId: null 排除小题——材料题不产生作答记录，小题也不该以独立题身份进演示答卷；
      // 材料题本身也排除（答案为空，演示作答无从自洽），故这里只取普通题
      where: { parentId: null, type: { not: 'composite' } },
      // answer 用于让演示作答与标准答案自洽（答对填真答案、答错填确定不同的值）
      select: { id: true, type: true, suggestedScore: true, answer: true },
      orderBy: { id: 'asc' },
      take: 10,
    });
    if (questions.length === 0) {
      this.logger.warn('题库为空，跳过答卷演示数据');
      return;
    }

    // 自建一场已结束的考试来承载历史答卷：不依赖「库里恰好存在 finished 考试」，
    // 全新库首次初始化时同样成立；已结束不会出现在待考提醒里
    const now = new Date();
    const DAY = 24 * 60 * 60 * 1000;
    const historyPaper = await this.prisma.paper.create({
      data: {
        name: '【历史】安全生产基础试卷',
        type: 'fixed',
        status: 'published',
        totalScore: questions.reduce((sum, q) => sum + q.suggestedScore, 0),
        questionCount: questions.length,
        suggestDuration: 60,
        createBy: adminUserId,
        visibleScope: 'all',
        shareLevel: 'manage',
      },
    });
    await this.prisma.paperQuestion.createMany({
      data: questions.map((q, index) => ({
        paperId: historyPaper.id,
        questionId: q.id,
        score: q.suggestedScore,
        sortNo: index + 1,
      })),
    });
    const historyExam = await this.prisma.exam.create({
      data: {
        name: '【历史】安全生产基础考核',
        description: '演示用历史考试，已结束并出分，用于展示考试记录与错题。',
        paperId: historyPaper.id,
        startTime: new Date(now.getTime() - 7 * DAY),
        endTime: new Date(now.getTime() - 7 * DAY + 60 * 60 * 1000),
        duration: 60,
        passScore: Math.round(historyPaper.totalScore * 0.6),
        status: 'finished',
        createBy: adminUserId,
      },
    });
    // 答卷所属考试也要有考生分配，否则出现「有答卷但非该场考生」的数据不一致
    await this.prisma.examCandidate.create({
      data: {
        examId: historyExam.id,
        candidateType: 'internal',
        internalUserId: adminUserId,
      },
    });

    // 题型决定判分方式：客观题（单选/多选/判断/填空）可自动判对错，
    // 主观题（qa）没有 isCorrect 语义，只有得分，不能标成客观题
    const OBJECTIVE_TYPES = new Set(['single', 'multiple', 'judge', 'blank']);

    // 前 3 道客观题判错，用于演示首页「错题数」
    const WRONG_LIMIT = 3;

    let wrongUsed = 0;
    let objectiveScore = 0;
    let subjectiveScore = 0;
    const items = questions.map((q, index) => {
      const isObjective = OBJECTIVE_TYPES.has(q.type);
      const fullScore = q.suggestedScore;

      if (!isObjective) {
        // 主观题：给满分的一半并标记已阅，isCorrect 留空（无对错语义）
        const score = Math.round(fullScore / 2);
        subjectiveScore += score;
        return {
          answerSheetId: 0,
          questionId: q.id,
          questionNo: index + 1,
          questionCategory: 'subjective',
          fullScore,
          candidateAnswer: '演示作答：按操作规程执行并做好记录。',
          standardAnswer: q.answer,
          isCorrect: null,
          score,
          finalScore: score,
        };
      }

      const markWrong = wrongUsed < WRONG_LIMIT;
      if (markWrong) wrongUsed += 1;
      const score = markWrong ? 0 : fullScore;
      objectiveScore += score;
      return {
        answerSheetId: 0,
        questionId: q.id,
        questionNo: index + 1,
        questionCategory: 'objective',
        fullScore,
        // 作答必须与真实答案自洽：答对就填真答案，答错填一个确定不同的值。
        // 写死 'A'/'B' 会造出「作答与标准答案一致却判 0 分」的矛盾数据，
        // 成绩复盘页看起来就像判分错了。
        candidateAnswer: markWrong ? this.makeWrongAnswer(q.answer) : q.answer,
        standardAnswer: q.answer,
        isCorrect: !markWrong,
        score,
        finalScore: score,
      };
    });

    const totalScore = objectiveScore + subjectiveScore;
    const sheet = await this.prisma.answerSheet.create({
      data: {
        examId: historyExam.id,
        candidateType: 'internal',
        internalUserId: adminUserId,
        candidateName,
        objectiveScore,
        subjectiveScore,
        totalScore,
        // 阅卷状态用 completed（与 grading.service 的发布态一致）
        gradingStatus: 'completed',
        scorePublished: true,
        // 与所属考试的及格线比较，而非写死分值
        passed: totalScore >= historyExam.passScore,
        startTime: new Date(historyExam.startTime),
        submitTime: new Date(historyExam.endTime),
      },
    });

    await this.prisma.answerItem.createMany({
      data: items.map((item) => ({ ...item, answerSheetId: sheet.id })),
    });
  }
}
