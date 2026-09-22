import { Router } from 'express'
import { z } from 'zod'
import { documentInputSchema, updateDocumentSchema } from '../contracts/document.js'
import type { documentService } from '../services/document-service.js'
import { generateExport, mimeTypes } from '../generators/export.js'
import { HttpError } from '../middleware/errors.js'

export function documentController(service: ReturnType<typeof documentService>, getImage?: (ownerId: string, id: string) => Promise<Buffer>) {
  const router = Router()
  router.param('documentId', (_req, _res, next, value) => {
    const result = z.string().uuid().safeParse(value)
    next(result.success ? undefined : new HttpError(400, 'INVALID_ID', 'Некорректный идентификатор'))
  })
  router.get('/', async (req, res) => {
    // Vercel forwards the named rewrite capture as a query parameter.
    // It is routing metadata, never a document filter or filesystem path.
    const { page } = z.object({
      page: z.coerce.number().int().min(1).max(100000).default(1),
      path: z.union([z.string(), z.array(z.string())]).optional(),
    }).strict().parse(req.query)
    res.json(await service.list(res.locals.userId as string, page))
  })
  router.post('/', async (req, res) => { res.status(201).json(await service.create(res.locals.userId as string, documentInputSchema.parse(req.body))) })
  router.get('/:documentId', async (req, res) => { res.json(await service.get(res.locals.userId as string, String(req.params.documentId))) })
  router.patch('/:documentId', async (req, res) => {
    const { expectedRevision, ...input } = updateDocumentSchema.parse(req.body)
    res.json(await service.update(res.locals.userId as string, String(req.params.documentId), input, expectedRevision))
  })
  router.delete('/:documentId', async (req, res) => {
    await service.remove(res.locals.userId as string, String(req.params.documentId))
    res.status(204).end()
  })
  router.post('/:documentId/duplicate', async (req, res) => { res.status(201).json(await service.duplicate(res.locals.userId as string, String(req.params.documentId))) })
  router.post('/:documentId/exports', async (req, res) => {
    const { revision, format } = z.object({ format: z.enum(['pdf', 'docx', 'pptx', 'xlsx', 'txt', 'markdown']), revision: z.number().int().positive() }).strict().parse(req.body)
    const document = await service.get(res.locals.userId as string, String(req.params.documentId))
    if (document.revision !== revision) throw new HttpError(409, 'REVISION_CONFLICT', 'Сохранённая версия изменилась. Обновите документ перед экспортом.')
    const bytes = await generateExport(document, format, getImage ? id => getImage(res.locals.userId as string, id) : undefined)
    const extension = format === 'markdown' ? 'md' : format
    const filename = [...document.title.replace(/[<>:"/\\|?*]/g, '_')].map(char => char.charCodeAt(0) < 32 ? '_' : char).join('') + '.' + extension
    res.setHeader('Content-Type', mimeTypes[format])
    res.setHeader('Content-Disposition', `attachment; filename="document-${document.id}.${extension}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/'/g, '%27')}`)
    res.setHeader('X-Document-Revision', String(revision))
    res.send(bytes)
  })
  return router
}
