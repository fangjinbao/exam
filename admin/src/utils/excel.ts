/**
 * Excel 导入/导出工具
 * 基于 xlsx + file-saver，统一前端「按表头映射生成/解析 xlsx」的逻辑，供各列表页导入导出复用。
 */
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'

/** 列定义：中文表头 → 记录字段名（顺序即列顺序） */
export interface ExcelColumn<T> {
  header: string
  field: keyof T
}

/**
 * 按列定义把记录数组导出为 xlsx 文件并触发下载
 * @param columns 列定义（决定表头与列顺序）
 * @param rows 数据记录数组
 * @param fileName 导出文件名（不含扩展名）
 * @param sheetName 工作表名，默认 Sheet1
 */
export function exportToExcel<T extends Record<string, any>>(
  columns: ExcelColumn<T>[],
  rows: T[],
  fileName: string,
  sheetName = 'Sheet1'
): void {
  const header = columns.map((c) => c.header)
  const body = rows.map((row) =>
    columns.map((c) => {
      const value = row[c.field]
      return value === null || value === undefined ? '' : value
    })
  )
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...body])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  saveAs(new Blob([buffer], { type: 'application/octet-stream' }), `${fileName}.xlsx`)
}

/**
 * 生成仅含表头（可选示例行）的导入模板并下载
 * @param headers 中文表头数组
 * @param example 可选示例行（与表头等长）
 * @param fileName 模板文件名（不含扩展名）
 * @param sheetName 工作表名
 * @param textColumns 需强制为「文本格式」的列索引（从 0 开始）。证件号/单位编码等长数字列
 *        若被 Excel 当作数字，18 位身份证号会因超出 2^53 精度上限被舍位，故整列设为文本格式规避。
 */
export function downloadTemplate(
  headers: string[],
  example: string[] | null,
  fileName: string,
  sheetName = 'Sheet1',
  textColumns: number[] = []
): void {
  const rows = example ? [headers, example] : [headers]
  const worksheet = XLSX.utils.aoa_to_sheet(rows)
  // 把指定列（含表头与示例行）的单元格数字格式设为文本（'@'），并把示例值写成字符串型，
  // 引导使用者按文本录入长数字，避免导入时精度丢失
  for (const col of textColumns) {
    for (let row = 0; row < rows.length; row++) {
      const addr = XLSX.utils.encode_cell({ r: row, c: col })
      const cell = worksheet[addr]
      if (!cell) continue
      cell.t = 's'
      cell.z = '@'
    }
  }
  // 预留列宽，避免文本列被压缩
  worksheet['!cols'] = headers.map((_, i) => (textColumns.includes(i) ? { wch: 22 } : { wch: 14 }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  saveAs(new Blob([buffer], { type: 'application/octet-stream' }), `${fileName}.xlsx`)
}

/**
 * 解析 xlsx 文件首个工作表为记录数组，按「中文表头 → 字段名」映射
 * @param file 上传的原始文件
 * @param headerMap 中文表头 → 字段名映射
 * @returns 解析后的记录数组（所有字段值转为去空白的字符串）
 */
export async function parseExcel<T>(
  file: File,
  headerMap: Record<string, keyof T>
): Promise<T[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  return raw.map((item) => {
    const row = {} as Record<keyof T, string>
    for (const [cn, field] of Object.entries(headerMap) as [string, keyof T][]) {
      row[field] = String(item[cn] ?? '').trim()
    }
    return row as T
  })
}
