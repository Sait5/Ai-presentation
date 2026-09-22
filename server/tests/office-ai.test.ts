import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import JSZip from 'jszip'
import { parseEnvironment } from '../src/config.js'
import { aiService } from '../src/services/ai-service.js'
import { emptyContent, defaultTextDesign, type SavedDocument } from '../src/contracts/document.js'
import { generateDocx } from '../src/generators/docx.js'
import { calculateWorksheet } from '../src/contracts/formulas.js'
const config = parseEnvironment({ DATABASE_URL: 'postgresql://localhost/test', JWT_SECRET: 'x'.repeat(64), GEMINI_API_KEY: 'test-only' })
const mock = (value: unknown) => aiService(config, async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }))

test('AI returns editable text blocks with unique IDs and rejects invalid outlines', async () => {
  const input = { kind: 'text' as const, topic: 'План школьного кружка', language: 'ru' as const }
  const result = await mock({ sections: [{ heading: 'Цель', paragraphs: ['Изучить программирование.', 'Создать свой проект.'] }] }).office(input)
  assert.equal(result.kind, 'text')
  if (result.kind !== 'text') return
  assert.equal(result.blocks.length, 3)
  assert.equal(new Set(result.blocks.map(b => b.id)).size, 3)
  await assert.rejects(mock({ sections: [] }).office(input), { code: 'AI_INVALID_DOCUMENT' })
})

test('AI spreadsheet numbers and formulas remain editable and recalculate', async () => {
  const input = { kind: 'spreadsheet' as const, topic: 'Бюджет проекта', language: 'ru' as const }
  const result = await mock({ sheets: [{ name: 'Бюджет', columns: ['Количество','Цена','Итого'], rows: [{ cells: ['2', '10', '=A2*B2'] }] }] }).office(input)
  assert.equal(result.kind, 'spreadsheet')
  if (result.kind !== 'spreadsheet') return
  assert.equal(calculateWorksheet(result.worksheets[0]!)[1]![2], 20)
  await assert.rejects(mock({ sheets: [{ name: 'Bad', columns: ['A','B'], rows: [{ cells: ['1'] }] }] }).office(input), { code: 'AI_INVALID_DOCUMENT' })
})

test('Word exports chosen font, editable text and an embedded user image', async () => {
  const content = emptyContent()
  content.design = { ...defaultTextDesign, font: 'Georgia', size: 16 }
  content.blocks = [{ id: randomUUID(), type: 'paragraph', text: 'Редактируемый текст' }, { id: randomUUID(), type: 'image', assetId: randomUUID(), alt: 'Моя картинка', width: 60, align: 'center' }]
  const doc: SavedDocument = { id: randomUUID(), title: 'Word with image', kind: 'text', purpose: 'report', content, revision: 1, createdAt: '', updatedAt: '' }
  const png = await sharp({ create: { width: 100, height: 60, channels: 3, background: '#448866' } }).png().toBuffer()
  const zip = await JSZip.loadAsync(await generateDocx(doc, async () => png))
  assert.match(await zip.file('word/styles.xml')!.async('string'), /Georgia/)
  assert.match(await zip.file('word/document.xml')!.async('string'), /Редактируемый текст/)
  assert.equal(Object.keys(zip.files).filter(name => name.startsWith('word/media/') && name.endsWith('.png')).length, 1)
})
