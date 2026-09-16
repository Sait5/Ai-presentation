import assert from 'node:assert/strict'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { z } from 'zod'
import { createApp } from '../src/app.js'

const errorResponse = z.object({ error: z.object({ code: z.string(), message: z.string(), requestId: z.string().uuid() }) })

async function start(t: TestContext, checkDatabase: () => Promise<void> = async () => {}) {
  const server = createApp({ clientOrigin: 'http://localhost:5173', checkDatabase }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
    server.closeAllConnections()
  }))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

test('liveness remains available while database fails; readiness returns a safe 503', async (t) => {
  const url = await start(t, async () => { throw new Error('postgresql://private:secret@database') })
  const live = await fetch(`${url}/health`)
  assert.equal(live.status, 200)
  assert.deepEqual(await live.json(), { status: 'ok' })
  assert.equal(live.headers.get('x-powered-by'), null)
  const ready = await fetch(`${url}/health/ready`)
  assert.equal(ready.status, 503)
  const body = errorResponse.parse(await ready.json())
  assert.equal(body.error.code, 'DATABASE_UNAVAILABLE')
  assert.equal(body.error.requestId, ready.headers.get('x-request-id'))
  assert.ok(!JSON.stringify(body).includes('secret'))
})

test('readiness succeeds when its dependency responds', async (t) => {
  const response = await fetch(`${await start(t)}/health/ready`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ready', database: 'up' })
})

test('unknown routes, malformed JSON and oversized requests return JSON errors', async (t) => {
  const url = await start(t)
  for (const [body, status, code] of [
    ['{}', 404, 'NOT_FOUND'],
    ['{', 400, 'INVALID_JSON'],
    [JSON.stringify({ text: 'x'.repeat(270000) }), 413, 'PAYLOAD_TOO_LARGE'],
  ] as const) {
    const response = await fetch(`${url}/missing`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    })
    assert.equal(response.status, status)
    assert.equal(errorResponse.parse(await response.json()).error.code, code)
  }
})

test('CORS does not authorize an unconfigured browser origin', async (t) => {
  const url = await start(t)
  for (const origin of ['http://localhost:5173', 'https://untrusted.example']) {
    const response = await fetch(`${url}/health`, { headers: { Origin: origin } })
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173')
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true')
  }
})
