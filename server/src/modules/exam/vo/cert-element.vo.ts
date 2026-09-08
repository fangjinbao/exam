import { ApiProperty } from '@nestjs/swagger';

/**
 * 证书版式里的单个渲染元素
 *
 * 与管理端设计器的 DesignerElement 一一对应，但 field 类型的占位符已在服务端
 * 替换为真实值放进 text——前端只管按坐标绝对定位渲染，不需要知道字段语义，
 * 也避免把整张证书的取值逻辑在两端各写一遍。
 *
 * 放在 exam 模块下而非某个 app 端模块：证书详情页与交卷结果页的证书小样都用它，
 * 归属任一端都会让另一端跨模块反向依赖。取值实现见同级 utils/cert-render.ts。
 */
export class AppCertElementVo {
  @ApiProperty({ description: '元素类型：text 文本 / seal 印章图片' })
  type: string;

  @ApiProperty({ description: '左上角 X 坐标（画布内 px）' })
  x: number;

  @ApiProperty({ description: '左上角 Y 坐标（画布内 px）' })
  y: number;

  @ApiProperty({ description: '元素宽度（px）' })
  width: number;

  @ApiProperty({ description: '字号（px），seal 类型忽略' })
  fontSize: number;

  @ApiProperty({ description: '文字颜色' })
  color: string;

  @ApiProperty({ description: '是否加粗' })
  bold: boolean;

  @ApiProperty({ description: '是否显示底部下划线' })
  underline: boolean;

  @ApiProperty({ description: '文本对齐：left / center / right' })
  align: string;

  @ApiProperty({ description: '要渲染的文字（field 类型已填充为真实值）' })
  text: string;
}
