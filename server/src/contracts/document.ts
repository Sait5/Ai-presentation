import { z } from 'zod'
import { presentationContentSchema, spreadsheetContentSchema, blankWorksheet } from './office.js'

const id = z.string().uuid()
const text = z.string().max(12000)
export const textDesignSchema = z.object({ font: z.enum(['Arial', 'Georgia', 'Verdana']), size: z.number().int().min(9).max(28), align: z.enum(['left', 'center', 'right', 'justify']), lineHeight: z.number().min(1).max(2), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).strict()
export const defaultTextDesign: z.infer<typeof textDesignSchema> = { font: 'Arial', size: 12, align: 'left', lineHeight: 1.5, color: '#22332e' }
export const blockSchema = z.discriminatedUnion('type', [
  z.object({ id, type: z.literal('heading'), level: z.union([z.literal(1), z.literal(2), z.literal(3)]), text: z.string().max(300) }).strict(),
  z.object({ id, type: z.literal('paragraph'), text }).strict(),
  z.object({ id, type: z.literal('list'), ordered: z.boolean(), items: z.array(z.string().max(2000)).min(1).max(50) }).strict(),
  z.object({ id, type: z.literal('table'), columns: z.array(z.string().max(120)).min(1).max(6), rows: z.array(z.array(z.string().max(1200)).min(1).max(6)).max(100) }).strict(),
  z.object({ id, type: z.literal('pageBreak') }).strict(),
  z.object({ id, type: z.literal('image'), assetId: id, alt: z.string().max(500), width: z.number().min(10).max(100), align: z.enum(['left', 'center', 'right']) }).strict(),
])
export const textContentSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal('text'),
  metadata: z.object({ language: z.enum(['ru', 'en']), theme: z.literal('business') }).strict(),
  design: textDesignSchema.optional(),
  blocks: z.array(blockSchema).max(120),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.blocks.map((block) => block.id)).size !== value.blocks.length) {
    ctx.addIssue({ code: 'custom', message: 'Идентификаторы блоков должны быть уникальными', path: ['blocks'] })
  }
  value.blocks.forEach((block, index) => {
    if (block.type === 'table' && block.rows.some((row) => row.length !== block.columns.length)) {
      ctx.addIssue({ code: 'custom', message: 'Количество ячеек не совпадает с количеством колонок', path: ['blocks', index] })
    }
  })
  if (JSON.stringify(value).length > 100000) ctx.addIssue({ code: 'custom', message: 'Документ слишком большой' })
})
export const contentSchema = z.discriminatedUnion('kind', [textContentSchema, presentationContentSchema, spreadsheetContentSchema]).superRefine((content, ctx) => {
  if (JSON.stringify(content).length > 200000) ctx.addIssue({ code: 'custom', message: 'Документ слишком большой' })
})
export const documentInputSchema = z.object({
  title: z.string().trim().min(1, 'Введите название').max(300),
  purpose: z.enum(['proposal', 'report', 'resume', 'invoice', 'projectPlan', 'meetingNotes']),
  content: contentSchema,
}).strict()
export const updateDocumentSchema = documentInputSchema.extend({ expectedRevision: z.number().int().positive() })
export const documentSchema = documentInputSchema.extend({
  id, kind: z.enum(['text', 'presentation', 'spreadsheet']), revision: z.number().int().positive(),
  createdAt: z.string(), updatedAt: z.string(),
}).refine(doc => doc.kind === doc.content.kind, 'Вид документа не совпадает с содержимым')
export type TextBlock = z.infer<typeof blockSchema>
export type TextContent = z.infer<typeof textContentSchema>
export type DocumentInput = z.infer<typeof documentInputSchema>
export type SavedDocument = z.infer<typeof documentSchema>
export function emptyContent(): TextContent {
  return { schemaVersion: 1, kind: 'text', metadata: { language: 'ru', theme: 'business' }, blocks: [] }
}
export function newContent(kind: SavedDocument['kind']): DocumentInput['content'] {
  if (kind === 'presentation') return { schemaVersion: 1, kind, metadata: { language: 'ru', theme: 'business' }, slides: [{ id: crypto.randomUUID(), layout: 'title', title: 'Новая презентация', blocks: [] }] }
  if (kind === 'spreadsheet') return { schemaVersion: 1, kind, metadata: { language: 'ru', theme: 'business' }, worksheets: [blankWorksheet('Лист 1')] }
  return emptyContent()
}
