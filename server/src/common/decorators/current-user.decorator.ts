import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * 当前 C 端用户参数装饰器
 *
 * 从请求对象上取出 AppAuthGuard 鉴权通过后写入的 request.currentUser（JWT payload），
 * payload 形如 `{ userId, userType, passwordVersion, scope: 'app' }`。
 * 用法：`@CurrentUser() user` 注入完整信息；`@CurrentUser('userId') userId` 注入指定字段。
 *
 * 与 @Admin 的区别：@Admin 读 request.admin（管理端 AuthGuard 写入，payload 含 roleIds），
 * 两者来源与语义不同，不可混用。
 *
 * @param data 可选字段名，传入时仅返回该字段，否则返回整个 currentUser 对象
 */
export const CurrentUser = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const currentUser = request.currentUser;
    // 指定了字段名则取单字段，否则返回完整 currentUser 对象
    return data ? currentUser?.[data] : currentUser;
  },
);
