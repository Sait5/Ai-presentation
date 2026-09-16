import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createDatabase } from '../../src/database.js'

test('PostgreSQL persists JSONB and enforces version uniqueness and cascading relations', async () => {
  const connectionString = process.env.TEST_DATABASE_URL
  assert.ok(connectionString, 'Set TEST_DATABASE_URL to an isolated migrated test database')
  const database = createDatabase(connectionString)
  const email = `foundation-${randomUUID()}@example.test`
  let userId: string | undefined
  try {
    await database.check()
    const user = await database.client.user.create({ data: { email, passwordHash: 'test-only-fixture' } })
    userId = user.id
    const content = { schemaVersion: 1, kind: 'text', metadata: { language: 'ru' }, blocks: [
      { id: randomUUID(), type: 'paragraph', text: 'Проверка сохранения кириллицы' },
    ] }
    const document = await database.client.document.create({ data: {
      ownerId: user.id, title: 'Тестовый документ', kind: 'text', purpose: 'report', content,
      versions: { create: { revision: 1, title: 'Тестовый документ', kind: 'text', purpose: 'report', content, reason: 'test' } },
    } })
    // A fresh client proves the result is read from PostgreSQL, not in-memory state.
    const reader = createDatabase(connectionString)
    try {
      const restored = await reader.client.document.findUniqueOrThrow({ where: { id: document.id } })
      assert.deepEqual(restored.content, content)
      assert.equal(restored.revision, 1)
    } finally { await reader.close() }
    await assert.rejects(database.client.documentVersion.create({ data: {
      documentId: document.id, revision: 1, title: document.title,
      kind: 'text', purpose: 'report', content, reason: 'duplicate',
    } }), { code: 'P2002' })
    await database.client.user.delete({ where: { id: user.id } })
    userId = undefined
    assert.equal(await database.client.document.count({ where: { id: document.id } }), 0)
    assert.equal(await database.client.documentVersion.count({ where: { documentId: document.id } }), 0)
  } finally {
    try {
      if (userId) await database.client.user.delete({ where: { id: userId } })
    } finally { await database.close() }
  }
})
