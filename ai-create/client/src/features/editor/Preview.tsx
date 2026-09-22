import type { SavedDocument } from '@contracts/document'
import { TextImage } from './TextImage'

export function Preview({ document }: { document: SavedDocument }) {
  if (document.content.kind !== 'text') return null
  const design = document.content.design
  return <article className="document-preview" style={design ? { fontFamily: design.font, fontSize: `${design.size}pt`, lineHeight: design.lineHeight, color: design.color, textAlign: design.align } : undefined}><h1>{document.title}</h1>{document.content.blocks.map((block) => {
    switch (block.type) {
      case 'heading': { const Tag = `h${block.level + 1}` as 'h2' | 'h3' | 'h4'; return <Tag key={block.id}>{block.text}</Tag> }
      case 'paragraph': return <p key={block.id}>{block.text}</p>
      case 'list': { const Tag = block.ordered ? 'ol' : 'ul'; return <Tag key={block.id}>{block.items.map((item, index) => <li key={index}>{item}</li>)}</Tag> }
      case 'table': return <div className="table-scroll" key={block.id}><table><thead><tr>{block.columns.map((value, index) => <th key={index}>{value}</th>)}</tr></thead><tbody>{block.rows.map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column}>{value}</td>)}</tr>)}</tbody></table></div>
      case 'pageBreak': return <div className="page-break-label" key={block.id}>Разрыв страницы</div>
      case 'image': return <TextImage key={block.id} block={block} />
    }
  })}</article>
}
