import { documentInputSchema, documentSchema } from '../contracts/document.js'
import type { DocumentInput } from '../contracts/document.js'
import type { documentRepository } from '../repositories/document-repository.js'
import { HttpError } from '../middleware/errors.js'

export function documentService(repo: ReturnType<typeof documentRepository>, validateImages: (ownerId: string, data: DocumentInput) => Promise<void> = async () => {}) {
  // Prisma rows also contain ownerId; never include ownership internals in the public contract.
  const publicDocument = (doc: Awaited<ReturnType<typeof repo.create>>) => documentSchema.parse({
    id: doc.id, title: doc.title, kind: doc.kind, purpose: doc.purpose, content: doc.content,
    revision: doc.revision, createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString(),
  })
  return {
    async list(ownerId: string, page: number) {
      const [items, total] = await repo.list(ownerId, page)
      return { items, total, page, pageSize: 20 }
    },
    async get(ownerId: string, id: string) {
      const doc = await repo.get(ownerId, id)
      if (!doc) throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Документ не найден')
      return publicDocument(doc)
    },
    async create(ownerId: string, data: DocumentInput) { await validateImages(ownerId, data); return publicDocument(await repo.create(ownerId, data)) },
    async update(ownerId: string, id: string, data: DocumentInput, revision: number) {
      if (!await repo.get(ownerId, id)) throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Документ не найден')
      await validateImages(ownerId, data)
      return publicDocument(await repo.update(ownerId, id, data, revision))
    },
    async duplicate(ownerId: string, id: string) {
      const doc = await repo.get(ownerId, id)
      if (!doc) throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Документ не найден')
      return publicDocument(await repo.create(ownerId, documentInputSchema.parse({ title: `${doc.title.slice(0,280)} — копия`, purpose: doc.purpose, content: doc.content })))
    },
    async remove(ownerId: string, id: string) {
      if (!(await repo.remove(ownerId, id)).count) throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Документ не найден')
    },
  }
}
