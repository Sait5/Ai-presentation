import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseEnvironment } from '../src/config.js'
import { aiService } from '../src/services/ai-service.js'
import { defaultDesign } from '../src/contracts/design.js'
import type { PresentationRequest } from '../src/contracts/ai.js'

const config = parseEnvironment({ DATABASE_URL: 'postgresql://localhost/test', JWT_SECRET: 'test-secret'.repeat(8), GEMINI_API_KEY: 'test-gemini-secret', OPENAI_API_KEY: 'must-not-be-used' })
const input: PresentationRequest = { topic: 'План команды на неделю', count: 3, language: 'ru', tone: 'Деловой', imageStyle: 'Акварель', theme: 'warm', design: defaultDesign }
const slides = Array.from({ length: 3 }, (_, i) => ({ title: `Этап ${i + 1}`, bullets: ['Согласовать план'], imagePrompt: 'Команда в офисе' }))
test('Gemini uses only its selected endpoint and key; validates output and preserves design', async () => {
  const service = aiService(config, async (url, options) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent')
    assert.equal(new Headers(options?.headers).get('x-goog-api-key'), 'test-gemini-secret')
    assert.equal(new Headers(options?.headers).get('Authorization'), null)
    const body = JSON.parse(String(options?.body))
    assert.equal(body.generationConfig.responseMimeType, 'application/json')
    assert.equal(body.generationConfig.responseJsonSchema.additionalProperties, false)
    assert.equal(body.generationConfig.candidateCount, 1)
    assert.equal(JSON.parse(body.contents[0].parts[0].text).tone, 'Деловой')
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'private reasoning' }, { text: JSON.stringify({ slides }) }] } }] })
  })
  assert.deepEqual(service.status, { enabled: true, provider: 'gemini', imageGeneration: false })
  const result = await service.presentation(input)
  assert.equal(result.slides.length, 3); assert.equal(result.metadata.theme, 'warm'); assert.deepEqual(result.design, defaultDesign)
  assert.equal(result.slides[0]!.imageStyle, 'Акварель')
})
test('Gemini blocks image requests and never falls back to paid OpenAI', async () => {
  let calls = 0
  const service = aiService(config, async () => { calls++; return new Response('upstream secret', { status: 429 }) })
  await assert.rejects(service.image({ prompt: 'Картинка', style: '3D', theme: 'business' }), { code: 'IMAGE_GENERATION_DISABLED' })
  assert.equal(calls, 0)
  await assert.rejects(service.presentation(input), { code: 'AI_LIMIT' })
  assert.equal(calls, 1)
  await assert.rejects(aiService({ ...config, GEMINI_API_KEY: '' }, async () => { calls++; throw new Error('unexpected') }).presentation(input), { code: 'AI_NOT_CONFIGURED' })
  assert.equal(calls, 1)
})
test('Gemini refuses incomplete, blocked, malformed and excessive output', async () => {
  for (const result of [
    { promptFeedback: { blockReason: 'SAFETY' } },
    { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: JSON.stringify({ slides }) }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not JSON' }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ slides: [...slides, slides[0]] }) }] } }] },
  ]) await assert.rejects(aiService(config, async () => Response.json(result)).presentation(input))
})

test('Gemini reports temporary overload without retries or exposing upstream details', async () => {
  let calls = 0
  const service = aiService(config, async () => { calls++; return new Response('private upstream details', { status: 503 }) })
  await assert.rejects(service.presentation(input), { code: 'AI_BUSY', message: 'Gemini сейчас перегружен. Попробуйте позже. Автоматический повтор запроса не выполнялся.' })
  assert.equal(calls, 1)
})
test('provider config rejects unknown providers and unsafe model paths', () => {
  for (const values of [{ AI_PROVIDER: 'other' }, { GEMINI_MODEL: '../../other' }]) {
    assert.throws(() => parseEnvironment({ DATABASE_URL: 'postgresql://localhost/test', JWT_SECRET: 'x'.repeat(64), ...values }))
  }
})
