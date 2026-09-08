/**
 * 派生考试编号（JCKS-年月日 + 4 位考试 ID）
 *
 * exam_exam 没有业务编号列，编号由「创建日期 + 自增 ID」派生：
 * 两者都不可变，故同一场考试的编号稳定、可复现，无需建列与迁移。
 * 若后续要人工可编辑的编号，须加字段并改为读库值。
 *
 * 抽成共用函数而非各服务各写一份：阅卷中心与监考中心都要展示同一场考试的编号，
 * 复制实现会在改算法时漏掉一处、让两个页面显示的编号对不上。
 *
 * @param id 考试自增 ID
 * @param createTime 考试创建时间
 */
export function buildExamNo(id: number, createTime: Date): string {
  const y = createTime.getFullYear();
  const m = String(createTime.getMonth() + 1).padStart(2, '0');
  const d = String(createTime.getDate()).padStart(2, '0');
  return `JCKS-${y}${m}${d}${String(id).padStart(4, '0')}`;
}
