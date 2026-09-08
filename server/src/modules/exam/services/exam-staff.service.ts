import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';

/** 考试工作人员岗位 */
export type ExamStaffRole = 'proctor' | 'grader';

/** 人员指派输入项 */
export interface ExamStaffInput {
  /** 人员用户 ID（内部人员 SysUser.id） */
  userId: number;
}

/** 人员指派输出项 */
export interface ExamStaffItem {
  userId: number;
  /** 姓名（以库内当前记录为准，落库时存快照） */
  name: string;
  /** 登录账号（统一身份账号） */
  account: string | null;
  /** 所属部门名 */
  belong: string;
}

/**
 * 考试工作人员指派服务（监考 / 阅卷）
 *
 * 独立成 service 而非并入 exam.service.ts：后者已 600+ 行，接近项目单文件上限。
 * 监考与阅卷共用同一张 exam_exam_staff 表，按 role 判别列区分。
 */
@Injectable()
export class ExamStaffService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 全量替换某考试某岗位的人员名单
   *
   * 与考生分配（exam.service.ts assignCandidates）同款语义：先清后插，整体事务。
   * 传空数组即清空该岗位名单。
   *
   * @param examId 考试 ID
   * @param role 岗位
   * @param list 人员列表（同一 userId 重复传入会被去重，避免撞唯一约束）
   * @returns 落库后的人员数量
   */
  async assign(examId: number, role: ExamStaffRole, list: ExamStaffInput[]): Promise<number> {
    const userIds = [...new Set((list ?? []).map((i) => i.userId).filter((id) => id > 0))];
    // 姓名快照取自库内当前记录，不信任前端传值
    const users = userIds.length
      ? await this.prisma.sysUser.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, username: true },
        })
      : [];
    const rows = users.map((u) => ({
      examId,
      role,
      userId: u.id,
      name: u.name || u.username,
    }));
    await this.prisma.$transaction([
      this.prisma.examStaff.deleteMany({ where: { examId, role } }),
      ...(rows.length ? [this.prisma.examStaff.createMany({ data: rows })] : []),
    ]);
    return rows.length;
  }

  /**
   * 校验指派人员是否都存在
   *
   * assign() 对查不到的 userId 是静默丢弃，管理员会以为保存成功但名单少人。
   * 故与考生分配（exam.service.ts validateCandidatesExist）同款：落库前先挡住，返回明确提示。
   *
   * @returns 全部存在返回 null；否则返回中文错误提示
   */
  async validateExists(list: ExamStaffInput[] | undefined, label: string): Promise<string | null> {
    const userIds = [...new Set((list ?? []).map((i) => i.userId).filter((id) => id > 0))];
    if (!userIds.length) return null;
    const count = await this.prisma.sysUser.count({ where: { id: { in: userIds } } });
    return count === userIds.length ? null : `部分${label}人员不存在，请重新选择`;
  }

  /**
   * 查某考试某岗位的人员名单（供编辑态回显）
   *
   * 姓名以库内当前记录为准、查不到才退回落库时的快照：
   * 人员改名后名单应显示新名字，人员被删除后仍能显示历史姓名。
   */
  async list(examId: number, role: ExamStaffRole): Promise<ExamStaffItem[]> {
    const assigned = await this.prisma.examStaff.findMany({
      where: { examId, role },
      select: { userId: true, name: true },
      orderBy: { id: 'asc' },
    });
    if (!assigned.length) return [];
    const users = await this.prisma.sysUser.findMany({
      where: { id: { in: assigned.map((a) => a.userId) } },
      select: {
        id: true,
        name: true,
        username: true,
        department: { select: { name: true } },
      },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    return assigned.map((a) => {
      const u = userMap.get(a.userId);
      return {
        userId: a.userId,
        name: u ? u.name || u.username : a.name,
        account: u?.username ?? null,
        belong: u?.department?.name ?? '',
      };
    });
  }

  /**
   * 批量查多场考试的阅卷人 ID 集合（供阅卷中心按指派过滤时判断"是否已指派"）
   * @returns examId → 该考试的阅卷人 userId 数组
   */
  async graderMap(examIds: number[]): Promise<Map<number, number[]>> {
    const map = new Map<number, number[]>();
    if (!examIds.length) return map;
    const rows = await this.prisma.examStaff.findMany({
      where: { examId: { in: examIds }, role: 'grader' },
      select: { examId: true, userId: true },
    });
    rows.forEach((r) => {
      const list = map.get(r.examId) ?? [];
      list.push(r.userId);
      map.set(r.examId, list);
    });
    return map;
  }
}
