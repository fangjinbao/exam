/**
 * 文件上传 API
 * 对接 /admin/space/info/upload（磁盘存储，UUID 重命名，扩展名白名单，单文件 10MB）
 *
 * 富文本编辑器插图走此接口拿到 /uploads/xxx 路径后再插入 HTML。
 * 不用 base64 内联：题干等字段是 MySQL TEXT（上限 64KB），
 * 一张图的 base64 就会超限导致保存失败。
 */

import request from '@/utils/http'

/** 上传成功后的文件记录 */
export interface UploadedFile {
  id: number
  /** 站内相对路径，形如 /uploads/xxx.png */
  url: string
  name: string
  size?: number
  type?: string
}

/** 服务端允许的图片扩展名（与后端 ALLOWED_EXT 的图片部分保持一致，不含 svg） */
export const ALLOWED_IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

/** 服务端单文件大小上限（10MB），与后端 MAX_FILE_SIZE 一致 */
export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024

/**
 * 上传单个文件
 * @param file 待上传文件
 * @returns 入库后的文件记录（含站内 url）
 */
export function uploadFile(file: File) {
  const data = new FormData()
  data.append('file', file)
  return request.post<UploadedFile>({
    url: '/admin/space/info/upload',
    data,
    headers: { 'Content-Type': 'multipart/form-data' },
    showErrorMessage: false
  })
}
