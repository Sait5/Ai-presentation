import { randomUUID } from 'node:crypto'
import express from 'express'
import type { ErrorRequestHandler } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { ZodError } from 'zod'
import { HttpError } from './middleware/errors.js'
import type { Router } from 'express'

interface AppOptions {
  clientOrigin: string
  checkDatabase: () => Promise<void>
  api?: Router
}

export function createApp({ clientOrigin, checkDatabase, api }: AppOptions) {
  const app = express()
  app.disable('x-powered-by')
  app.use((_req, res, next) => {
    res.locals.requestId = randomUUID()
    res.setHeader('X-Request-Id', res.locals.requestId as string)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.use(cors({ origin: clientOrigin, credentials: true }))
  app.use(express.json({ limit: '256kb' }))
  app.use(cookieParser())
  if (api) app.use('/api/v1', api)
  app.get('/health', (_req, res) => { res.json({ status: 'ok' }) })
  app.get('/health/ready', async (_req, res) => {
    try {
      await checkDatabase()
      res.json({ status: 'ready', database: 'up' })
    } catch {
      res.status(503).json({ error: {
        code: 'DATABASE_UNAVAILABLE', message: 'База данных временно недоступна',
        requestId: res.locals.requestId,
      } })
    }
  })
  app.use((_req, res) => {
    res.status(404).json({ error: {
      code: 'NOT_FOUND', message: 'Маршрут не найден', requestId: res.locals.requestId,
    } })
  })
  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message, requestId: res.locals.requestId } })
      return
    }
    if (error instanceof ZodError) {
      res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Проверьте введённые данные',
        fieldErrors: error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })), requestId: res.locals.requestId } })
      return
    }
    const type = typeof error === 'object' && error !== null && 'type' in error ? error.type : undefined
    const [status, code, message] = type === 'entity.too.large'
      ? [413, 'PAYLOAD_TOO_LARGE', 'Превышен допустимый размер запроса'] as const
      : type === 'entity.parse.failed'
        ? [400, 'INVALID_JSON', 'Некорректный JSON'] as const
        : [500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера'] as const
    res.status(status).json({ error: { code, message, requestId: res.locals.requestId } })
  }
  app.use(errorHandler)
  return app
}
