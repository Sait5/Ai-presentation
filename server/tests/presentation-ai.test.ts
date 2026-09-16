import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import JSZip from 'jszip'
import { parseEnvironment } from '../src/config.js'
import { aiService } from '../src/services/ai-service.js'
import { normalizeImage } from '../src/services/image-service.js'
import { defaultDesign, imageRect, newSlideImage, placements, slideImageSchema } from '../src/contracts/design.js'
import { presentationContentSchema } from '../src/contracts/office.js'
import { generatePptx } from '../src/generators/pptx.js'
import type { PresentationRequest } from '../src/contracts/ai.js'

const config = parseEnvironment({ DATABASE_URL: 'postgresql://localhost/test', JWT_SECRET: 'test-secret'.repeat(8), OPENAI_API_KEY: 'test-only-secret', AI_PROVIDER: 'openai' })
const input: PresentationRequest = { topic: 'План запуска продукта для команды', count: 3, language: 'ru', tone: 'Деловой', imageStyle: 'Акварель', theme: 'warm', design: defaultDesign }
const slides = Array.from({ length: 3 }, (_, i) => ({ title: `Этап ${i + 1}`, bullets: ['Согласовать план', 'Проверить результат'], imagePrompt: 'Команда обсуждает проект' }))
const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })
test('AI sends a strict schema and style brief; returns validated editable slides with unique IDs', async () => {
  let calls = 0
  const ai = aiService(config, async (url, options) => {
    calls++
    assert.equal(url, 'https://api.openai.com/v1/responses')
    const body = JSON.parse(String(options?.body))
    assert.equal(body.store, false)
    assert.equal(body.text.format.strict, true)
    assert.equal(JSON.parse(body.input).imageStyle, 'Акварель')
    assert.equal(body.text.format.schema.additionalProperties, false)
    return response({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ slides }) }] }] })
  })
  const content = await ai.presentation(input)
  assert.equal(calls, 1); assert.equal(content.slides.length, 3)
  assert.equal(content.metadata.theme, 'warm'); assert.deepEqual(content.design, defaultDesign)
  assert.equal(new Set(content.slides.map(s => s.id)).size, 3)
  assert.equal(presentationContentSchema.safeParse(content).success, true)
})
test('AI handles disabled keys, upstream failures, refusal and incomplete output without leaking credentials', async () => {
  await assert.rejects(aiService({ ...config, OPENAI_API_KEY: '' }, async () => { throw new Error('must not call') }).presentation(input), { code: 'AI_NOT_CONFIGURED' })
  for (const status of [401, 429, 500]) {
    await assert.rejects(aiService(config, async () => new Response('test-only-secret', { status })).presentation(input), err => err instanceof Error && !err.message.includes('test-only-secret'))
  }
  for (const result of [{ status: 'incomplete', output: [] }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"slides":[]}' }] }] }]) {
    await assert.rejects(aiService(config, async () => response(result)).presentation(input))
  }
})
test('image generation requests one raster image with palette and chosen style', async () => {
  const ai = aiService(config, async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/images/generations')
    const body = JSON.parse(String(options?.body)); assert.equal(body.n, 1); assert.equal(body.output_format, 'png')
    assert.match(body.prompt, /Акварель/); assert.match(body.prompt, /AA4F29/)
    return response({ data: [{ b64_json: Buffer.from('fixture').toString('base64') }] })
  })
  assert.equal((await ai.image({ prompt: 'Лес на рассвете', style: 'Акварель', theme: 'warm' })).toString(), 'fixture')
})
test('uploads reject SVG, corrupt and oversized bytes; normalize raster and strip metadata', async () => {
  for (const value of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), Buffer.from('invalid'), Buffer.alloc(8 * 1024 * 1024 + 1)]) await assert.rejects(normalizeImage(value))
  const input = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#aaccee' } }).jpeg().toBuffer()
  const output = await normalizeImage(input)
  assert.equal(output.width, 1600); assert.equal(output.height, 800)
  assert.equal((await sharp(output.bytes).metadata()).format, 'png')
  assert.equal((await sharp(output.bytes).metadata()).exif, undefined)
})
test('all image placements and typography survive native PowerPoint export', async () => {
  const assetId = randomUUID()
  const png = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#d69d56' } }).png().toBuffer()
  const content = presentationContentSchema.parse({ schemaVersion: 1, kind: 'presentation', metadata: { language: 'ru', theme: 'midnight' }, design: { ...defaultDesign, font: 'Georgia', bold: true, italic: true, align: 'center' }, slides: placements.map(placement => ({ id: randomUUID(), layout: 'content', title: `Изображение: ${placement}`, image: { ...newSlideImage(assetId, 'Тестовое изображение'), placement }, blocks: [{ id: randomUUID(), type: 'paragraph', text: 'Редактируемый текст и изображение' }] })) })
  let loads = 0
  const bytes = await generatePptx({ id: randomUUID(), title: 'Стили и изображения', purpose: 'report', kind: 'presentation', content, revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, async () => { loads++; return png })
  assert.equal(loads, 1)
  const zip = await JSZip.loadAsync(bytes)
  for (let i = 1; i <= placements.length; i++) {
    const xml = await zip.file(`ppt/slides/slide${i}.xml`)!.async('string')
    assert.match(xml, /<p:pic>/); assert.match(xml, /Georgia/); assert.match(xml, /Редактируемый текст/); assert.match(xml, /algn="ctr"/)
  }
  assert.ok(Object.keys(zip.files).some(name => name.startsWith('ppt/media/') && name.endsWith('.png')))
  assert.equal(slideImageSchema.safeParse({ ...newSlideImage(assetId), x: 80, w: 40 }).success, false)
  assert.deepEqual(imageRect({ ...newSlideImage(assetId), placement: 'background' }), { x: 0, y: 0, w: 100, h: 100 })
  if (process.env.OFFICE_QA_DIR) { await mkdir(process.env.OFFICE_QA_DIR, { recursive: true }); await writeFile(join(process.env.OFFICE_QA_DIR, 'styled-slides.pptx'), bytes); await writeFile(join(process.env.OFFICE_QA_DIR, 'test-image.png'), png) }
})
