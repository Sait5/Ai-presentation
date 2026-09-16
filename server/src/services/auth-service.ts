import { createHash, randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { HttpError } from '../middleware/errors.js'
import type { authRepository } from '../repositories/auth-repository.js'

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const unauthorized = () => new HttpError(401, 'UNAUTHORIZED', 'Войдите в аккаунт')
export function authService(repo: ReturnType<typeof authRepository>, secret: string) {
  function accessToken(userId: string) {
    return jwt.sign({}, secret, { subject: userId, algorithm: 'HS256', expiresIn: '10m', issuer: 'ai-documents', audience: 'ai-documents-web' })
  }
  async function sessionFor(user: { id: string; email: string }) {
    const refreshToken = randomBytes(48).toString('base64url')
    const expiresAt = new Date(Date.now() + 7 * 86400000)
    await repo.createSession({ userId: user.id, familyId: randomUUID(), tokenHash: hashToken(refreshToken), expiresAt })
    return { user: { id: user.id, email: user.email }, accessToken: accessToken(user.id), refreshToken, expiresAt }
  }
  return {
    async register(email: string, password: string) {
      try { return await sessionFor(await repo.createUser(email, await bcrypt.hash(password, 12))) }
      catch (error) {
        if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') throw new HttpError(409, 'EMAIL_EXISTS', 'Этот email уже зарегистрирован')
        throw error
      }
    },
    async login(email: string, password: string) {
      const user = await repo.findByEmail(email)
      // Perform a password check even for unknown users to reduce timing differences.
      const valid = await bcrypt.compare(password, user?.passwordHash ?? '$2b$12$C6UzMDM.H6dfI/f/IKcEe.0H8xz.jBhTiSczKNc.RqmUU27D3oYhS')
      if (!user || !valid) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль')
      return sessionFor(user)
    },
    async refresh(token: string | undefined) {
      if (!token || token.length > 128) throw unauthorized()
      const next = randomBytes(48).toString('base64url')
      const session = await repo.rotate(hashToken(token), hashToken(next))
      if (!session) throw unauthorized()
      const user = await repo.findById(session.userId)
      if (!user) throw unauthorized()
      return { user, accessToken: accessToken(user.id), refreshToken: next, expiresAt: session.expiresAt }
    },
    async logout(token: string | undefined) { if (token && token.length <= 128) await repo.revoke(hashToken(token)) },
    verify(token: string) {
      try {
        const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'ai-documents', audience: 'ai-documents-web' })
        if (typeof payload === 'string' || !payload.sub || !/^[0-9a-f-]{36}$/i.test(payload.sub)) throw unauthorized()
        return payload.sub
      } catch { throw unauthorized() }
    },
    async me(userId: string) {
      const user = await repo.findById(userId)
      if (!user) throw unauthorized()
      return user
    },
  }
}
