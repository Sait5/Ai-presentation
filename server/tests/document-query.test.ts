import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { createApp } from '../src/app.js'
import { documentController } from '../src/controllers/document-controller.js'
import type { documentService } from '../src/services/document-service.js'

test('document listing accepts Vercel path metadata without changing pagination validation', async () => {
  const pages: number[] = []
  const service = { list: async (_owner: string, page: number) => { pages.push(page); return { documents: [], total: 0 } } } as unknown as ReturnType<typeof documentService>
  const app = createApp({ clientOrigin: 'http://localhost:5173', checkDatabase: async () => {}, api: documentController(service) })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`
  try {
    assert.equal((await fetch(base + '?path=v1%2Fdocuments&page=2')).status, 200)
    assert.deepEqual(pages, [2])
    assert.equal((await fetch(base + '?path=v1%2Fdocuments&page=0')).status, 422)
    assert.equal((await fetch(base + '?unexpected=value')).status, 422)
  } finally { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() }) }
})
