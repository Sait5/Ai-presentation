import type { PrismaClient } from '../generated/prisma/client.js'
import type { DocumentInput } from '../contracts/document.js'
import { HttpError } from '../middleware/errors.js'

export function documentRepository(db: PrismaClient) {
  return {
    list: (ownerId: string, page: number) => db.$transaction([
      db.document.findMany({ where: { ownerId }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 20, take: 20,
        select: { id: true, title: true, kind: true, purpose: true, revision: true, updatedAt: true, createdAt: true } }),
      db.document.count({ where: { ownerId } }),
    ]),
    get: (ownerId: string, id: string) => db.document.findFirst({ where: { id, ownerId } }),
    create: (ownerId: string, data: DocumentInput) => db.document.create({ data: {
      ...data, kind: data.content.kind, ownerId,
      versions: { create: { ...data, kind: data.content.kind, revision: 1, reason: 'created' } },
    } }),
    async update(ownerId: string, id: string, data: DocumentInput, expectedRevision: number) {
      return db.$transaction(async (tx) => {
        const current = await tx.document.findFirst({ where: { id, ownerId } })
        if (!current) throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Документ не найден')
        if (current.kind !== data.content.kind) throw new HttpError(422, 'KIND_MISMATCH', 'Вид существующего документа нельзя менять')
        const updated = await tx.document.updateMany({ where: { id, ownerId, revision: expectedRevision }, data: { ...data, revision: { increment: 1 } } })
        if (!updated.count) throw new HttpError(409, 'REVISION_CONFLICT', 'Документ изменён в другом окне. Ваши правки сохранены в редакторе.')
        await tx.documentVersion.create({ data: { ...data, documentId: id, kind: data.content.kind, revision: expectedRevision + 1, reason: 'manualSave' } })
        return tx.document.findUniqueOrThrow({ where: { id } })
      })
    },
    remove: (ownerId: string, id: string) => db.document.deleteMany({ where: { id, ownerId } }),
  }
}
