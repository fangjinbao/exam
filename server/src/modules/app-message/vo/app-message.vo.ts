import { ApiProperty } from '@nestjs/swagger';

/**
 * 考生端消息列表项 VO
 *
 * 字段与移动端 Message.vue 使用的字段一致：id/type/typeText/title/time/isRead。
 * id 不是数据库主键——消息由业务数据实时派生，id 形如 exam_notice-12。
 */
export class AppMessageItemVo {
  @ApiProperty({ description: '消息标识：{类型}-{来源记录 ID}', example: 'exam_notice-12' })
  id: string;

  @ApiProperty({
    description: '消息类型 exam_notice=考试通知 / apply_result=报考审核结果 / score_release=成绩发布',
    example: 'exam_notice',
  })
  type: string;

  @ApiProperty({ description: '消息类型中文文案', example: '考试通知' })
  typeText: string;

  @ApiProperty({ description: '消息标题', example: '考试通知：2026年度安全生产知识考核' })
  title: string;

  @ApiProperty({ description: '消息时间', example: '2026-08-01 10:00:00' })
  time: string;

  @ApiProperty({ description: '是否已读', example: false })
  isRead: boolean;
}

/**
 * 未读消息数 VO（首页铃铛角标用）
 */
export class AppMessageUnreadCountVo {
  @ApiProperty({ description: '未读消息数', example: 3 })
  count: number;
}

/**
 * 消息详情 VO
 *
 * 除列表字段外多一个 content：正文由服务端按消息类型拼装成纯文本，
 * 移动端 MessageDetail.vue 以 {{ detail.content }} 整段渲染，故不能给对象或数组。
 */
export class AppMessageDetailVo {
  @ApiProperty({ description: '消息标识', example: 'exam_notice-12' })
  id: string;

  @ApiProperty({ description: '消息类型', example: 'exam_notice' })
  type: string;

  @ApiProperty({ description: '消息类型中文文案', example: '考试通知' })
  typeText: string;

  @ApiProperty({ description: '消息标题', example: '考试通知：2026年度安全生产知识考核' })
  title: string;

  @ApiProperty({ description: '消息时间', example: '2026-08-01 10:00:00' })
  time: string;

  @ApiProperty({
    description: '正文纯文本；移动端 MessageDetail.vue 直接整段渲染，多行以 \\n 分隔',
    example: '考试名称：2026年度安全生产知识考核\n考试时间：2026-08-01 10:00 至 12:00\n考试时长：120 分钟\n及格分数：60 分',
  })
  content: string;
}
