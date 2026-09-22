import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readSse } from '../src/services/sse.js'
import { commonsService } from '../src/services/commons-service.js'

test('SSE handles fragmented UTF-8, CRLF and several events per chunk', async () => {
  const bytes = new TextEncoder().encode('data: {"text":"Привет"}\r\n\r\ndata: {"text":"мир"}\n\n')
  const stream = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close() } })
  const values: unknown[] = []
  await readSse(new Response(stream), value => values.push(value))
  assert.deepEqual(values, [{ text: 'Привет' }, { text: 'мир' }])
})

test('Commons rejects non-public-domain licenses and untrusted download hosts', async () => {
  let calls = 0
  const lookup = commonsService(async () => {
    calls++
    return Response.json({ query: { pages: {
      a: { imageinfo: [{ url: 'https://upload.wikimedia.org/a.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:A', mime: 'image/jpeg', extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' } } }] },
      b: { imageinfo: [{ url: 'http://127.0.0.1/secret', descriptionurl: 'https://commons.wikimedia.org/wiki/File:B', mime: 'image/jpeg', extmetadata: { LicenseShortName: { value: 'Public domain' } } }] },
    } } })
  })
  await assert.rejects(lookup('planets'), { code: 'IMAGE_NOT_FOUND' })
  assert.equal(calls, 1)
})

test('Commons downloads a public-domain image with redirects disabled and preserves source', async () => {
  let calls = 0
  const lookup = commonsService(async (url, options) => {
    calls++
    assert.equal(options?.redirect, 'error')
    if (calls === 1) return Response.json({ query: { pages: { a: { imageinfo: [{ url: 'https://upload.wikimedia.org/a.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:A', mime: 'image/jpeg', extmetadata: { LicenseShortName: { value: 'CC0' } } }] } } } })
    assert.equal(String(url), 'https://upload.wikimedia.org/a.jpg')
    return new Response(Uint8Array.of(1, 2, 3))
  })
  const found = await lookup('planets')
  assert.equal(found.bytes.length, 3)
  assert.equal(found.source, 'https://commons.wikimedia.org/wiki/File:A')
})
