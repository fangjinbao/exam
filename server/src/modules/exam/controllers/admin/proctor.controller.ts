import {
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  MethodNotAllowedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CrudController, CrudControllerFactory } from '@/common/crud';
import { Perms, OperationLog, ApiPageResult } from '@/common/decorators';
import { Admin } from '@/common/decorators/admin.decorator';
import type { AdminPayload } from '../../services/org-scope.service';
import { ProctorService } from '../../services/proctor.service';
import { ProctorMutationService } from '../../services/proctor-mutation.service';
import { ExamService } from '../../services/exam.service';
import { ProctorSheetActionDto } from '../../dto/proctor.dto';
import { ProctorExamVo } from '../../vo/proctor.vo';

/**
 * 监考中心（管理端）
 *
 * 与阅卷中心并列的独立入口：监考人只看指派给自己的考试（超管看全部），
 * 进去后按考生维度看考试进行情况，并可强制交卷 / 解锁续答 / 清空重考。
 *
 * 【历史】该模块曾于 20260816010000_remove_proctor_center 整体下线。
 * 本次重建复用现有的 ExamStaff(role=proctor) 指派与 AnswerSheet.switchCount，
 * 不恢复当时删掉的监考安排表与逐条异常事件台账。
 */
@ApiTags('监考中心')
@CrudController({
  // ⚠️ api: [] 不能阻止基类 CRUD 路由注册（该字段只写进类元数据），
  // 基类的 detail/add/update/update-status/delete/batch-delete 仍会沿原型链挂上来，
  // 故在类末尾逐个覆写收口，与阅卷中心同款做法。
  prefix: 'admin/exam/proctor',
  api: [],
})
export class ProctorController extends CrudControllerFactory(ProctorExamVo) {
  constructor(
    private readonly proctorService: ProctorService,
    private readonly mutation: ProctorMutationService,
    private readonly examService: ExamService,
  ) {
    // 基类要求传一个 BaseService；监考没有单一主表实体（列表是考试维度、
    // 动作落在答卷上），传 proctorService 仅为满足签名，基类 CRUD 已全部覆写屏蔽
    super(proctorService as never);
  }

  /**
   * 解析「监考指派过滤用的 userId」
   * 超管返回 undefined（不过滤）；其余返回本人 userId。
   * 缺省时返回 -1 而非 undefined：拿不到身份时应当什么都看不到，不能退化成看全部。
   */
  private resolveAssignedTo(admin?: AdminPayload): number | undefined {
    // 超管判定沿用项目既有做法，见 base/controllers/open.controller.ts
    return admin?.username === 'admin' ? undefined : (admin?.userId ?? -1);
  }

  /**
   * 监考指派守卫：非超管访问未指派给自己的考试时拒绝
   *
   * 列表已按指派过滤，但按 examId / sheetId 的接口若不校验，
   * 拿到（或猜到）ID 就能强制交卷、清空他人考试，属水平越权，故逐个接口拦。
   * 考试不存在与无权访问统一返回同一提示，避免按 ID 探测考试是否存在。
   *
   * @returns 通过返回 null；未通过返回可直接 return 的失败响应
   */
  private async denyIfNotAssigned(examId: number, admin?: AdminPayload) {
    const assignedTo = this.resolveAssignedTo(admin);
    const allowed = await this.proctorService.canProctorExam(examId, assignedTo);
    return allowed ? null : this.fail('考试不存在或未指派给你监考');
  }

