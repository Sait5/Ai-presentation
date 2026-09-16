import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import sharp from 'sharp'
import JSZip from 'jszip'
import { z } from 'zod'
import { createDatabase } from '../../src/database.js'
import { parseEnvironment } from '../../src/config.js'
import { createApp } from '../../src/app.js'
import { createApi } from '../../src/routes/api.js'
import { documentSchema, emptyContent, newContent } from '../../src/contracts/document.js'
import { defaultDesign, newSlideImage } from '../../src/contracts/design.js'

const sessionSchema = z.object({ user: z.object({ id: z.string(), email: z.string() }), accessToken: z.string() })
test('auth, ownership, revision conflicts, persistence and real PDF form one working flow', async () => {
  assert.ok(process.env.TEST_DATABASE_URL, 'TEST_DATABASE_URL required')
  const db = createDatabase(process.env.TEST_DATABASE_URL)
  const config = parseEnvironment({ DATABASE_URL: process.env.TEST_DATABASE_URL, JWT_SECRET: 'test-secret-'.repeat(8), NODE_ENV: 'test' })
  const app = createApp({ clientOrigin: config.CLIENT_ORIGIN, checkDatabase: db.check, api: createApi(db.client, config) })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`
  const users: string[] = []
  async function api(path: string, method = 'GET', body?: unknown, token?: string, cookie?: string, csrf = true) {
    return fetch(url + path, { method, headers: {
      'Content-Type': 'application/json', ...(csrf ? { Origin: config.CLIENT_ORIGIN, 'X-Requested-With': 'AI-Documents' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  }
  const cookieOf = (response: Response) => response.headers.get('set-cookie')!.split(';')[0]!
  try {
    const account = { email: `stage2-${randomUUID()}@example.test`, password: 'Safe-password-for-tests' }
    const aResponse = await api('/auth/register', 'POST', account)
    assert.equal(aResponse.status, 201)
    assert.match(aResponse.headers.get('set-cookie')!, /HttpOnly/i)
    assert.match(aResponse.headers.get('set-cookie')!, /SameSite=Strict/i)
    const a = sessionSchema.parse(await aResponse.json()); users.push(a.user.id)
    const cookieA = cookieOf(aResponse)
    const bResponse = await api('/auth/register', 'POST', { ...account, email: `stage2-${randomUUID()}@example.test` })
    const b = sessionSchema.parse(await bResponse.json()); users.push(b.user.id)
    const png = await sharp({ create: { width: 160, height: 100, channels: 3, background: '#acdcac' } }).png().toBuffer()
    const imageResponse = await fetch(url + '/images', { method: 'POST', headers: { 'Content-Type': 'image/png', Origin: config.CLIENT_ORIGIN, 'X-Requested-With': 'AI-Documents', Authorization: `Bearer ${a.accessToken}` }, body: png })
    assert.equal(imageResponse.status, 201)
    const image = z.object({ id: z.string().uuid() }).parse(await imageResponse.json())
    assert.equal((await api(`/images/${image.id}`, 'GET', undefined, b.accessToken)).status, 404)
    assert.equal((await api(`/images/${image.id}`)).status, 401)
    const ownImage = await api(`/images/${image.id}`, 'GET', undefined, a.accessToken)
    assert.equal(ownImage.status, 200); assert.equal(ownImage.headers.get('content-type'), 'image/png')
    const illustrated = newContent('presentation')
    assert.equal(illustrated.kind, 'presentation')
    if (illustrated.kind !== 'presentation') throw new Error('Expected presentation')
    illustrated.metadata.theme = 'creative'; illustrated.design = { ...defaultDesign, font: 'Georgia' }
    illustrated.slides[0]!.image = newSlideImage(image.id, 'Иллюстрация проекта')
    const illustratedInput = { title: 'Презентация с изображением', purpose: 'report', content: illustrated }
    assert.equal((await api('/documents', 'POST', illustratedInput, b.accessToken)).status, 422)
    const illustratedResponse = await api('/documents', 'POST', illustratedInput, a.accessToken)
    assert.equal(illustratedResponse.status, 201)
    const illustratedDoc = documentSchema.parse(await illustratedResponse.json())
    assert.deepEqual(documentSchema.parse(await (await api(`/documents/${illustratedDoc.id}`, 'GET', undefined, a.accessToken)).json()).content, illustrated)
    const illustratedExport = await api(`/documents/${illustratedDoc.id}/exports`, 'POST', { format: 'pptx', revision: 1 }, a.accessToken)
    assert.equal(illustratedExport.status, 200)
    const illustratedZip = await JSZip.loadAsync(await illustratedExport.arrayBuffer())
    assert.match(await illustratedZip.file('ppt/slides/slide1.xml')!.async('string'), /<p:pic>/)
    const illustratedCopy = documentSchema.parse(await (await api(`/documents/${illustratedDoc.id}/duplicate`, 'POST', {}, a.accessToken)).json())
    assert.deepEqual(illustratedCopy.content, illustrated)
    await api(`/documents/${illustratedDoc.id}`, 'DELETE', undefined, a.accessToken)
    assert.equal((await api(`/documents/${illustratedCopy.id}/exports`, 'POST', { format: 'pptx', revision: 1 }, a.accessToken)).status, 200)
    await api(`/documents/${illustratedCopy.id}`, 'DELETE', undefined, a.accessToken)
    assert.deepEqual(await (await api('/ai/status', 'GET', undefined, a.accessToken)).json(), { enabled: false, provider: 'gemini', imageGeneration: false })
    assert.equal((await api('/ai/image', 'POST', { prompt: 'Команда в офисе', style: 'Акварель', theme: 'business' }, a.accessToken)).status, 422)
    assert.equal((await api('/ai/presentation', 'POST', { topic: 'Запуск продукта и план команды', count: 3, language: 'ru', tone: 'Деловой', theme: 'business', design: defaultDesign, imageStyle: 'Акварель' }, a.accessToken)).status, 503)
    assert.equal((await api('/auth/login', 'POST', { ...account, password: 'incorrect-password' })).status, 401)
    assert.equal((await api('/auth/register', 'POST', account)).status, 409)
    assert.equal((await api('/documents')).status, 401)
    assert.equal((await api('/documents', 'POST', {}, a.accessToken, undefined, false)).status, 403)
    const content = { ...emptyContent(), blocks: [
      { id: randomUUID(), type: 'heading' as const, level: 1 as const, text: 'Коммерческое предложение' },
      { id: randomUUID(), type: 'paragraph' as const, text: 'Разработка цифровых сервисов для вашей компании. <script>alert("unsafe")</script> — это обычный текст.' },
      { id: randomUUID(), type: 'list' as const, ordered: true, items: ['Анализ требований', 'Проектирование и разработка', 'Запуск и поддержка'] },
      { id: randomUUID(), type: 'table' as const, columns: ['Услуга', 'Описание', 'Стоимость'], rows: Array.from({ length: 35 }, (_, index) => [`Этап ${index + 1}`, 'Проектирование, разработка и проверка качества. '.repeat(3), `${(index + 1) * 12000} ₽`]) },
      { id: randomUUID(), type: 'pageBreak' as const },
      { id: randomUUID(), type: 'heading' as const, level: 1 as const, text: 'Условия сотрудничества' },
      { id: randomUUID(), type: 'paragraph' as const, text: 'Мы согласуем результат каждого этапа и обеспечиваем прозрачность работы. '.repeat(90) },
    ] }
    const input = { title: 'Предложение для компании «Север»', purpose: 'proposal', content }
    const created = await api('/documents', 'POST', input, a.accessToken)
    assert.equal(created.status, 201)
    const doc = documentSchema.parse(await created.json())
    for (const [path, method, body] of [
      [`/documents/${doc.id}`, 'GET', undefined],
      [`/documents/${doc.id}`, 'PATCH', { ...input, expectedRevision: 1 }],
      [`/documents/${doc.id}`, 'DELETE', undefined],
      [`/documents/${doc.id}/duplicate`, 'POST', {}],
      [`/documents/${doc.id}/exports`, 'POST', { format: 'pdf', revision: 1 }],
    ] as const) assert.equal((await api(path, method, body, b.accessToken)).status, 404)
    const saved = await api(`/documents/${doc.id}`, 'PATCH', { ...input, title: input.title + ' — согласовано', expectedRevision: 1 }, a.accessToken)
    assert.equal(saved.status, 200)
    assert.equal(documentSchema.parse(await saved.json()).revision, 2)
    assert.equal((await api(`/documents/${doc.id}`, 'PATCH', { ...input, expectedRevision: 1 }, a.accessToken)).status, 409)
    const reopened = documentSchema.parse(await (await api(`/documents/${doc.id}`, 'GET', undefined, a.accessToken)).json())
    assert.deepEqual(reopened.content, content)
    assert.match(reopened.title, /согласовано/)
    assert.equal((await api(`/documents/${doc.id}/exports`, 'POST', { format: 'pdf', revision: 1 }, a.accessToken)).status, 409)
    const pdf = await api(`/documents/${doc.id}/exports`, 'POST', { format: 'pdf', revision: 2 }, a.accessToken)
    assert.equal(pdf.status, 200)
    assert.equal(pdf.headers.get('content-type'), 'application/pdf')
    assert.equal(pdf.headers.get('x-document-revision'), '2')
    const bytes = Buffer.from(await pdf.arrayBuffer())
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-')
    if (process.env.PDF_QA_PATH) await writeFile(process.env.PDF_QA_PATH, bytes)
    for (const [kind, format] of [['text', 'docx'], ['presentation', 'pptx'], ['spreadsheet', 'xlsx']] as const) {
      const officeInput = { title: `Офисный документ ${kind}`, purpose: 'report', content: newContent(kind) }
      const createdOffice = await api('/documents', 'POST', officeInput, a.accessToken)
      assert.equal(createdOffice.status, 201)
      const office = documentSchema.parse(await createdOffice.json())
      assert.equal(office.kind, kind)
      const path = `/documents/${office.id}`
      assert.equal((await api(path, 'GET', undefined, b.accessToken)).status, 404)
      assert.equal((await api(path, 'PATCH', { ...officeInput, expectedRevision: 1 }, b.accessToken)).status, 404)
      assert.equal((await api(path + '/duplicate', 'POST', {}, b.accessToken)).status, 404)
      assert.equal((await api(path + '/exports', 'POST', { format, revision: 1 }, b.accessToken)).status, 404)
      assert.equal((await api(path, 'DELETE', undefined, b.accessToken)).status, 404)
      const updatedOffice = await api(path, 'PATCH', { ...officeInput, title: 'Сохранённая версия', expectedRevision: 1 }, a.accessToken)
      assert.equal(updatedOffice.status, 200)
      assert.equal(documentSchema.parse(await updatedOffice.json()).revision, 2)
      assert.equal((await api(path, 'PATCH', { ...officeInput, expectedRevision: 1 }, a.accessToken)).status, 409)
      const reread = documentSchema.parse(await (await api(path, 'GET', undefined, a.accessToken)).json())
      assert.deepEqual(reread.content, officeInput.content)
      const copy = documentSchema.parse(await (await api(path + '/duplicate', 'POST', {}, a.accessToken)).json())
      assert.equal(copy.kind, kind); assert.deepEqual(copy.content, officeInput.content)
      assert.equal((await api(path + '/exports', 'POST', { format, revision: 1 }, a.accessToken)).status, 409)
      const exported = await api(path + '/exports', 'POST', { format, revision: 2 }, a.accessToken)
      assert.equal(exported.status, 200); assert.equal(exported.headers.get('x-document-revision'), '2')
      assert.match(exported.headers.get('content-disposition')!, new RegExp(`\\.${format}`))
      assert.equal(Buffer.from(await exported.arrayBuffer()).subarray(0, 2).toString(), 'PK')
      assert.equal((await api(path + '/exports', 'POST', { format: kind === 'text' ? 'xlsx' : 'docx', revision: 2 }, a.accessToken)).status, 422)
      if (kind !== 'text') assert.equal((await api(path, 'PATCH', { ...officeInput, content: emptyContent(), expectedRevision: 2 }, a.accessToken)).status, 422)
      assert.equal((await api(path, 'DELETE', undefined, a.accessToken)).status, 204)
    }
    const refreshed = await api('/auth/refresh', 'POST', {}, undefined, cookieA)
    assert.equal(refreshed.status, 200)
    const rotatedCookie = cookieOf(refreshed)
    assert.notEqual(rotatedCookie, cookieA)
    assert.equal((await api('/auth/refresh', 'POST', {}, undefined, cookieA)).status, 401)
    assert.equal((await api('/auth/refresh', 'POST', {}, undefined, rotatedCookie)).status, 401)
    const login = await api('/auth/login', 'POST', account)
    assert.equal(login.status, 200)
    const logoutCookie = cookieOf(login)
    const loggedIn = sessionSchema.parse(await login.json())
    assert.equal((await api('/auth/logout', 'POST', {}, undefined, logoutCookie)).status, 204)
    assert.equal((await api('/auth/refresh', 'POST', {}, undefined, logoutCookie)).status, 401)
    // Stateless access JWT remains valid until its documented 10-minute expiry.
    assert.equal((await api('/auth/me', 'GET', undefined, loggedIn.accessToken)).status, 200)
  } finally {
    await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections() })
    try { await db.client.user.deleteMany({ where: { id: { in: users } } }) } finally { await db.close() }
  }
})
