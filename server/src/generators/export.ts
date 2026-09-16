import type { SavedDocument } from '../contracts/document.js'
import { exportFormats, type ExportFormat } from '../contracts/office.js'
import { HttpError } from '../middleware/errors.js'
import { generatePdf } from './pdf.js'
import { generateDocx } from './docx.js'
import { generatePptx } from './pptx.js'
import { generateXlsx } from './xlsx.js'

export const mimeTypes: Record<ExportFormat, string> = {
  pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain; charset=utf-8', markdown: 'text/markdown; charset=utf-8',
}
export async function generateExport(document: SavedDocument, format: ExportFormat, getImage?: (id: string) => Promise<Buffer>): Promise<Buffer> {
  if (!(exportFormats[document.kind] as readonly string[]).includes(format)) throw new HttpError(422, 'UNSUPPORTED_FORMAT', 'Этот формат не подходит для выбранного документа')
  if (format === 'pdf') return generatePdf(document)
  if (format === 'docx') return generateDocx(document)
  if (format === 'pptx') return generatePptx(document, getImage)
  if (format === 'xlsx') return generateXlsx(document)
  if (document.content.kind !== 'text') throw new HttpError(422, 'UNSUPPORTED_FORMAT', 'Ожидается текстовый документ')
  const md = format === 'markdown'
  const escape = (text: string) => md ? text.replace(/([\\`*_{}[\]()#+.!<>|~-])/g, '\\$1') : text
  const parts = document.content.blocks.map(block => {
    switch (block.type) {
      case 'heading': return `${md ? '#'.repeat(block.level + 1) + ' ' : ''}${escape(block.text)}`
      case 'paragraph': return escape(block.text)
      case 'list': return block.items.map((item, i) => `${block.ordered ? `${i + 1}.` : '-'} ${escape(item).replace(/\n/g, '\n  ')}`).join('\n')
      case 'table': return md ? [block.columns, block.columns.map(() => '---'), ...block.rows].map((row, i) => `| ${row.map(value => i === 1 ? value : escape(value).replace(/\n/g, '<br>')).join(' | ')} |`).join('\n') : [block.columns, ...block.rows].map(row => row.join('\t')).join('\n')
      case 'pageBreak': return md ? '---' : '\f'
    }
  })
  return Buffer.from(`${md ? '# ' : ''}${escape(document.title)}\n\n${parts.join('\n\n')}\n`, 'utf8')
}
