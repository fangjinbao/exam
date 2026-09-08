import { ApiProperty } from '@nestjs/swagger';

/**
 * 首页数据概览 VO
 *
 * 对应首页顶部四个统计数字。字段名与移动端 Home.vue 的 overview 一致。
 */
export class AppOverviewVo {
  @ApiProperty({ description: '已考次数：已提交的答卷数', example: 1 })
  examCount: number;

  @ApiProperty({
    description: '练习题量：练习模块尚未实现，恒为 0',
    example: 0,
  })
  practiceCount: number;

  @ApiProperty({ description: '证书获得：已签发的证书数', example: 2 })
  certificateCount: number;

  @ApiProperty({ description: '错题数：历次考试中判错的题目数', example: 3 })
  wrongCount: number;
}

/**
 * 首页待考提醒项 VO
 */
export class AppUpcomingExamVo {
  @ApiProperty({ description: '考试 ID', example: 12 })
  id: number;

  @ApiProperty({ description: '考试名称', example: '2026年度安全生产知识考核' })
  name: string;

  @ApiProperty({ description: '考试开始时间', example: '2026-08-01T16:06:00.000Z' })
  startTime: Date;

  @ApiProperty({ description: '考试结束时间', example: '2026-08-01T18:06:00.000Z' })
  endTime: Date;

  @ApiProperty({
    description: '考试状态：published 未开始 / ongoing 进行中',
    example: 'ongoing',
  })
  status: string;

  @ApiProperty({
    description:
      '本人已交卷次数。>0 表示考过但仍有重考机会（机会已用尽的不会出现在待考提醒里），考生端据此显示「可重考 / 已考 N 次」',
    example: 0,
  })
  attemptCount: number;
}
