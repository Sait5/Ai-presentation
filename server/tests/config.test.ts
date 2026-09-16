import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseEnvironment } from '../src/config.js'

const valid = { DATABASE_URL: 'postgresql://test:test@localhost:5432/test', JWT_SECRET: 'x'.repeat(64) }

test('loads defaults without requiring an OpenAI key', () => {
  const config = parseEnvironment(valid)
  assert.equal(config.PORT, 3001)
  assert.equal(config.CLIENT_ORIGIN, 'http://localhost:5173')
})

test('rejects invalid ports, missing database and origins with paths', () => {
  for (const environment of [{}, { ...valid, PORT: '0' }, { ...valid, PORT: 'abc' },
    { ...valid, CLIENT_ORIGIN: 'https://example.com/path' },
    { DATABASE_URL: 'https://example.com/db' }]) {
    assert.throws(() => parseEnvironment(environment), /Invalid environment variables/)
  }
})

test('configuration errors never echo credentials', () => {
  assert.throws(() => parseEnvironment({ ...valid, DATABASE_URL: 'invalid-secret-value' }), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.equal(error.message, 'Invalid environment variables: DATABASE_URL')
    return true
  })
})
