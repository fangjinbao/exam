import {
  IsInt,
  IsPositive,
  IsString,
  IsOptional,
  IsNotEmpty,
  IsArray,
  IsBoolean,
  IsNumber,
  IsIn,
  MaxLength,
  MinLength,
  Min,
  ValidateNested,
  IsDateString,
  ArrayNotEmpty,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 考试设置入参：防作弊开关 + 重考次数 + 考前/考中/考后行为约束
 *
 * 【与 Prisma ExamSetting 的字段集须一致】ExamService.getDetail 用 `omit` 读那张表，
 * 除显式排除的列外全部下发；编辑页把整份 setting 回填进表单、提交时原样发回。
 * 因为 main.ts 开了 forbidNonWhitelisted，库里有而这里没有的字段会让
 * 「编辑考试」整体 400（不是只有新开关不生效），报错还是考务读不懂的
 * `property xxx should not exist`。加设置项时两处必须一起改。
 */
export class ExamSettingDto {
  @ApiProperty({ description: '防切屏检测', required: false })
  @IsOptional()
  @IsBoolean()
  screenSwitchDetect?: boolean;

  @ApiProperty({ description: '允许切屏次数（防切屏开启时有效）', required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  allowSwitchTimes?: number;


  @ApiProperty({ description: '题目乱序', required: false })
  @IsOptional()
  @IsBoolean()
  shuffleQuestions?: boolean;

  @ApiProperty({ description: '操作限制（禁复制粘贴/右键/多屏）', required: false })
  @IsOptional()
  @IsBoolean()
  operationRestrict?: boolean;

  @ApiProperty({ description: '最多重考次数（0=不允许重考）', required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  retakeLimit?: number;

  @ApiProperty({ description: '【考前】允许提前进场分钟数（0=不允许）', required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  earlyEnterMinutes?: number;

  @ApiProperty({ description: '【考前】需签署考试承诺书', required: false })
  @IsOptional()
  @IsBoolean()
  requireCommitment?: boolean;

  @ApiProperty({ description: '【考中】允许提前交卷', required: false })
  @IsOptional()
  @IsBoolean()
  allowEarlySubmit?: boolean;

  @ApiProperty({ description: '【考中】最短作答时长（分钟，0=不限制）', required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  minAnswerMinutes?: number;

  @ApiProperty({ description: '【考中】显示剩余时间', required: false })
  @IsOptional()
  @IsBoolean()
  showRemainingTime?: boolean;


  @ApiProperty({ description: '【考后】允许查看成绩', required: false })
  @IsOptional()
  @IsBoolean()
  allowViewScore?: boolean;

  @ApiProperty({ description: '【考后】允许查看答案与解析', required: false })
  @IsOptional()
  @IsBoolean()
  allowViewAnalysis?: boolean;

  /*
    原有 scorePublishMode 入参已移除，该字段从未参与任何发布判定。

    成绩公布不接受配置，规则固定为：
    · 纯客观题：交卷即自动判分并发布（submitExam 的 `scorePublished: !hasSubjective`）
    · 含主观题：交卷后待阅卷，全部评完只置 gradingStatus=completed，
      仍需管理端在阅卷中心显式调 GradingService.publishScore 才对考生可见；
      已发布的还可由 withdrawScore 撤回。
    即「交卷时的初始发布由题型决定，之后仍可人工干预」，
    不要误读成成绩完全不可人工控制。

    部署注意：main.ts 的 ValidationPipe 开了 forbidNonWhitelisted，
    未声明的字段不是被静默剥离而是直接 400。所以新后端上线后，
    仍持有旧版管理端页面（未刷新、JS 有缓存）的用户保存考试会收到
    「property scorePublishMode should not exist」。刷新页面即恢复。
    若要避免这段窗口，需在此保留一个 @IsOptional 的废弃字段并忽略其值，
    过一个版本再删——当前未这么做，因为管理端是内部系统、刷新即可自愈。
  */
}

/** 考试考生分配项（按 candidateType 二选一填 internalUserId / externalCandidateId） */
export class ExamCandidateItemDto {
  @ApiProperty({ description: '考生类型：internal 内部 / external 外部' })
  @IsIn(['internal', 'external'], { message: '考生类型不合法' })
  candidateType: string;

  @ApiProperty({ description: '内部考生用户 ID（internal 时必填）', required: false })
  @IsOptional()
  @IsInt()
  @IsPositive()
  internalUserId?: number;

  @ApiProperty({ description: '外部考生 ID（external 时必填）', required: false })
  @IsOptional()
  @IsInt()
  @IsPositive()
  externalCandidateId?: number;

  @ApiProperty({ description: '考点 ID（线下考场，可空）', required: false })
  @IsOptional()
  @IsInt()
  @IsPositive()
  examSiteId?: number;
}

/** 考试工作人员指派项（监考 / 阅卷共用，仅内部人员） */
export class ExamStaffItemDto {
  @ApiProperty({ description: '人员用户 ID（内部人员）' })
  @IsInt()
  @IsPositive()
  userId: number;
}

/** 新增考试入参（基本信息 + 试卷 + 考生 + 监考/阅卷人员 + 防作弊策略） */
export class CreateExamDto {
  /**
   * 考试类型
   *
   * 必填而非可选：ValidationPipe 开了 forbidNonWhitelisted，前端一定会传；
   * 设成可选会让「不传」多出一层「按普通考试处理」的隐含含义。
   *
   * 「skill 时 certProjectId 必填」这条跨字段规则不写在装饰器上，
   * 放 ExamService.assertTypeAndCertConsistency 统一判——那里已在做同类的
   * 跨字段一致性校验，且 UpdateExamDto 继承本类，装饰器版的条件校验
   * 要在两个类上分别验证行为。
   */
  @ApiProperty({ description: '考试类型：normal 普通考试 / skill 技能鉴定考试' })
  @IsIn(['normal', 'skill'], { message: '考试类型不合法' })
  examType: string;

  @ApiProperty({ description: '考试名称（≤50 字）' })
  @IsString()
  @IsNotEmpty({ message: '请输入考试名称' })
  @MinLength(2, { message: '考试名称至少 2 字' })
  @MaxLength(50, { message: '考试名称不超过 50 字' })
  name: string;

  @ApiProperty({ description: '考试说明（≤500 字）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '考试说明不超过 500 字' })
  description?: string;

  @ApiProperty({ description: '所选试卷 ID（须为已发布试卷）' })
  @IsInt()
  @IsPositive()
  paperId: number;

  @ApiProperty({ description: '开始时间（ISO8601）' })
  @IsDateString({}, { message: '开始时间格式不正确' })
  startTime: string;

  @ApiProperty({ description: '结束时间（ISO8601，须晚于开始时间）' })
  @IsDateString({}, { message: '结束时间格式不正确' })
  endTime: string;

  @ApiProperty({ description: '考试时长（分钟）' })
  @IsInt()
  @IsPositive({ message: '考试时长必须大于 0' })
  duration: number;

  @ApiProperty({ description: '及格分数（正数，最多 1 位小数）' })
  @IsNumber({ maxDecimalPlaces: 1 }, { message: '及格分数最多 1 位小数' })
  @IsPositive({ message: '及格分数必须大于 0' })
  passScore: number;

  @ApiProperty({
    description: '绑定的鉴定项目 ID（examType=skill 时必填，normal 时须为空）',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  certProjectId?: number | null;

  /**
   * 考生分配列表
   *
   * ⚠️ 三个名单字段的「不传」语义并不一致，编辑接口调用前务必看清：
   * - candidates：不传 = **清空**考生名单（updateExam 内部无条件先删后插）
   * - proctors / graders：不传 = **保持不变**（控制器显式判 undefined 后才替换）
   * 需要清空监考/阅卷名单请显式传空数组。
   */
  @ApiProperty({
    description: '考生分配列表（注意：编辑时不传该字段等于清空考生名单）',
    type: [ExamCandidateItemDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamCandidateItemDto)
  candidates?: ExamCandidateItemDto[];

  /** 监考人员列表。编辑时不传 = 保持原名单不变；传空数组 = 清空（与 candidates 语义相反） */
  @ApiProperty({
    description: '监考人员列表（编辑时不传=保持不变，传空数组=清空）',
    type: [ExamStaffItemDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamStaffItemDto)
  proctors?: ExamStaffItemDto[];

  /** 阅卷人员列表。编辑时不传 = 保持原名单不变；传空数组 = 清空（与 candidates 语义相反） */
  @ApiProperty({
    description: '阅卷人员列表（编辑时不传=保持不变，传空数组=清空）',
    type: [ExamStaffItemDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamStaffItemDto)
  graders?: ExamStaffItemDto[];

  @ApiProperty({ description: '考试设置（防作弊+重考+考前/考中/考后）', type: ExamSettingDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExamSettingDto)
  setting?: ExamSettingDto;

  @ApiProperty({ description: '通过后自动发证', required: false })
  @IsOptional()
  @IsBoolean()
  autoIssueCert?: boolean;

  @ApiProperty({ description: '自动发证使用的证书模板 ID（开启自动发证时必填）', required: false })
  @IsOptional()
  @IsInt()
  @IsPositive()
  certTemplateId?: number | null;
}

/** 编辑考试入参（仅未发布可编辑） */
export class UpdateExamDto extends CreateExamDto {
  @ApiProperty({ description: '考试 ID' })
  @IsInt()
  @IsPositive()
  id: number;
}

/** 复制考试入参 */
export class CopyExamDto {
  @ApiProperty({ description: '被复制的考试 ID' })
  @IsInt()
  @IsPositive()
  id: number;
}

/** 分配/更新考生入参 */
export class AssignCandidatesDto {
  @ApiProperty({ description: '考试 ID' })
  @IsInt()
  @IsPositive()
  examId: number;

  @ApiProperty({ description: '考生分配列表', type: [ExamCandidateItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamCandidateItemDto)
  candidates: ExamCandidateItemDto[];
}

/**
 * 指派监考人/阅卷人入参（全量替换该岗位名单）
 *
 * 独立于 UpdateExamDto：编辑考试受「仅未发布」限制，而监考/阅卷名单
 * 任何阶段都应可调整（考完才发现没派阅卷人是真实场景）。
 * 全量替换在这里是安全的——这两类名单不与考生答卷数据关联。
 */
export class AssignStaffDto {
  @ApiProperty({ description: '考试 ID' })
  @IsInt()
  @IsPositive()
  examId: number;

  @ApiProperty({ description: '岗位：proctor 监考 / grader 阅卷' })
  @IsIn(['proctor', 'grader'], { message: '岗位只能是 proctor 或 grader' })
  role: 'proctor' | 'grader';

  @ApiProperty({
    description: '人员列表（传空数组即清空该岗位名单）',
    type: [ExamStaffItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamStaffItemDto)
  staff: ExamStaffItemDto[];
}

/**
 * 移除考生入参
 *
 * 用 ExamCandidate 行 ID 而非 (candidateType, 考生 id) 组合：
 * 内外部考生 id 各自自增会撞号，行 ID 唯一且名单接口已带出。
 */
export class RemoveCandidatesDto {
  @ApiProperty({ description: '考试 ID' })
  @IsInt()
  @IsPositive()
  examId: number;

  /**
   * 要移除的考生分配行 ID
   *
   * 有上限：服务层要拿它与整场名单做集合比对，不限长度时超大数组会把
   * 单线程的事件循环占住，连带拖慢同期考生的取卷/交卷请求。
   * 名单弹窗是逐行移除，1000 足够覆盖任何批量场景。
   */
  @ApiProperty({ description: '要移除的考生分配行 ID 列表（最多 1000 个）', type: [Number] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1000, { message: '单次最多移除 1000 名考生' })
  @IsInt({ each: true })
  @IsPositive({ each: true })
  ids: number[];
}

/**
 * 追加考生入参（只增不减）
 *
 * 与 AssignCandidatesDto 结构相同但语义相反，故不复用：
 * 前者提交的是「完整名单」（未列出的会被删除），本 DTO 提交的是「要新增的人」。
 * 两者混用会导致把追加名单当完整名单提交，反而清空已有考生。
 */
export class AppendCandidatesDto {
  @ApiProperty({ description: '考试 ID' })
  @IsInt()
  @IsPositive()
  examId: number;

  @ApiProperty({ description: '要追加的考生列表（已在名单中的会被跳过）', type: [ExamCandidateItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ExamCandidateItemDto)
  candidates: ExamCandidateItemDto[];
}

/**
 * 导入考生的单行入参
 *
 * 各字段均声明为可选：单行缺字段应作为「该行跳过」的业务提示逐行返回，
 * 不能触发整批 400 让用户无从下手。
 */
export class ImportExamCandidateRowDto {
  @ApiProperty({ description: '考生类型：内部 / 外部', required: false })
  @IsOptional()
  @IsString()
  candidateType?: string;

  @ApiProperty({ description: '姓名（用于与系统记录核对）', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: '登录账号：内部填统一身份账号，外部填手机号', required: false })
  @IsOptional()
  @IsString()
  account?: string;

  @ApiProperty({ description: '身份证号（外部考生可选，填了则二次核验）', required: false })
  @IsOptional()
  @IsString()
  idCard?: string;
}

/** 导入考生入参：仅校验数组规模，行内容逐行校验后跳过错误行 */
export class ImportExamCandidateDto {
  @ApiProperty({ description: '待匹配的考生行数据', type: [ImportExamCandidateRowDto] })
  @IsArray()
  @ArrayNotEmpty({ message: '导入数据不能为空' })
  @ArrayMaxSize(1000, { message: '单次最多导入 1000 行' })
  @ValidateNested({ each: true })
  @Type(() => ImportExamCandidateRowDto)
  rows: ImportExamCandidateRowDto[];
}
