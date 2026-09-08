/**
 * 拼接上传文件地址
 *
 * 后端存的是上传接口返回的相对路径（/uploads/xxx.png）。上传目录挂在站点
 * 根路径 /uploads/ 而非接口前缀 /app 下，所以不能拼 VITE_API_BASE_URL，
 * 直接按站点根路径用（dev 由 vite proxy 转发，生产由网关转发）。
 * 已是绝对地址（含协议或协议相对）的原样返回。
 *
 * 原先在证书详情页与交卷结果页各有一份私有实现，注释里写着「为三行字符串
 * 处理抽一层公共模块不划算」；证书画布组件抽出后有三处要用，遂并到此处。
 *
 * @param {string} path - 相对路径或完整 URL
 * @returns {string} 可直接用于 img src 的地址
 */
export const resolveUploadUrl = (path) => {
  if (!path) return ''
  if (/^(https?:)?\/\//.test(path)) return path
  return path.startsWith('/') ? path : `/${path}`
}
