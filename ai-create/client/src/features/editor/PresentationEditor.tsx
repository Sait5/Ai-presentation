import { useState } from 'react'
import type { PresentationContent, Slide, SlideBlock } from '@contracts/office'
import { SlideView } from './SlideView'
import { PresentationDesign } from './PresentationDesign'
import { PresentationAI } from './PresentationAI'
import { SlideImages } from './SlideImages'

export function PresentationEditor({ content, update, preview }: { content: PresentationContent; update: (content: PresentationContent) => void; preview: boolean }) {
  const [selected, setSelected] = useState(content.slides[0]!.id)
  const [imageBusy, setImageBusy] = useState(false)
  const slide = content.slides.find(item => item.id === selected) ?? content.slides[0]!
  const index = content.slides.indexOf(slide)
  const change = (next: Slide) => update({ ...content, slides: content.slides.map(item => item.id === slide.id ? next : item) })
  function add() { const next: Slide = { id: crypto.randomUUID(), title: 'Новый слайд', layout: 'content', blocks: [] }; update({ ...content, slides: [...content.slides, next] }); setSelected(next.id) }
  function move(offset: number) { const slides = [...content.slides]; slides.splice(index, 1); slides.splice(index + offset, 0, slide); update({ ...content, slides }) }
  function addBlock(type: SlideBlock['type']) {
    const id = crypto.randomUUID()
    const block: SlideBlock = type === 'paragraph' ? { id, type, text: '' } : type === 'list' ? { id, type, items: [''] } : { id, type, columns: ['Показатель', 'Значение'], rows: [['', '']] }
    change({ ...slide, blocks: [...slide.blocks, block] })
  }
  const changeBlock = (block: SlideBlock) => change({ ...slide, blocks: slide.blocks.map(item => item.id === block.id ? block : item) })
  return <div className="presentation-editor"><fieldset className="slide-navigation" disabled={imageBusy}><nav className="office-tabs" aria-label="Слайды">{content.slides.map((item, i) => <button key={item.id} className={slide.id === item.id ? 'selected' : ''} onClick={() => setSelected(item.id)}>{i + 1}. {item.title || 'Слайд'}</button>)}{!preview && <button disabled={content.slides.length >= 40} onClick={add}>＋ Слайд</button>}</nav></fieldset>
    <div hidden={preview}><fieldset className="slide-navigation" disabled={imageBusy}><PresentationAI content={content} update={update} /></fieldset><PresentationDesign content={content} slide={slide} update={update} changeSlide={change} /></div>
    <SlideView key={`${slide.id}-${preview}-${imageBusy}`} slide={slide} content={content} change={!preview && !imageBusy ? change : undefined} />
    <div hidden={preview}><SlideImages key={slide.id} slide={slide} theme={content.metadata.theme} change={change} onBusy={setImageBusy} /></div>
    {!preview && <div className="office-properties"><div className="office-toolbar"><span>Слайд {index + 1} из {content.slides.length}</span><button disabled={index === 0} onClick={() => move(-1)}>← Раньше</button><button disabled={index === content.slides.length - 1} onClick={() => move(1)}>Позже →</button><button disabled={imageBusy || content.slides.length === 1} onClick={() => { if (window.confirm('Удалить этот слайд?')) update({ ...content, slides: content.slides.filter(item => item.id !== slide.id) }) }}>Удалить слайд</button></div>
      <label>Заголовок слайда<input value={slide.title} maxLength={120} onChange={e => change({ ...slide, title: e.target.value })} /></label>
      <label>Макет<select value={slide.layout} onChange={e => { const layout = e.target.value as Slide['layout']; if (layout === 'title' && slide.blocks.length > 1) return; change({ ...slide, layout }) }}><option value="title" disabled={slide.blocks.length > 1}>Титульный</option><option value="content">Содержимое</option><option value="twoColumns">Две колонки</option></select></label>
      {slide.blocks.map((block, b) => <section className="editable-block" key={block.id}><div className="block-tools"><span>Блок {b + 1}</span><button aria-label={`Удалить блок слайда ${b + 1}`} onClick={() => change({ ...slide, blocks: slide.blocks.filter(item => item.id !== block.id) })}>×</button></div>
        {block.type === 'paragraph' ? <textarea aria-label="Текст слайда" rows={4} maxLength={600} value={block.text} onChange={e => changeBlock({ ...block, text: e.target.value })} /> : block.type === 'list' ? <><label>Пункты списка, каждый с новой строки<textarea rows={6} value={block.items.join('\n')} onChange={e => { const items = e.target.value.split('\n'); if (items.length <= 6 && items.every(item => item.length <= 160)) changeBlock({ ...block, items }) }} /></label><small>До 6 пунктов, до 160 символов в каждом.</small></> : <><div className="table-scroll"><table className="slide-table-edit"><thead><tr>{block.columns.map((value, c) => <th key={c}><input aria-label={`Заголовок колонки ${c + 1}`} maxLength={50} value={value} onChange={e => changeBlock({ ...block, columns: block.columns.map((item, i) => i === c ? e.target.value : item) })} /></th>)}</tr></thead><tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((value, c) => <td key={c}><input aria-label={`Ячейка слайда ${r + 1}:${c + 1}`} maxLength={80} value={value} onChange={e => changeBlock({ ...block, rows: block.rows.map((row, i) => i === r ? row.map((item, j) => j === c ? e.target.value : item) : row) })} /></td>)}</tr>)}</tbody></table></div><div className="office-toolbar"><button disabled={block.rows.length >= 6} onClick={() => changeBlock({ ...block, rows: [...block.rows, block.columns.map(() => '')] })}>＋ Строка</button><button disabled={!block.rows.length} onClick={() => changeBlock({ ...block, rows: block.rows.slice(0, -1) })}>− Строка</button><button disabled={block.columns.length >= 4} onClick={() => changeBlock({ ...block, columns: [...block.columns, 'Колонка'], rows: block.rows.map(row => [...row, '']) })}>＋ Колонка</button><button disabled={block.columns.length <= 1} onClick={() => changeBlock({ ...block, columns: block.columns.slice(0, -1), rows: block.rows.map(row => row.slice(0, -1)) })}>− Колонка</button></div></>}
      </section>)}<div className="office-toolbar">{(['paragraph', 'list', 'table'] as const).map((type, i) => <button key={type} disabled={slide.blocks.length >= (slide.layout === 'title' ? 1 : 2)} onClick={() => addBlock(type)}>＋ {['Текст', 'Список', 'Таблица'][i]}</button>)}</div><p className="muted small-note">До двух блоков на слайд. Длинный материал лучше распределить по нескольким слайдам.</p></div>}
  </div>
}
