import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createDatabase } from '../../src/database.js'
import { documentRepository } from '../../src/repositories/document-repository.js'
import { documentService } from '../../src/services/document-service.js'
import { newContent, type DocumentInput } from '../../src/contracts/document.js'

test('lifetime quota is atomic across kinds, counts duplicates, survives deletion and exempts only admin', async () => {
  assert.ok(process.env.TEST_DATABASE_URL)
  const db = createDatabase(process.env.TEST_DATABASE_URL)
  const user = await db.client.user.create({ data: { email: `quota-${randomUUID()}@example.test`, passwordHash: 'test-only' } })
  const repo = documentRepository(db.client), service = documentService(repo)
  const input = (kind: 'text' | 'presentation' | 'spreadsheet'): DocumentInput => ({ title: 'Quota test', purpose: 'report', content: newContent(kind) })
  try {
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => repo.create(user.id, input((['text','presentation','spreadsheet'] as const)[i % 3]!))))
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 8)
    for (const result of results) if (result.status === 'rejected') assert.equal(result.reason.code, 'DOCUMENT_QUOTA')
    assert.deepEqual(await repo.quota(user.id), { used: 8, limit: 8, isAdmin: false })
    const doc = await db.client.document.findFirstOrThrow({ where: { ownerId: user.id } })
    await assert.rejects(service.duplicate(user.id, doc.id), { code: 'DOCUMENT_QUOTA' })
    await repo.remove(user.id, doc.id)
    await assert.rejects(repo.create(user.id, input('text')), { code: 'DOCUMENT_QUOTA' })
    assert.equal((await repo.quota(user.id)).used, 8)
    await db.client.user.update({ where: { id: user.id }, data: { isAdmin: true } })
    await repo.create(user.id, input('text'))
    assert.deepEqual(await repo.quota(user.id), { used: 9, limit: null, isAdmin: true })
  } finally { await db.client.user.delete({ where: { id: user.id } }); await db.close() }
})
