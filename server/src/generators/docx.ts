import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, PageBreak, LevelFormat, AlignmentType, Footer, PageNumber, BorderStyle, ImageRun } from 'docx'
import sharp from 'sharp'
import { defaultTextDesign } from '../contracts/document.js'
import type { SavedDocument, TextBlock } from '../contracts/document.js'
import { HttpError } from '../middleware/errors.js'

export async function generateDocx(document: SavedDocument, getImage?: (id: string) => Promise<Buffer>): Promise<Buffer> {
  if (document.content.kind !== 'text') throw new HttpError(422, 'UNSUPPORTED_FORMAT', 'DOCX доступен для текстовых документов')
  const design = document.content.design ?? defaultTextDesign
  const assets = new Map<string, { bytes: Buffer; width: number; height: number }>()
  for (const block of document.content.blocks) if (block.type === 'image') {
    if (!getImage) throw new HttpError(422, 'IMAGE_NOT_FOUND', 'Изображение недоступно для экспорта')
    const bytes = await getImage(block.assetId), meta = await sharp(bytes).metadata()
    // Fit portrait images within the printable A4 area while keeping aspect ratio.
    const width = Math.min(600 * block.width / 100, 830 * (meta.width ?? 1) / (meta.height ?? 1))
    assets.set(block.id, { bytes, width, height: width * (meta.height ?? 1) / (meta.width ?? 1) })
  }
  const numbering: { reference: string; levels: { level: number; format: typeof LevelFormat.DECIMAL; text: string; alignment: typeof AlignmentType.START }[] }[] = []
  const paragraph = (text: string) => new Paragraph({ children: text.split('\n').map((line, i) => new TextRun({ text: line, break: i ? 1 : 0 })), spacing: { after: 160 } })
  function blocks(block: TextBlock): (Paragraph | Table)[] {
    switch (block.type) {
      case 'heading': return [new Paragraph({ text: block.text, heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][block.level - 1]!, keepNext: true })]
      case 'paragraph': return [paragraph(block.text)]
      case 'pageBreak': return [new Paragraph({ children: [new PageBreak()] })]
      case 'image': { const image = assets.get(block.id)!; return [new Paragraph({ alignment: block.align, children: [new ImageRun({ type: 'png', data: image.bytes, transformation: { width: image.width, height: image.height }, altText: { title: block.alt, description: block.alt, name: 'Image' } })] })] }
      case 'list': {
        const reference = `list-${block.id}`
        if (block.ordered) numbering.push({ reference, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START }] })
        return block.items.map(text => new Paragraph({ text, spacing: { after: 100 }, ...(block.ordered ? { numbering: { reference, level: 0 } } : { bullet: { level: 0 } }) }))
      }
      case 'table': {
        const border = { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' }
        return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border }, rows: [block.columns, ...block.rows].map((row, index) => new TableRow({ tableHeader: index === 0, children: row.map(value => new TableCell({ width: { size: 100 / row.length, type: WidthType.PERCENTAGE }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, shading: { fill: index === 0 ? 'E7EDF0' : 'FFFFFF' }, children: [paragraph(value)] })) })) }), paragraph('')]
      }
    }
  }
  const children = [new Paragraph({ text: document.title, heading: HeadingLevel.TITLE }), ...document.content.blocks.flatMap(blocks)]
  const file = new Document({ creator: 'Forma', title: document.title, styles: { default: { document: { run: { font: design.font, size: design.size * 2, color: design.color.slice(1) }, paragraph: { alignment: design.align === 'justify' ? AlignmentType.JUSTIFIED : design.align, spacing: { line: Math.round(design.lineHeight * 240), after: 160 } } } }, paragraphStyles: [
    { id: 'Title', name: 'Title', basedOn: 'Normal', run: { size: 48, color: '000000', bold: true }, paragraph: { spacing: { after: 280 } } },
    ...['Heading1', 'Heading2', 'Heading3'].map((id, i) => ({ id, name: `heading ${i + 1}`, basedOn: 'Normal', run: { size: 34 - i * 4, color: '000000', bold: true }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true } })),
  ] }, numbering: { config: numbering }, sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1247, right: 1077, bottom: 1304, left: 1077 } } }, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: 18 })] })] }) }, children }] })
  return Packer.toBuffer(file)
}
