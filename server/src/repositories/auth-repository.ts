import type { PrismaClient } from '../generated/prisma/client.js'

export function authRepository(db: PrismaClient) {
  return {
    findByEmail: (email: string) => db.user.findUnique({ where: { email } }),
    findById: (id: string) => db.user.findUnique({ where: { id }, select: { id: true, email: true } }),
    createUser: (email: string, passwordHash: string) => db.user.create({ data: { email, passwordHash } }),
    createSession: (data: { userId: string; familyId: string; tokenHash: string; expiresAt: Date }) => db.session.create({ data }),
    async rotate(tokenHash: string, nextHash: string) {
      const result = await db.$transaction(async (tx) => {
        const old = await tx.session.findUnique({ where: { tokenHash } })
        if (!old) return null
        if (old.revokedAt || old.expiresAt <= new Date()) return { replay: old.familyId }
        const changed = await tx.session.updateMany({ where: { id: old.id, revokedAt: null }, data: { revokedAt: new Date() } })
        if (changed.count !== 1) return { replay: old.familyId }
        const session = await tx.session.create({ data: {
          userId: old.userId, familyId: old.familyId, tokenHash: nextHash, expiresAt: old.expiresAt,
        } })
        return { session }
      })
      if (result && 'replay' in result) {
        await db.session.updateMany({ where: { familyId: result.replay }, data: { revokedAt: new Date() } })
        return null
      }
      return result?.session ?? null
    },
    async revoke(tokenHash: string) {
      const session = await db.session.findUnique({ where: { tokenHash } })
      if (session) await db.session.updateMany({ where: { familyId: session.familyId }, data: { revokedAt: new Date() } })
    },
  }
}
