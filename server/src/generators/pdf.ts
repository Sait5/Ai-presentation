import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import type { SavedDocument, TextBlock } from '../contracts/document.js'
import { HttpError } from '../middleware/errors.js'

const require = createRequire(import.meta.url)
const escape = (text: string) => text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
function renderBlock(block: TextBlock): string {
  switch (block.type) {
    case 'heading': return `<h${block.level + 1}>${escape(block.text)}</h${block.level + 1}>`
    case 'paragraph': return `<p>${escape(block.text)}</p>`
    case 'list': { const tag = block.ordered ? 'ol' : 'ul'; return `<${tag}>${block.items.map((item) => `<li>${escape(item)}</li>`).join('')}</${tag}>` }
    case 'table': return `<table><thead><tr>${block.columns.map((column) => `<th>${escape(column)}</th>`).join('')}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    case 'pageBreak': return '<div class="page-break"></div>'
  }
}
async function fontCss() {
  const rules: string[] = []
  for (const weight of [400, 600]) {
    for (const [subset, range] of [['cyrillic', 'U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116'], ['latin', 'U+0000-00FF,U+2000-206F,U+20AC,U+2122']]) {
      const bytes = await readFile(require.resolve(`@fontsource/noto-sans/files/noto-sans-${subset}-${weight}-normal.woff2`))
      rules.push(`@font-face{font-family:Document;font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2');unicode-range:${range}}`)
    }
  }
  return rules.join('')
}
let busy = false
export async function generatePdf(document: SavedDocument): Promise<Buffer> {
  if (document.content.kind !== 'text') throw new HttpError(422, 'UNSUPPORTED_FORMAT', 'PDF доступен для текстовых документов')
  if (busy) throw new HttpError(503, 'EXPORT_BUSY', 'Экспорт занят. Повторите через несколько секунд.')
  busy = true
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    browser = await chromium.launch({ headless: true, timeout: 15000 })
    deadline = setTimeout(() => { void browser?.close() }, 25000)
    const page = await browser.newPage({ javaScriptEnabled: false })
    await page.route('**/*', (route) => route.abort())
    page.setDefaultTimeout(15000)
    await page.setContent(`<!doctype html><html lang="${document.content.metadata.language}"><head><meta charset="UTF-8"><style>
      ${await fontCss()}
      @page{size:A4;margin:22mm 19mm 23mm}
      *{box-sizing:border-box}body{font:11pt/1.6 Document,sans-serif;color:#22332e;margin:0;overflow-wrap:anywhere}
      h1{font-size:26pt;line-height:1.2;margin:0 0 22pt;color:#163e33;font-weight:600}
      h2,h3,h4{font-weight:600;line-height:1.3;break-after:avoid;margin:20pt 0 9pt}
      h2{font-size:18pt}h3{font-size:14pt}h4{font-size:12pt}p{white-space:pre-wrap;margin:0 0 12pt;orphans:3;widows:3}
      ul,ol{padding-left:20pt}li{white-space:pre-wrap;margin:5pt 0;orphans:3;widows:3}
      table{border-collapse:collapse;table-layout:fixed;width:100%;margin:15pt 0;font-size:9pt}
      th,td{border:1px solid #cdd8d1;text-align:left;padding:7pt;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}
      th{background:#edf3ef;font-weight:600}thead{display:table-header-group}tr{break-inside:avoid}
      .page-break{break-before:page}.page-break:first-child{break-before:auto}
    </style></head><body><h1>${escape(document.title)}</h1>${document.content.blocks.map(renderBlock).join('')}</body></html>`, { waitUntil: 'load' })
    await page.evaluate('document.fonts.ready')
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true,
      displayHeaderFooter: true, headerTemplate: '<div></div>',
      footerTemplate: `<div style="width:100%;text-align:center;font:9px Arial;color:#627069">AI Documents · revision ${document.revision} · <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    })
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(503, 'EXPORT_FAILED', 'Не удалось создать PDF. Проверьте установку Chromium на сервере.')
  } finally {
    clearTimeout(deadline)
    try { await browser?.close() } finally { busy = false }
  }
}
