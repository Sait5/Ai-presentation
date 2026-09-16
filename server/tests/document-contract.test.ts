import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { emptyContent, textContentSchema } from '../src/contracts/document.js'

test('rejects unknown schema versions, duplicate IDs and malformed table rows', () => {
  const id = randomUUID()
  assert.equal(textContentSchema.safeParse({ ...emptyContent(), schemaVersion: 2 }).success, false)
  assert.equal(textContentSchema.safeParse({ ...emptyContent(), blocks: [
    { id, type: 'paragraph', text: 'A' }, { id, type: 'paragraph', text: 'B' },
  ] }).success, false)
  assert.equal(textContentSchema.safeParse({ ...emptyContent(), blocks: [
    { id, type: 'table', columns: ['A', 'B'], rows: [['only one cell']] },
  ] }).success, false)
})
