import { useEffect, useRef, useState } from 'react'
import { defaultTextDesign, type TextContent } from '@contracts/document'
import { uploadImage } from './presentation-api'
import { messageOf } from '../auth/session'
export function TextDesign({ content, update }: { content: TextContent; update: (content: TextContent) => void }) {
  const design = content.design ?? defaultTextDesign
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const latest = useRef(content), mounted = useRef(true)
  useEffect(() => { latest.current = content }, [content])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  return <details className="presentation-panel"><summary>Шрифт и изображения документа</summary><div className="design-fields">
    <label>Шрифт<select value={design.font} onChange={e => update({ ...content, design: { ...design, font: e.target.value as typeof design.font } })}>{['Arial', 'Georgia', 'Verdana'].map(font => <option key={font}>{font}</option>)}</select></label>
    <label>Размер текста<input type="number" min={9} max={28} value={design.size} onChange={e => { const size = Number(e.target.value); if (Number.isInteger(size) && size >= 9 && size <= 28) update({ ...content, design: { ...design, size } }) }} /></label>
    <label>Выравнивание<select value={design.align} onChange={e => update({ ...content, design: { ...design, align: e.target.value as typeof design.align } })}>{[['left','Слева'],['center','По центру'],['right','Справа'],['justify','По ширине']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>Интервал<select value={design.lineHeight} onChange={e => update({ ...content, design: { ...design, lineHeight: Number(e.target.value) } })}>{[1,1.25,1.5,2].map(value => <option key={value}>{value}</option>)}</select></label>
    <label>Цвет текста<input type="color" value={design.color} onChange={e => update({ ...content, design: { ...design, color: e.target.value } })} /></label>
  </div><label>Добавить свою картинку<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || content.blocks.length >= 120} onChange={async e => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
    setBusy(true); setError('')
    try { const image = await uploadImage(file); if (mounted.current && latest.current.blocks.length < 120) update({ ...latest.current, blocks: [...latest.current.blocks, { id: crypto.randomUUID(), type: 'image', assetId: image.id, alt: file.name.slice(0,500), width: 70, align: 'center' }] }) } catch (error) { if (mounted.current) setError(messageOf(error)) } finally { if (mounted.current) setBusy(false) }
  }} /></label><small>PNG, JPEG или WebP до 8 МБ. Дождитесь загрузки перед другими изменениями.</small>{busy && <p role="status">Загружаем картинку…</p>}{error && <p role="alert">{error}</p>}</details>
}
