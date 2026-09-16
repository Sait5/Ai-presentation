import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import { contentSchema, documentSchema, emptyContent, newContent, type SavedDocument } from '../src/contracts/document.js'
import { calculateWorksheet } from '../src/contracts/formulas.js'
import { blankCell, blankWorksheet, type Cell } from '../src/contracts/office.js'
import { generateExport } from '../src/generators/export.js'

function document(content: SavedDocument['content']): SavedDocument { return { id: randomUUID(), title: 'План запуска проекта', kind: content.kind, purpose: 'projectPlan', content, revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }
const typed = (type: 'number' | 'formula' | 'text', value: number | string) => ({ ...blankCell(), type, value }) as Cell
async function qa(name: string, bytes: Buffer) { if (process.env.OFFICE_QA_DIR) { await mkdir(process.env.OFFICE_QA_DIR, { recursive: true }); await writeFile(join(process.env.OFFICE_QA_DIR, name), bytes) } }

test('office contracts reject duplicate sheet names, IDs, malformed rows and kind mismatch', () => {
  for (const kind of ['text', 'presentation', 'spreadsheet'] as const) assert.equal(contentSchema.safeParse(newContent(kind)).success, true)
  const content = newContent('spreadsheet'); assert.equal(content.kind, 'spreadsheet')
  if (content.kind !== 'spreadsheet') return
  content.worksheets.push(blankWorksheet('лист 1'))
  assert.equal(contentSchema.safeParse(content).success, false)
  content.worksheets.pop(); content.worksheets[0]!.rows[0]!.cells.pop()
  assert.equal(contentSchema.safeParse(content).success, false)
  assert.equal(documentSchema.safeParse({ ...document(emptyContent()), kind: 'spreadsheet' }).success, false)
  const slide = newContent('presentation')
  if (slide.kind === 'presentation') { slide.slides.push(slide.slides[0]!); assert.equal(contentSchema.safeParse(slide).success, false) }
})

test('spreadsheet formulas compute and recalculate, handle errors and reject external code', () => {
  const sheet = blankWorksheet('Расчёты')
  sheet.rows[0]!.cells = [typed('number', 10), typed('number', 20), typed('formula', '=SUM(A1:B1)'), typed('formula', '=C1*2+AVERAGE(A1:B1)')]
  assert.deepEqual(calculateWorksheet(sheet)[0], [10, 20, 30, 75])
  sheet.rows[0]!.cells[0] = typed('number', 30)
  assert.deepEqual(calculateWorksheet(sheet)[0], [30, 20, 50, 125])
  for (const [formula, expected] of [['=1/0', '#DIV/0!'], ['=Z999', '#REF!'], ['=A1', '#CYCLE!'], ['=WEBSERVICE("https://example.com")', '#NAME?'], ['=1+2*3', 7], ['=-(2+3)/2', -2.5], ['=SUM(A2:D2)', 0], ['=AVERAGE(A2:D2)', '#DIV/0!']] as const) {
    sheet.rows[0]!.cells[0] = typed('formula', formula)
    assert.equal(calculateWorksheet(sheet)[0]![0], expected, formula)
  }
  sheet.rows[0]!.cells[0] = typed('text', '=1+2')
  assert.equal(calculateWorksheet(sheet)[0]![0], '=1+2')
})

test('DOCX contains editable paragraphs, numbering, tables, title and page breaks; text exports preserve content', async () => {
  const content = emptyContent()
  content.blocks = [
    { id: randomUUID(), type: 'heading', level: 1, text: 'Этапы работы' },
    { id: randomUUID(), type: 'paragraph', text: 'Исследование и разработка.\nТекст <script> остаётся текстом.' },
    { id: randomUUID(), type: 'list', ordered: true, items: ['Исследование', 'Запуск'] },
    { id: randomUUID(), type: 'table', columns: ['Этап', 'Стоимость'], rows: [['Исследование', '12 000 ₽'], ['Разработка', '35 000 ₽']] },
    { id: randomUUID(), type: 'pageBreak' }, { id: randomUUID(), type: 'paragraph', text: 'Условия сотрудничества' },
  ]
  const doc = document(content)
  const bytes = await generateExport(doc, 'docx')
  const zip = await JSZip.loadAsync(bytes)
  const xml = await zip.file('word/document.xml')!.async('string')
  for (const pattern of [/Этапы работы/, /w:tbl/, /w:tblHeader/, /w:numPr/, /w:type="page"/, /&lt;script&gt;/, /w:val="Title"/]) assert.match(xml, pattern)
  assert.ok(zip.file('word/numbering.xml'))
  await qa('word.docx', bytes)
  assert.match((await generateExport(doc, 'txt')).toString(), /Исследование\t12 000 ₽/)
  assert.match((await generateExport(doc, 'markdown')).toString(), /\| --- \| --- \|/)
  await assert.rejects(generateExport(doc, 'xlsx'), /не подходит/)
})

test('PPTX exports native text and table objects with one output slide per source slide', async () => {
  const content = newContent('presentation'); if (content.kind !== 'presentation') throw new Error('fixture')
  content.slides[0]!.title = 'План запуска проекта'
  content.slides[0]!.blocks = [{ id: randomUUID(), type: 'paragraph', text: 'Пилотный запуск в октябре' }]
  content.slides.push({ id: randomUUID(), layout: 'twoColumns', title: 'Задачи и сроки', blocks: [
    { id: randomUUID(), type: 'list', items: ['Подготовить материалы', 'Проверить основной сценарий'] },
    { id: randomUUID(), type: 'table', columns: ['Этап', 'Дни'], rows: [['Подготовка', '5'], ['Проверка', '2']] },
  ] })
  const bytes = await generateExport(document(content), 'pptx')
  const zip = await JSZip.loadAsync(bytes)
  assert.equal(Object.keys(zip.files).filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path)).length, 2)
  const xml = await zip.file('ppt/slides/slide2.xml')!.async('string')
  assert.match(xml, /Задачи и сроки/); assert.match(xml, /<a:tbl>/); assert.match(xml, /<p:sp>/)
  await qa('slides.pptx', bytes)
  content.slides[1]!.blocks = [{ id: randomUUID(), type: 'table', columns: ['А', 'Б', 'В', 'Г'], rows: Array.from({ length: 6 }, () => Array(4).fill('Очень длинная ячейка '.repeat(4))) }]
  await assert.rejects(generateExport(document(content), 'pptx'), /не помещается/)
})