  /*
    ⚠️ @Get('list') 必须显式标注。

    覆写基类方法时，父类方法上的路由元数据不会被子类方法继承：子类原型上的
    list 若不带 HTTP 装饰器，Nest 扫描时就认为它不是路由处理器，
    基类原本注册的 list 又被这次覆写遮蔽——结果整个接口消失，表现为 404
    「Cannot GET /admin/exam/proctor/list」，而编译和启动都不会报错。
    阅卷中心的同名覆写（grading.controller.ts:187）同样显式标了 @Get('list')。
  */
  @Get('list')
  @Perms('list')
  @ApiOperation({ summary: '监考考试列表（只含指派给自己的；超管看全部）' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数（1-100）' })
  @ApiQuery({ name: 'name', required: false, description: '考试名称（模糊）' })
  @ApiQuery({ name: 'status', required: false, description: 'published/ongoing/finished' })
  // 覆写会遮蔽工厂类的 @ApiPageResult(vo)，须自己补上（同阅卷中心的 list）
  @ApiPageResult(ProctorExamVo)
  override async list(@Query() query: Record<string, any>, @Admin() admin?: AdminPayload) {
    const p = Math.max(Number(query.page) || 1, 1);
    const ps = Math.min(Math.max(Number(query.pageSize) || 10, 1), 100);
    const data = await this.proctorService.pageList(
      { name: query.name, status: query.status },
      p,
      ps,
      // 超管看全部；其余人只看指派给自己监考的考试
      this.resolveAssignedTo(admin),
    );
    return this.ok(data);
  }

  @Get('candidates/:examId')
  @Perms('detail')
  @ApiOperation({ summary: '某场考试的考生监考名单（含切屏次数与作答进度）' })
  @ApiParam({ name: 'examId', description: '考试 ID' })
  async candidates(
    @Param('examId', ParseIntPipe) examId: number,
    @Admin() admin?: AdminPayload,
  ) {
    const denied = await this.denyIfNotAssigned(examId, admin);
    if (denied) return denied;
    const data = await this.proctorService.listCandidates(examId);
    if (!data) return this.fail('考试不存在');
    return this.ok(data);
  }

  /**
   * 三个写动作的共用前置校验
   *
   * 都要求考试处于 ongoing：未开考没有可干预的作答；已结束后干预会与成绩、
   * 阅卷状态冲突（列表允许查看已结束的考试，但只读）。
   *
   * @returns 通过返回该场考试的及格分；未通过返回可直接 return 的失败响应
   */
  private async guardOngoing(examId: number, admin?: AdminPayload) {
    const denied = await this.denyIfNotAssigned(examId, admin);
    if (denied) return { denied };
    // getRealStatus 会惰性回写状态，保证这里读到的是按当前时间算出的真实值
    const real = await this.examService.getRealStatus(examId);
    if (real === null) return { denied: this.fail('考试不存在') };
    if (real !== 'ongoing') {
      return { denied: this.fail('仅考试进行中可执行监考操作') };
    }
    const passScore = await this.proctorService.getPassScore(examId);
    if (passScore === null) return { denied: this.fail('考试不存在') };
    return { passScore };
  }

  @Post('force-submit')
  @Perms('force-submit')
  @ApiOperation({ summary: '强制交卷（监考代考生提交）' })
  @OperationLog({ target: '监考中心', type: '编辑', content: '强制交卷' })
  async forceSubmit(@Body() dto: ProctorSheetActionDto, @Admin() admin?: AdminPayload) {
    const g = await this.guardOngoing(dto.examId, admin);
    if (g.denied) return g.denied;
    const err = await this.mutation.forceSubmit(dto.examId, dto.sheetId, g.passScore!);
    if (err) return this.fail(err);
    return this.ok(null, '已强制交卷');
  }

  @Post('unlock')
  @Perms('force-submit')
  @ApiOperation({ summary: '解锁续答（清零切屏次数并撤销交卷，保留已答内容）' })
  @OperationLog({ target: '监考中心', type: '编辑', content: '解锁续答' })
  async unlock(@Body() dto: ProctorSheetActionDto, @Admin() admin?: AdminPayload) {
    const g = await this.guardOngoing(dto.examId, admin);
    if (g.denied) return g.denied;
    const err = await this.mutation.unlockForContinue(dto.examId, dto.sheetId);
    if (err) return this.fail(err);
    return this.ok(null, '已解锁，考生可继续答题');
  }

  @Post('reset')
  @Perms('reset')
  @ApiOperation({ summary: '清空重考（删除答卷与已答内容，不可逆）' })
  @OperationLog({ target: '监考中心', type: '删除', content: '清空重考' })
  async reset(@Body() dto: ProctorSheetActionDto, @Admin() admin?: AdminPayload) {
    const g = await this.guardOngoing(dto.examId, admin);
    if (g.denied) return g.denied;
    const err = await this.mutation.resetForRetake(dto.examId, dto.sheetId);
    if (err) return this.fail(err);
    return this.ok(null, '已清空该考生的作答，可重新开考');
  }

  /*
    屏蔽基类通用 CRUD：监考中心没有可直接增删改的主表实体，
    列表是考试维度的只读视图，写动作只有上面三个带守卫的接口。

    加 override 是刻意的：基类日后重命名（如 updateStatus → patchStatus）会让覆写
    静默退化成无人调用的新方法，基类那条带 @Perms 的路由随之重新注册且无守卫；
    加 override 后这种改名直接编译报错。
    抛 MethodNotAllowedException 而非 this.fail()：后者返回 code:400 的 200 外壳，
    会把编程错误伪装成一次正常的业务失败。
  */
  private static readonly UNSUPPORTED = '监考模块不支持该操作';

  override async detail(): Promise<never> {
    throw new MethodNotAllowedException(ProctorController.UNSUPPORTED);
  }

  override async add(): Promise<never> {
    throw new MethodNotAllowedException(ProctorController.UNSUPPORTED);
  }

  override async update(): Promise<never> {
    throw new MethodNotAllowedException(ProctorController.UNSUPPORTED);
  }

  override async updateStatus(): Promise<never> {
    throw new MethodNotAllowedException(ProctorController.UNSUPPORTED);
  }

  override async delete(): Promise<never> {
    throw new MethodNotAllowedException(ProctorController.UNSUPPORTED);
  }

  override async batchDelete(): Promise<never> {
    throw new MethodNotAllowedException(ProctorController.UNSUPPORTED);
  }
}
