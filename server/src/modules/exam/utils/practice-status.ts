/** 练习状态判定所需的最小字段 */
export interface PracticeStatusInput {
  status: string;
  startTime: Date | null;
  endTime: Date | null;
  autoFinish: boolean;
}

/**
 * 计算练习的「真实状态」：已发布的练习按当前时间推进到进行中/已结束。
 *
 * 与考试状态推进的三点差异：
 * - 练习时间允许为空（不限时），无开始时间者发布即视为进行中；
 * - 仅在 autoFinish 开启时才按结束时间自动结束，否则由管理员手动结束；
 * - 已手动置为 finished 的不因时间未到而回退。
 *
 * @param row 含 status/startTime/endTime/autoFinish 的练习记录
 * @param now 当前时间
 * @returns 真实状态：unpublished / published / ongoing / finished
 */
export function computePracticeStatus(row: PracticeStatusInput, now: Date): string {
  // 未发布保持不变
  if (row.status === 'unpublished') return 'unpublished';
  // 自动结束仅在开启且已过结束时间时生效
  if (row.autoFinish && row.endTime && now >= row.endTime) return 'finished';
  // 手动置为已结束的不再回退
  if (row.status === 'finished') return 'finished';
  // 无开始时间（不限时）的练习发布即视为进行中
  if (!row.startTime || now >= row.startTime) return 'ongoing';
  return 'published';
}
