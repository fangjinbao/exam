import { ApiProperty } from '@nestjs/swagger';

/**
 * 试卷列表/基础响应 VO
 * 试卷为业务数据，无敏感字段；totalScore/questionCount 由 service 计算落库。
 */
export class PaperVo {
  @ApiProperty({ description: '试卷 ID' })
  id: number;

  @ApiProperty({ description: '试卷名称' })
  name: string;

  @ApiProperty({ description: '试卷类型：fixed 固定 / random 随机' })
  type: string;

  @ApiProperty({ description: '试卷状态：draft 草稿 / published 已发布' })
  status: string;

  @ApiProperty({ description: '总分' })
  totalScore: number;

  @ApiProperty({ description: '题目数量' })
  questionCount: number;

  @ApiProperty({ description: '建议时长（分钟）' })
  suggestDuration: number;

  @ApiProperty({ description: '知识点分布要求', nullable: true })
  knowledgeDistribution: string | null;

  @ApiProperty({ description: '创建人用户 ID', nullable: true })
  createBy: number | null;

  @ApiProperty({ description: '创建人姓名（系统关联查询）' })
  createByName: string;

  @ApiProperty({ description: '创建人所属单位（由创建人部门上溯到公司节点，实时派生）' })
  createByOrgName: string;

  @ApiProperty({ description: '可见范围 self=仅自己 dept=本部门 company=本公司 all=全部组织' })
  visibleScope: string;

  @ApiProperty({ description: '共享权限级别 manage=可管理 view=可查看' })
  shareLevel: string;

  @ApiProperty({ description: '当前用户是否可管理该试卷（编辑/发布/删除）' })
  canManage: boolean;

  @ApiProperty({ description: '当前用户是否可修改共享设置（仅创建人与超管）' })
  canEditShare: boolean;

  @ApiProperty({ description: '创建时间' })
  createTime: string;

  @ApiProperty({ description: '更新时间' })
  updateTime: string;
}

/** 固定试卷题目项详情（预览含题干/答案） */
export class PaperQuestionDetailVo {
  @ApiProperty({ description: '题目项 ID' })
  id: number;

  @ApiProperty({ description: '题目 ID' })
  questionId: number;

  @ApiProperty({ description: '题干' })
  stem: string;

  @ApiProperty({ description: '题型' })
  questionType: string;

  @ApiProperty({ description: '选项', nullable: true })
  options: string | null;

  @ApiProperty({ description: '标准答案' })
  answer: string;

  @ApiProperty({ description: '答案解析', nullable: true })
  analysis: string | null;

  @ApiProperty({ description: '难度' })
  difficulty: string;

  @ApiProperty({ description: '每题分值' })
  score: number;

  @ApiProperty({ description: '卷面排序序号' })
  sortNo: number;
}

/** 随机试卷抽题规则详情（含该组合可用题量） */
export class PaperRuleDetailVo {
  @ApiProperty({ description: '规则 ID' })
  id: number;

  @ApiProperty({ description: '题型' })
  questionType: string;

  @ApiProperty({ description: '难度' })
  difficulty: string;

  @ApiProperty({ description: '知识点 ID' })
  knowledgePointId: number;

  @ApiProperty({ description: '知识点名称' })
  knowledgePointName: string;

  @ApiProperty({ description: '抽取数量' })
  drawCount: number;

  @ApiProperty({ description: '每题分值' })
  scorePerQuestion: number;

  @ApiProperty({ description: '该组合在题库范围内可用题目数量' })
  availableCount: number;
}

/** 试卷详情 VO（固定卷返回题目项，随机卷返回抽题规则） */
export class PaperDetailVo extends PaperVo {
  @ApiProperty({ description: '题库范围 ID 列表', type: [Number] })
  bankIds: number[];

  @ApiProperty({ description: '题库范围名称列表', type: [String] })
  bankNames: string[];

  @ApiProperty({
    description: '各题库抽题权重（与 bankIds 同序；随机卷有效，固定卷恒 0）',
    type: [Number],
  })
  bankWeights: number[];

  @ApiProperty({ description: '固定试卷题目项（type=fixed）', type: [PaperQuestionDetailVo] })
  questions: PaperQuestionDetailVo[];

  @ApiProperty({ description: '随机试卷抽题规则（type=random）', type: [PaperRuleDetailVo] })
  rules: PaperRuleDetailVo[];
}
