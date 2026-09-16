import { createRequire } from 'node:module'
import sharp from 'sharp'
import type { SavedDocument } from '../contracts/document.js'
import { blockRect, contentRect, defaultDesign, fittedTextSize, imageRect, themes, type Rect } from '../contracts/design.js'
import { HttpError } from '../middleware/errors.js'
const pptxgen = createRequire(import.meta.url)('pptxgenjs') as typeof import('pptxgenjs').default
const inches = (r: Rect) => ({ x: r.x * 13.333333 / 100, y: r.y * 7.5 / 100, w: r.w * 13.333333 / 100, h: r.h * 7.5 / 100 })

export async function generatePptx(document: SavedDocument, getImage?: (id: string) => Promise<Buffer>): Promise<Buffer> {
  if (document.content.kind !== 'presentation') throw new HttpError(422, 'UNSUPPORTED_FORMAT', 'PPTX доступен для презентаций')
  const deck = new pptxgen()
  deck.layout = 'LAYOUT_WIDE'; deck.author = 'Forma'; deck.subject = document.title; deck.title = document.title
  const lang = document.content.metadata.language === 'ru' ? 'ru-RU' : 'en-US'
  const palette = themes[document.content.metadata.theme]
  const overall = document.content.design ?? defaultDesign
  deck.theme = { headFontFace: overall.font, bodyFontFace: overall.font }
  const assets = new Map<string, Buffer>()
  for (const [index, source] of document.content.slides.entries()) {
    const slide = deck.addSlide()
    const cover = source.layout === 'title'
    const design = source.design ?? overall
    const background = source.image?.placement === 'background'
    slide.background = { color: cover ? palette.cover : palette.background }
    const color = background ? 'FFFFFF' : cover ? palette.coverText : palette.text
    if (source.image) {
      if (!getImage) throw new HttpError(422, 'IMAGE_NOT_FOUND', 'Не удалось получить изображение для экспорта')
      let bytes = assets.get(source.image.assetId)
      if (!bytes) { bytes = await getImage(source.image.assetId); assets.set(source.image.assetId, bytes) }
      const rect = inches(imageRect(source.image))
      // Only normalized raster data reaches PptxGenJS; never arbitrary URLs or SVG.
      const raster = await sharp(bytes, { limitInputPixels: 24_000_000 }).resize(Math.round(rect.w * 120), Math.round(rect.h * 120), { fit: source.image.fit, background: '#00000000' }).png().toBuffer()
      slide.addImage({ data: 'image/png;base64,' + raster.toString('base64'), ...rect, transparency: Math.round((1 - source.image.opacity) * 100), altText: source.image.alt })
      if (background) slide.addShape(deck.ShapeType.rect, { x: 0, y: 0, w: 13.333333, h: 7.5, line: { transparency: 100 }, fill: { color: '000000', transparency: 40 } })
    }
    slide.addText(source.title, { ...inches({ x: 5, y: 6, w: 90, h: 17 }), fontFace: design.font, fontSize: fittedTextSize([source.title], { x: 5, y: 6, w: 90, h: 17 }, design.titleSize).size, bold: true, color, margin: 0, fit: 'shrink', valign: 'middle', align: design.align, lang })
    source.blocks.forEach((item, b) => {
      const rect = blockRect(contentRect(source.image), b, source.blocks.length, source.layout === 'twoColumns')
      const { x, y, w, h } = inches(rect)
      if (item.type === 'table') {
        const rows = [item.columns, ...item.rows]
        const widthPoints = w * 72 / item.columns.length - 12
        const requiredHeight = rows.reduce((total, row) => total + Math.max(...row.map(text => text.split('\n').reduce((lines, line) => lines + Math.max(1, Math.ceil(line.length * 16 * 0.7 / widthPoints)), 0))) * 20 + 12, 0)
        if (requiredHeight > h * 72) throw new HttpError(422, 'SLIDE_OVERFLOW', `Слайд ${index + 1}: таблица не помещается. Разделите её на несколько слайдов.`)
        slide.addTable([item.columns.map(text => ({ text, options: { bold: true, fill: { color: palette.accent }, color: palette.background } })), ...item.rows.map(row => row.map(text => ({ text })))], { x, y, w, colW: Array(item.columns.length).fill(w / item.columns.length), fontFace: design.font, fontSize: 16, color: palette.text, fill: { color: palette.background }, margin: 6, border: { type: 'solid', pt: 0.5, color: 'CDD8D1' }, autoPage: false, valign: 'middle' })
      } else {
        const text = item.type === 'paragraph' ? item.text : item.items.map(text => ({ text, options: { bullet: { indent: 20 }, breakLine: true } }))
        const fitted = fittedTextSize(item.type === 'paragraph' ? [item.text] : item.items, rect, design.bodySize)
        if (fitted.overflow) throw new HttpError(422, 'SLIDE_OVERFLOW', `Слайд ${index + 1}: слишком много текста для выбранного положения картинки. Сократите текст или измените макет.`)
        slide.addText(text, { x, y, w, h, fontFace: design.font, fontSize: fitted.size, bold: design.bold, italic: design.italic, align: design.align, color, margin: 0, valign: 'top', fit: 'shrink', paraSpaceAfter: 10, breakLine: false, lang })
      }
    })
    slide.addText(String(index + 1), { x: 11.9, y: 7.05, w: 0.75, h: 0.2, fontSize: 10, color, align: 'right', margin: 0 })
  }
  return await deck.write({ outputType: 'nodebuffer', compression: true }) as Buffer
}
