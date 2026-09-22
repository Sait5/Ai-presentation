import { Router, raw } from 'express'
import { z } from 'zod'
import { rateLimit } from 'express-rate-limit'
import type { PrismaClient } from '../generated/prisma/client.js'
import type { AppConfig } from '../config.js'
import { authRepository } from '../repositories/auth-repository.js'
import { documentRepository } from '../repositories/document-repository.js'
import { authService } from '../services/auth-service.js'
import { documentService } from '../services/document-service.js'
import { authController } from '../controllers/auth-controller.js'
import { documentController } from '../controllers/document-controller.js'
import { HttpError } from '../middleware/errors.js'
import { imageService } from '../services/image-service.js'
import { aiService } from '../services/ai-service.js'
import { commonsService } from '../services/commons-service.js'
import { imageRequestSchema, presentationRequestSchema, officeRequestSchema } from '../contracts/ai.js'

export function createApi(db: PrismaClient, config: AppConfig) {
  const router = Router()
  const auth = authService(authRepository(db), config.JWT_SECRET)
  router.use((req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (req.get('Origin') !== config.CLIENT_ORIGIN || req.get('X-Requested-With') !== 'AI-Documents')) {
      throw new HttpError(403, 'CSRF_REJECTED', 'Запрос отклонён. Откройте приложение по настроенному адресу.')
    }
    next()
  })
  const limiter = (limit: number) => rateLimit({ windowMs: 15 * 60000, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, res) => { res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Слишком много запросов. Повторите позже.', requestId: res.locals.requestId } }) },
  })
  router.use('/auth', limiter(60), authController(auth, config.NODE_ENV === 'production'))
  router.use((req, res, next) => {
    const bearer = req.get('Authorization')
    if (!bearer?.startsWith('Bearer ')) throw new HttpError(401, 'UNAUTHORIZED', 'Войдите в аккаунт')
    res.locals.userId = auth.verify(bearer.slice(7))
    next()
  })
  router.get('/auth/me', async (_req, res) => { res.json({ user: await auth.me(res.locals.userId as string) }) })
  const images = imageService(db)
  const ai = aiService(config)
  router.get('/account/quota', async (_req, res) => { res.json(await documentRepository(db).quota(res.locals.userId as string)) })
  router.get('/ai/status', (_req, res) => { res.json(ai.status) })
  router.use('/ai', limiter(30))
  const active = new Set<string>()
  router.post('/ai/office', async (req, res) => {
    const input = officeRequestSchema.parse(req.body)
    const userId = res.locals.userId as string
    if (active.has(userId)) throw new HttpError(409, 'AI_BUSY', 'Дождитесь завершения текущей генерации')
    active.add(userId)
    try { res.json(await ai.office(input)) } finally { active.delete(userId) }
  })
  const findImage = commonsService()
  router.post('/ai/image/search', async (req, res) => {
    const { query } = z.object({ query: z.string().trim().min(2).max(150) }).strict().parse(req.body)
    const userId = res.locals.userId as string
    if (active.has(userId)) throw new HttpError(409, 'AI_BUSY', 'Дождитесь завершения текущей генерации')
    active.add(userId)
    try {
      const found = await findImage(query)
      res.status(201).json({ ...await images.store(userId, found.bytes), source: found.source })
    } finally { active.delete(userId) }
  })
  router.post('/ai/presentation', async (req, res) => {
    const input = presentationRequestSchema.parse(req.body)
    const userId = res.locals.userId as string
    if (active.has(userId)) throw new HttpError(409, 'AI_BUSY', 'Дождитесь завершения текущей генерации')
    active.add(userId)
    try { res.json(await ai.presentation(input)) } finally { active.delete(userId) }
  })
  router.post('/ai/presentation/stream', async (req, res) => {
    const input = presentationRequestSchema.parse(req.body)
    const userId = res.locals.userId as string
    if (active.has(userId)) throw new HttpError(409, 'AI_BUSY', 'Дождитесь завершения текущей генерации')
    active.add(userId)
    const controller = new AbortController()
    res.on('close', () => controller.abort())
    res.set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' })
    res.flushHeaders()
    const send = (event: unknown) => { if (!res.destroyed) res.write(JSON.stringify(event) + '\n') }
    try {
      send({ type: 'start' })
      const content = await ai.presentation(input, text => send({ type: 'text', text }), controller.signal)
      send({ type: 'complete', content })
    } catch (error) {
      send({ type: 'error', message: error instanceof HttpError ? error.message : 'Не удалось создать презентацию. Попробуйте снова.' })
    } finally { active.delete(userId); res.end() }
  })
  router.post('/ai/image', async (req, res) => {
    const input = imageRequestSchema.parse(req.body)
    const userId = res.locals.userId as string
    if (active.has(userId)) throw new HttpError(409, 'AI_BUSY', 'Дождитесь завершения текущей генерации')
    active.add(userId)
    try { res.status(201).json(await images.store(userId, await ai.image(input))) } finally { active.delete(userId) }
  })
  router.post('/images', limiter(60), raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '8mb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body)) throw new HttpError(415, 'IMAGE_TYPE', 'Загрузите PNG, JPEG или WebP')
    res.status(201).json(await images.store(res.locals.userId as string, req.body))
  })
  router.get('/images/:id', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id)
    res.type('image/png').send(await images.get(res.locals.userId as string, id))
  })
  router.use('/documents', limiter(300), documentController(documentService(documentRepository(db), images.validate), images.get))
  return router
}