test('XLSX round trip preserves typed values, formula cache, styles, multiple sheets and literal formula text', async () => {
  const content = newContent('spreadsheet'); if (content.kind !== 'spreadsheet') throw new Error('fixture')
  const sheet = content.worksheets[0]!
  sheet.name = 'Расчёты'
  sheet.rows[0]!.cells = ['Количество', 'Цена', 'Стоимость', 'Примечание'].map(value => typed('text', value))
  sheet.rows[1]!.cells = [typed('number', 3), { ...typed('number', 12000), format: 'currency' }, typed('formula', '=A2*B2'), typed('text', '=1+2')]
  sheet.rows[2]!.cells[0] = { ...blankCell(), type: 'date', value: '2026-09-15' }
  sheet.rows[2]!.cells[1] = { ...blankCell(), type: 'boolean', value: true }
  content.worksheets.push(blankWorksheet('Данные'))
  const bytes = await generateExport(document(content), 'xlsx')
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0])
  assert.equal(wb.worksheets.length, 2)
  const reopened = wb.getWorksheet('Расчёты')!
  assert.deepEqual(reopened.getCell('C2').value, { formula: 'A2*B2', result: 36000 })
  assert.equal(reopened.getCell('D2').value, '=1+2')
  assert.equal(reopened.getCell('B3').value, true)
  assert.ok(reopened.getCell('A3').value instanceof Date)
  assert.match(reopened.getCell('B2').numFmt, /₽/)
  assert.equal(reopened.getCell('A1').font.bold, true)
  await qa('workbook.xlsx', bytes)
  sheet.rows[1]!.cells[0] = typed('number', 4)
  const next = new ExcelJS.Workbook(); await next.xlsx.load(await generateExport(document(content), 'xlsx') as unknown as Parameters<typeof next.xlsx.load>[0])
  assert.equal(next.getWorksheet('Расчёты')!.getCell('C2').result, 48000)
  sheet.rows[1]!.cells[2] = typed('formula', '=1/0')
  await assert.rejects(generateExport(document(content), 'xlsx'), /#DIV\/0!/) 
})
