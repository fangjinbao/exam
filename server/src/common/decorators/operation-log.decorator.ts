import { SetMetadata } from '@nestjs/common';

/** @OperationLog 元数据 key（标在 controller 写操作方法上，供全局 OperationLogInterceptor 读取） */
export const OPERATION_LOG_KEY = 'operation:log';
/** @SkipOperationLog 元数据 key（标在写操作方法上，显式排除自动采集） */
export const SKIP_OPERATION_LOG_KEY = 'operation:log:skip';

/**
 * 操作内容构造函数
 * 入参：请求体 body、控制器返回值 result（已剥离 { code, data } 外壳）、路径参数 params、查询参数 query、
 * 以及原始 request（controller 可在其上挂 request.operationLogExtra 传递展示用名称等补充信息）。
 * 返回中文操作内容描述。
 */
export type OperationLogContentFn = (ctx: {
  body: any;
  result: any;
  params: any;
  query: any;
  request: any;
}) => string;

/** @OperationLog 配置项 */
export interface OperationLogOptions {
  /** 操作对象（如「角色管理」）。缺省时由 controller 的 @ApiTags 去掉「系统管理-」前缀推导 */
  target?: string;
  /** 操作类型：新增/编辑/删除/登录/其他。缺省时由 @Perms 的 action 映射推导 */
  type?: string;
  /** 操作内容：静态字符串或按请求/返回值动态生成的函数。缺省时为「${type}${target}」 */
  content?: string | OperationLogContentFn;
}

/**
 * 操作日志声明装饰器
 *
 * 标在 controller 写操作方法上，为该接口的操作日志补充精细信息（对象名、具体内容等）。
 * 未标注的写操作（@Perms 的 action 属于写动作集）仍会被全局拦截器自动采集，仅使用通用文案。
 *
 * 用法：`@OperationLog({ target: '角色管理', type: '编辑', content: (c) => `调整「${c.body.name}」角色权限` })`
 */
export const OperationLog = (options: OperationLogOptions) => SetMetadata(OPERATION_LOG_KEY, options);

/**
 * 跳过操作日志装饰器
 *
 * 标在写操作方法上时，全局拦截器不会为该接口记录操作日志（如导出、内部批量作业等无需留痕的写动作）。
 */
export const SkipOperationLog = () => SetMetadata(SKIP_OPERATION_LOG_KEY, true);
