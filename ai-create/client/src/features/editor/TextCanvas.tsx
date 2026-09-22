import type { TextContent, TextBlock } from '@contracts/document'
import { BlockEditor } from './BlockEditor'

const labels = { heading: 'Заголовок', paragraph: 'Абзац', list: 'Список', table: 'Таблица', pageBreak: 'Разрыв страницы', image: 'Изображение' }
export function TextCanvas({ content, update }: { content: TextContent; update: (content: TextContent) => void }) {
  const change = (blocks: TextBlock[]) => update({ ...content, blocks })
  function add(type: TextBlock['type']) {
    if (type === 'image') return
    const id = crypto.randomUUID()
    const block: TextBlock = type === 'heading' ? { id, type, level: 1, text: '' } : type === 'paragraph' ? { id, type, text: '' } : type === 'list' ? { id, type, ordered: false, items: [''] } : type === 'table' ? { id, type, columns: ['Наименование', 'Описание', 'Стоимость'], rows: [['', '', ''], ['', '', '']] } : { id, type }
    change([...content.blocks, block])
  }
  function move(index: number, offset: number) {
    const blocks = [...content.blocks]; const item = blocks.splice(index, 1)[0]!
    blocks.splice(index + offset, 0, item); change(blocks)
  }
  return <>{content.blocks.length > 0 && <details className="text-outline"><summary>Структура документа</summary><nav aria-label="Структура документа">{content.blocks.map((block, index) => <a key={block.id} href={`#block-${block.id}`}>{index + 1}. {block.type === 'heading' ? block.text || 'Заголовок' : labels[block.type]}</a>)}</nav></details>}{content.blocks.map((block, index) => <section className="editable-block" id={`block-${block.id}`} key={block.id}><div className="block-tools"><span>{labels[block.type]}</span><div><button aria-label={`Переместить блок ${index + 1} вверх`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button aria-label={`Переместить блок ${index + 1} вниз`} disabled={index === content.blocks.length - 1} onClick={() => move(index, 1)}>↓</button><button aria-label={`Удалить блок ${index + 1}`} onClick={() => change(content.blocks.filter(item => item.id !== block.id))}>×</button></div></div><BlockEditor block={block} update={updated => change(content.blocks.map(item => item.id === block.id ? updated : item))} /></section>)}
    {!content.blocks.length && <div className="blank-document"><span>Начните с первой мысли</span><p>Добавьте заголовок, абзац или таблицу ниже.</p></div>}
    <div className="add-blocks"><span>ДОБАВИТЬ БЛОК</span><div>{Object.entries(labels).filter(([key]) => key !== 'image').map(([key, label]) => <button key={key} disabled={content.blocks.length >= 120} onClick={() => add(key as TextBlock['type'])}>＋ {label}</button>)}</div></div></>
}
