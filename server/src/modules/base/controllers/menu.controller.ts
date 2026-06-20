import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CrudController, CrudControllerFactory } from '@/common/crud';
import { ApiArrayResult, Perms } from '@/common/decorators';
import { MenuService } from '../services/menu.service';
import { MenuVo } from '../vo/base.vo';

/**
 * 系统菜单控制器
 * 提供菜单/权限点的增删改查接口，菜单数据驱动前端路由与按钮级权限。
 * 列表查询支持按名称（name）模糊检索，并可按类型（type）、父级（parentId）精确过滤。
 */
@ApiTags('系统菜单')
@CrudController({
  prefix: 'admin/sys/menu',
  api: ['add', 'delete', 'update', 'info', 'list'],
  pageQueryOp: {
    keyWordLikeFields: ['name'],
    fieldEq: ['type', 'parentId'],
  },
})
export class MenuController extends CrudControllerFactory(MenuVo) {
  constructor(private readonly menuService: MenuService) {
    super(menuService);
  }

  /**
   * 获取菜单树
   * 将扁平菜单列表按父子关系组装为树形结构，供前端渲染导航与权限分配使用。
   */
  @Get('tree')
  @Perms('list')
  @ApiOperation({ summary: '获取菜单树' })
  @ApiArrayResult(MenuVo)
  async tree() {
    const tree = await this.menuService.getTree();
    return this.ok(tree);
  }
}
