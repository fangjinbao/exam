import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { AppUserType } from '@/modules/app-auth/dto/app-auth.dto';
import { AppMessageDetailVo, AppMessageItemVo } from '../vo/app-message.vo';

/** 消息类型 */
const TYPE = {
  EXAM_NOTICE: 'exam_notice',
  APPLY_RESULT: 'apply_result',
  SCORE_RELEASE: 'score_release',
} as const;

/** 消息类型中文文案（与移动端 constants/exam.js 的 MESSAGE_TYPE_TEXT 保持一致） */
const TYPE_TEXT: Record<string, string> = {
  [TYPE.EXAM_NOTICE]: '考试通知',
  [TYPE.APPLY_RESULT]: '报考审核结果',
  [TYPE.SCORE_RELEASE]: '成绩发布',
};

/** 派生消息的中间结构（未附加已读状态） */
interface DerivedMessage {
  id: string;
  type: string;
  title: string;
  /** 排序与展示用的原始时间 */
  at: Date;
  content: string;
}

/** 格式化为 yyyy-MM-dd HH:mm:ss，与项目其他考生端接口的时间风格一致 */
function fmt(d: Date | null | undefined): string {
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

/** 只到分钟，用于正文里的时间区间 */
function fmtMin(d: Date | null | undefined): string {
  const s = fmt(d);
  return s ? s.slice(0, 16) : '';
}

/**
 * 考生端消息服务
 *
 * 消息本身不落库——三类消息都是既有业务数据的另一种呈现：
 *   exam_notice   ← ExamCandidate + Exam（考试已发布且分配给我）
 *   apply_result  ← CertApplication（我的报考已审核出结果）
 *   score_release ← AnswerSheet（我的答卷已发布成绩）
 * 这样管理端发布考试/审核报考/发布成绩后消息自动出现，无需额外写入，
 * 也不会出现「业务已撤销但消息还在」的不一致。只有已读状态需要持久化。
 */
@Injectable()
export class AppMessageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 构造「限定为当前考生」的查询条件
   *
   * 两类考生 id 各自自增（internal 的 1 与 external 的 1 不是同一个人），
   * 只按 id 过滤会串号，必须同时限定 candidateType 与对应外键列。
   * 与 AppHomeService.candidateWhere 同口径。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  private candidateWhere(userId: number, userType: AppUserType) {
    return userType === 'internal'
      ? { candidateType: 'internal', internalUserId: userId }
      : { candidateType: 'external', externalCandidateId: userId };
  }

  /**
   * 已读表的定位条件（该表用 userType 而非 candidateType 命名）
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  private readWhere(userId: number, userType: AppUserType) {
    return userType === 'internal'
      ? { userType: 'internal', internalUserId: userId }
      : { userType: 'external', externalCandidateId: userId };
  }

  /**
   * 派生全部消息（不含已读状态），按时间倒序
   *
   * 三类消息各查一次，并行发出。任一类无数据只是少几条消息，不影响其余。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  private async derive(userId: number, userType: AppUserType): Promise<DerivedMessage[]> {
    const where = this.candidateWhere(userId, userType);

    const [assignments, applications, sheets] = await Promise.all([
      // 考试通知：未发布的考试对考生不可见，故只取已发布及之后的状态
      this.prisma.examCandidate.findMany({
        where: { ...where, exam: { status: { not: 'unpublished' } } },
        select: {
          exam: {
            select: {
              id: true,
              name: true,
              startTime: true,
              endTime: true,
              duration: true,
              passScore: true,
              updateTime: true,
            },
          },
        },
      }),
      // 报考审核结果：只有出了结果才算消息，pending 不推
      this.prisma.certApplication.findMany({
        where: { ...where, status: { in: ['approved', 'rejected'] } },
        select: {
          id: true,
          status: true,
          rejectReason: true,
          reviewTime: true,
          updateTime: true,
          project: { select: { name: true } },
        },
      }),
      // 成绩发布：未发布成绩的答卷不推消息，避免考生提前看到分数
      this.prisma.answerSheet.findMany({
        where: { ...where, scorePublished: true },
        select: {
          id: true,
          totalScore: true,
          passed: true,
          updateTime: true,
          exam: {
            select: {
              name: true,
              passScore: true,
              // 本场是否对考生公开成绩。不取这个字段，「查看成绩」关闭的考试
              // 分数会从消息正文里漏出去——正文原本直接写着「我的成绩：N 分」
              setting: { select: { allowViewScore: true } },
            },
          },
        },
      }),
    ]);

    const list: DerivedMessage[] = [];

    for (const { exam } of assignments) {
      list.push({
        id: `${TYPE.EXAM_NOTICE}-${exam.id}`,
        type: TYPE.EXAM_NOTICE,
        title: `考试通知：${exam.name}`,
        at: exam.updateTime,
        content:
          `你有一场新的考试安排。\n\n` +
          `考试名称：${exam.name}\n` +
          `考试时间：${fmtMin(exam.startTime)} 至 ${fmtMin(exam.endTime)}\n` +
          `考试时长：${exam.duration} 分钟\n` +
          `及格分数：${exam.passScore} 分\n\n` +
          `请在考试时间内进入考试，逾期将无法作答。`,
      });
    }

    for (const a of applications) {
      const ok = a.status === 'approved';
      list.push({
        id: `${TYPE.APPLY_RESULT}-${a.id}`,
        type: TYPE.APPLY_RESULT,
        title: `报考审核${ok ? '通过' : '未通过'}：${a.project.name}`,
        at: a.reviewTime ?? a.updateTime,
        content:
          `报考项目：${a.project.name}\n` +
          `审核结果：${ok ? '通过' : '未通过'}\n` +
          `审核时间：${fmtMin(a.reviewTime ?? a.updateTime)}\n` +
          (ok
            ? `\n你已获得该项目的参考资格，请按考试安排参加考试。`
            : `\n未通过原因：${a.rejectReason || '未填写'}`),
      });
    }

    for (const s of sheets) {
      /*
        本场设置了不对考生公开成绩时，正文不能带分数与及格与否。

        消息仍然推送而不是整条跳过：阅卷这件事确实发生了，告知一声考生就不会
        一直等；整条不推等于让考生对着「待阅卷」无限期等一个不会来的通知。
        默认 true（无 setting 行按开放处理），与成绩列表/详情/结果页口径一致。
      */
      const scoreHidden = !(s.exam.setting?.allowViewScore ?? true);
      // totalScore 为空说明还在阅卷或未判分完成，正文里如实标注而不显示 0 分
      const scoreText = s.totalScore === null ? '待确认' : `${s.totalScore} 分`;
      const passText = s.passed === null ? '待确认' : s.passed ? '合格' : '不合格';
      list.push({
        id: `${TYPE.SCORE_RELEASE}-${s.id}`,
        type: TYPE.SCORE_RELEASE,
        title: `成绩发布：${s.exam.name}`,
        at: s.updateTime,
        content: scoreHidden
          ? `本场考试的阅卷已完成。\n\n` +
            `考试名称：${s.exam.name}\n` +
            `及格分数：${s.exam.passScore} 分\n\n` +
            `按本场考试设置，成绩不对考生公开，故不显示你的得分与是否合格。`
          : `你的考试成绩已发布。\n\n` +
            `考试名称：${s.exam.name}\n` +
            `我的成绩：${scoreText}\n` +
            `及格分数：${s.exam.passScore} 分\n` +
            `是否合格：${passText}`,
      });
    }

    // 时间倒序，最新的消息排在最前
    return list.sort((a, b) => b.at.getTime() - a.at.getTime());
  }

  /**
   * 查出当前用户的已读 messageKey 集合
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  private async readKeys(userId: number, userType: AppUserType): Promise<Set<string>> {
    const rows = await this.prisma.messageRead.findMany({
      where: this.readWhere(userId, userType),
      select: { messageKey: true },
    });
    return new Set(rows.map((r) => r.messageKey));
  }

  /**
   * 消息列表（按时间倒序，附已读状态）
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  async getList(userId: number, userType: AppUserType): Promise<AppMessageItemVo[]> {
    const [list, read] = await Promise.all([
      this.derive(userId, userType),
      this.readKeys(userId, userType),
    ]);

    return list.map((m) => ({
      id: m.id,
      type: m.type,
      typeText: TYPE_TEXT[m.type] ?? '',
      title: m.title,
      time: fmt(m.at),
      isRead: read.has(m.id),
    }));
  }

  /**
   * 未读消息数（首页铃铛角标用）
   *
   * 口径与列表一致：派生出的消息里减去已读的。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   */
  async getUnreadCount(userId: number, userType: AppUserType): Promise<number> {
    const [list, read] = await Promise.all([
      this.derive(userId, userType),
      this.readKeys(userId, userType),
    ]);
    return list.filter((m) => !read.has(m.id)).length;
  }

  /**
   * 消息详情，并把该条标记为已读
   *
   * 只在当前用户自己派生出的消息里查找 id——这既是「消息不存在」的判定，
   * 也是越权防护：换个 id 也读不到别人的消息。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   * @param id 消息标识（形如 exam_notice-12）
   */
  async getDetail(
    userId: number,
    userType: AppUserType,
    id: string,
  ): Promise<AppMessageDetailVo> {
    const list = await this.derive(userId, userType);
    const hit = list.find((m) => m.id === id);
    if (!hit) throw new NotFoundException('消息不存在');

    await this.markRead(userId, userType, hit.id);

    return {
      id: hit.id,
      type: hit.type,
      typeText: TYPE_TEXT[hit.type] ?? '',
      title: hit.title,
      time: fmt(hit.at),
      content: hit.content,
    };
  }

  /**
   * 标记已读（幂等）
   *
   * 内外部考生各有一条唯一约束，用对应的 where 做 upsert；
   * 重复点开同一条消息不会报错也不会产生第二行。
   *
   * @param userId 当前登录用户 id
   * @param userType 用户类型
   * @param messageKey 消息标识
   */
  private async markRead(userId: number, userType: AppUserType, messageKey: string) {
    if (userType === 'internal') {
      await this.prisma.messageRead.upsert({
        where: {
          uniq_msg_read_internal: { userType: 'internal', internalUserId: userId, messageKey },
        },
        update: {},
        create: { userType: 'internal', internalUserId: userId, messageKey },
      });
      return;
    }
    await this.prisma.messageRead.upsert({
      where: {
        uniq_msg_read_external: {
          userType: 'external',
          externalCandidateId: userId,
          messageKey,
        },
      },
      update: {},
      create: { userType: 'external', externalCandidateId: userId, messageKey },
    });
  }
}
