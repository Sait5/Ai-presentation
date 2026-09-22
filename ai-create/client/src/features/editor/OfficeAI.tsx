import { useEffect, useRef, useState } from 'react'
import { contentSchema, type DocumentInput } from '@contracts/document'
import { request, messageOf } from '../auth/session'
import { useAIStatus } from './presentation-api'
export function OfficeAI({ content, update }: { content: DocumentInput['content']; update: (content: DocumentInput['content']) => void }) {
  const [topic, setTopic] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [draft, setDraft] = useState<DocumentInput['content'] | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const status = useAIStatus()
  if (content.kind === 'presentation') return null
  return <details className="presentation-panel"><summary>✦ Создать {content.kind === 'text' ? 'текст' : 'таблицу'} с AI</summary>
    <label>Что подготовить?<textarea value={topic} maxLength={5000} rows={4} onChange={e => setTopic(e.target.value)} placeholder={content.kind === 'text' ? 'План запуска школьного кружка: цель, расписание, роли и первые шаги.' : 'Таблица бюджета поездки: статья, количество, цена и итог. Используй примерные данные.'} /></label>
    <button className="primary" disabled={busy || !status?.enabled || topic.trim().length < 10} onClick={async () => {
      setBusy(true); setError('')
      try {
        const response = await request({ url: '/ai/office', method: 'POST', timeout: 200000, data: { kind: content.kind, topic, language: content.metadata.language } })
        const result = contentSchema.parse(response.data)
        if (result.kind !== content.kind) throw new Error('Incorrect document kind')
        if (mounted.current) setDraft(result)
      } catch (error) { if (mounted.current) setError(messageOf(error)) } finally { if (mounted.current) setBusy(false) }
    }}>{busy ? 'Создаём черновик…' : 'Создать черновик'}</button>
    {status?.enabled === false && <p>AI не подключён: проверьте ключ на сервере.</p>}{error && <p role="alert" className="notice error">{error}</p>}
    {draft && <div className="ai-draft"><h3>Черновик готов</h3><p>Проверьте факты и числа. Применение заменит содержимое этого документа; новый документ и расход лимита не создаются.</p>
      {draft.kind === 'text' ? <div className="office-ai-preview">{draft.blocks.map(block => 'text' in block ? <p key={block.id}>{block.text}</p> : null)}</div> : draft.kind === 'spreadsheet' ? draft.worksheets.map(sheet => <div key={sheet.id}><h4>{sheet.name}</h4><div className="table-scroll"><table><tbody>{sheet.rows.map(row => <tr key={row.id}>{row.cells.map(cell => <td key={cell.id}>{String(cell.value)}</td>)}</tr>)}</tbody></table></div></div>) : null}
      <button className="primary" disabled={busy} onClick={() => { update(draft.kind === 'text' && content.kind === 'text' ? { ...draft, design: content.design } : draft); setDraft(null) }}>Применить черновик</button><button disabled={busy} onClick={() => setDraft(null)}>Отменить</button><p>После применения текст и ячейки можно редактировать. Нажмите «Сохранить».</p>
    </div>}
  </details>
}
