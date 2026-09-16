import { z } from 'zod'
import { designSchema, slideImageSchema, themeNames } from './design.js'

const id = z.string().uuid()
const metadata = z.object({ language: z.enum(['ru', 'en']), theme: z.literal('business') }).strict()
export const slideBlockSchema = z.discriminatedUnion('type', [
  z.object({ id, type: z.literal('paragraph'), text: z.string().max(600) }).strict(),
  z.object({ id, type: z.literal('list'), items: z.array(z.string().max(160)).min(1).max(6) }).strict(),
  z.object({ id, type: z.literal('table'), columns: z.array(z.string().max(50)).min(1).max(4), rows: z.array(z.array(z.string().max(80)).min(1).max(4)).max(6) }).strict(),
])
export const slideSchema = z.object({ id, layout: z.enum(['title', 'content', 'twoColumns']), title: z.string().max(120), blocks: z.array(slideBlockSchema).max(2), image: slideImageSchema.optional(), imagePrompt: z.string().max(1500).optional(), imageStyle: z.string().max(300).optional(), design: designSchema.optional() }).strict().superRefine((slide, ctx) => {
  if (slide.layout === 'title' && slide.blocks.length > 1) ctx.addIssue({ code: 'custom', message: 'На титульном слайде допустим один блок' })
  for (const block of slide.blocks) if (block.type === 'table' && block.rows.some(row => row.length !== block.columns.length)) ctx.addIssue({ code: 'custom', message: 'Проверьте количество ячеек таблицы' })
})
export const presentationContentSchema = z.object({ schemaVersion: z.literal(1), kind: z.literal('presentation'), metadata: z.object({ language: z.enum(['ru', 'en']), theme: z.enum(themeNames) }).strict(), design: designSchema.optional(), slides: z.array(slideSchema).min(1).max(40) }).strict().superRefine((content, ctx) => {
  const ids = content.slides.flatMap(slide => [slide.id, ...slide.blocks.map(block => block.id)])
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Идентификаторы слайдов и блоков должны быть уникальными' })
})
const cellStyle = { id, format: z.enum(['general', 'number', 'integer', 'percent', 'currency']).default('general'), bold: z.boolean().default(false) }
export const cellSchema = z.discriminatedUnion('type', [
  z.object({ ...cellStyle, type: z.literal('text'), value: z.string().max(1000) }).strict(),
  z.object({ ...cellStyle, type: z.literal('number'), value: z.number().finite() }).strict(),
  z.object({ ...cellStyle, type: z.literal('boolean'), value: z.boolean() }).strict(),
  z.object({ ...cellStyle, type: z.literal('date'), value: z.iso.date() }).strict(),
  z.object({ ...cellStyle, type: z.literal('formula'), value: z.string().min(1).max(300) }).strict(),
])
export const worksheetSchema = z.object({
  id, name: z.string().trim().min(1).max(31).refine(name => !/[\\/*?:[\]]/.test(name) && ![...name].some(char => char.charCodeAt(0) < 32) && !name.startsWith("'") && !name.endsWith("'") && name.toLowerCase() !== 'history', 'Недопустимое имя листа'),
  columns: z.array(z.object({ id, width: z.number().min(8).max(60) }).strict()).min(1).max(12),
  rows: z.array(z.object({ id, cells: z.array(cellSchema).min(1).max(12) }).strict()).min(1).max(100),
  headerRow: z.boolean(),
}).strict().superRefine((sheet, ctx) => {
  if (sheet.rows.some(row => row.cells.length !== sheet.columns.length)) ctx.addIssue({ code: 'custom', message: 'Количество ячеек должно совпадать с количеством колонок' })
})
export const spreadsheetContentSchema = z.object({ schemaVersion: z.literal(1), kind: z.literal('spreadsheet'), metadata, worksheets: z.array(worksheetSchema).min(1).max(5) }).strict().superRefine((content, ctx) => {
  const names = content.worksheets.map(sheet => sheet.name.toLowerCase())
  if (new Set(names).size !== names.length) ctx.addIssue({ code: 'custom', message: 'Имена листов должны быть уникальными' })
  const ids = content.worksheets.flatMap(sheet => [sheet.id, ...sheet.columns.map(col => col.id), ...sheet.rows.flatMap(row => [row.id, ...row.cells.map(cell => cell.id)])])
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Идентификаторы листов, строк и ячеек должны быть уникальными' })
})
export type Slide = z.infer<typeof slideSchema>
export type SlideBlock = z.infer<typeof slideBlockSchema>
export type PresentationContent = z.infer<typeof presentationContentSchema>
export type SpreadsheetContent = z.infer<typeof spreadsheetContentSchema>
export type Worksheet = z.infer<typeof worksheetSchema>
export type Cell = z.infer<typeof cellSchema>
export const exportFormats = { text: ['pdf', 'docx', 'txt', 'markdown'], presentation: ['pptx'], spreadsheet: ['xlsx'] } as const
export type ExportFormat = typeof exportFormats[keyof typeof exportFormats][number]
export function blankCell(): Cell { return { id: crypto.randomUUID(), type: 'text', value: '', format: 'general', bold: false } }
export function blankWorksheet(name: string): Worksheet {
  return { id: crypto.randomUUID(), name, headerRow: true, columns: Array.from({ length: 4 }, () => ({ id: crypto.randomUUID(), width: 24 })), rows: Array.from({ length: 8 }, () => ({ id: crypto.randomUUID(), cells: Array.from({ length: 4 }, blankCell) })) }
}
