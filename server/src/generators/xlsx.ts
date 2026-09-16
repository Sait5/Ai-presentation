import ExcelJS from 'exceljs'
import type { SavedDocument } from '../contracts/document.js'
import { calculateWorksheet } from '../contracts/formulas.js'
import { HttpError } from '../middleware/errors.js'

const formats = { general: 'General', number: '#,##0.00', integer: '#,##0', percent: '0.0%', currency: '#,##0.00 "₽"' }
export async function generateXlsx(document: SavedDocument): Promise<Buffer> {
  if (document.content.kind !== 'spreadsheet') throw new HttpError(422, 'UNSUPPORTED_FORMAT', 'XLSX доступен для таблиц')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Forma'; workbook.title = document.title
  workbook.calcProperties.fullCalcOnLoad = true
  for (const source of document.content.worksheets) {
    const results = calculateWorksheet(source)
    const sheet = workbook.addWorksheet(source.name, { views: [{ state: 'frozen', ySplit: source.headerRow ? 1 : 0 }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
    source.columns.forEach((column, c) => { sheet.getColumn(c + 1).width = column.width })
    source.rows.forEach((row, r) => {
      row.cells.forEach((input, c) => {
        const cell = sheet.getCell(r + 1, c + 1)
        if (input.type === 'formula') {
          const result = results[r]![c]!
          if (typeof result !== 'number') throw new HttpError(422, 'FORMULA_ERROR', `${source.name}, ${cell.address}: ${result}`)
          cell.value = { formula: input.value.replace(/^=/, '').toUpperCase(), result }
        } else if (input.type === 'date') cell.value = new Date(`${input.value}T00:00:00Z`)
        else cell.value = input.type === 'text' && input.value === '' ? null : input.value
        cell.numFmt = input.type === 'date' ? 'dd.mm.yyyy' : formats[input.format]
        cell.font = { name: 'Arial', size: 11, bold: input.bold || (source.headerRow && r === 0), color: { argb: source.headerRow && r === 0 ? 'FFFFFFFF' : 'FF22332E' } }
        cell.alignment = { vertical: 'middle', wrapText: true }
        if (source.headerRow && r === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163E33' } }
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFCDD8D1' } } }
      })
      const lines = Math.max(1, ...row.cells.map((cell, c) => String(cell.value).split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / (source.columns[c]!.width * 0.85))), 0)))
      if (lines * 16 + 12 > 409) throw new HttpError(422, 'CELL_OVERFLOW', `${source.name}, строка ${r + 1}: текст слишком длинный. Увеличьте ширину колонок или разделите текст.`)
      sheet.getRow(r + 1).height = Math.max(28, lines * 16 + 12)
    })
    if (source.headerRow) { sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: source.rows.length, column: source.columns.length } }; sheet.pageSetup.printTitlesRow = '1:1' }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
