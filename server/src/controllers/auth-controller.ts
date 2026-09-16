import { Router } from 'express'
import { z } from 'zod'
import type { authService } from '../services/auth-service.js'

const credentials = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(10, 'Не менее 10 символов').refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Пароль слишком длинный'),
}).strict()
export function authController(service: ReturnType<typeof authService>, secure: boolean) {
  const router = Router()
  const cookieOptions = { httpOnly: true, secure, sameSite: 'strict' as const, path: '/api/v1/auth' }
  for (const operation of ['register', 'login'] as const) {
    router.post(`/${operation}`, async (req, res) => {
      const { email, password } = credentials.parse(req.body)
      const result = await service[operation](email, password)
      res.cookie('refreshToken', result.refreshToken, { ...cookieOptions, expires: result.expiresAt })
      res.status(operation === 'register' ? 201 : 200).json({ user: result.user, accessToken: result.accessToken })
    })
  }
  router.post('/refresh', async (req, res) => {
    const result = await service.refresh(typeof req.cookies?.refreshToken === 'string' ? req.cookies.refreshToken : undefined)
    res.cookie('refreshToken', result.refreshToken, { ...cookieOptions, expires: result.expiresAt })
    res.json({ user: result.user, accessToken: result.accessToken })
  })
  router.post('/logout', async (req, res) => {
    await service.logout(typeof req.cookies?.refreshToken === 'string' ? req.cookies.refreshToken : undefined)
    res.clearCookie('refreshToken', cookieOptions).status(204).end()
  })
  return router
}
