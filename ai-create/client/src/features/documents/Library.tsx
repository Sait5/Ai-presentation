import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { newContent, type SavedDocument } from '@contracts/document'
import { createDocument, duplicateDocument, listDocuments, removeDocument } from './api'
import { messageOf, request } from '../auth/session'
import { purposeLabels } from './labels'
const kindLabels: Record<string, string> = { text: 'Word / PDF', presentation: 'PowerPoint', spreadsheet: 'Excel' }

export function Library() {
  const [data, setData] = useState<Awaited<ReturnType<typeof listDocuments>> | null>(null)
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState<SavedDocument['kind']>('text')
  const [quota, setQuota] = useState<{ used: number; limit: number | null; isAdmin: boolean } | null>(null)
  const exhausted = quota?.limit !== null && quota?.limit !== undefined && quota.used >= quota.limit
  useEffect(() => { let active = true; void request<{ used: number; limit: number | null; isAdmin: boolean }>({ url: '/account/quota' }).then(r => { if (active) setQuota(r.data) }).catch(() => {}); return () => { active = false } }, [reload])
  const navigate = useNavigate()
  useEffect(() => {
    let active = true
    listDocuments(page).then((data) => { if (active) { setData(data); setError('') } }).catch((error: unknown) => { if (active) setError(messageOf(error)) })
    return () => { active = false }
  }, [page, reload])
  async function create() {
    if (exhausted) { setError('Использованы все 8 созданий. Удаление документов не восстанавливает лимит.'); return }
    setBusy(true)
    try { const doc = await createDocument({ title: kind === 'presentation' ? 'Новая презентация' : kind === 'spreadsheet' ? 'Новая таблица' : 'Новый документ', purpose: 'report', content: newContent(kind) }); navigate(`/app/documents/${doc.id}`) }
    catch (error) { setError(messageOf(error)) }
    finally { setBusy(false) }
  }
  async function action(id: string, mode: 'delete' | 'duplicate') {
    if (mode === 'delete' && !window.confirm('Удалить документ и его сохранённые версии?')) return
    setBusy(true)
    try { if (mode === 'delete') await removeDocument(id); else await duplicateDocument(id); setReload((value) => value + 1) }
    catch (error) { setError(messageOf(error)) }
    finally { setBusy(false) }
  }
  return <main className="library"><div className="page-heading"><div><span className="eyebrow">ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО</span><h1>Мои документы<span className="title-dot">.</span></h1><p className="muted">От первой мысли до последней точки.</p></div><button className="primary" disabled={busy} onClick={create}>＋ Создать документ</button></div>
    <section className="start-card"><div><span className="eyebrow">ЧИСТЫЙ ЛИСТ. НОВЫЕ ВОЗМОЖНОСТИ.</span><h2>Что создадим сегодня?</h2><p>Текст для Word, презентацию PowerPoint или таблицу Excel.</p><label>Тип документа<select aria-label="Тип документа" value={kind} onChange={event => setKind(event.target.value as SavedDocument['kind'])}><option value="text">Документ · Word / PDF</option><option value="presentation">Презентация · PowerPoint</option><option value="spreadsheet">Таблица · Excel</option></select></label><button className="text-button" disabled={busy} onClick={create}>Начать с чистого листа <span>↗</span></button></div><div className="paper-illustration" aria-hidden="true"><span className="paper-dot" /><div className="paper-title" /><i /><i /><i /><div className="paper-table"><b /><b /><b /><b /></div><span className="paper-stamp">f.</span></div></section>
    <p className="notice" role="status">{quota ? quota.isAdmin ? 'Администратор · без ограничения числа документов' : `Использовано ${quota.used} из ${quota.limit} созданий за всё время. Word, Excel, презентации и копии считаются вместе. Удаление не возвращает создание.` : 'Проверяем лимит документов…'}</p>
    <section className="documents-section"><div className="section-heading"><h2>Все документы <span className="count">{data?.total ?? '—'}</span></h2><span className="muted small-note">Последние изменения сверху</span></div>
      {error && <div className="notice error" role="alert">{error} <button onClick={() => setReload((v) => v + 1)}>Повторить</button></div>}
      {!data && !error && <p role="status">Загружаем документы…</p>}
      {data?.items.length === 0 && <div className="empty-state"><span className="empty-icon">▤</span><h3>Здесь будет ваша работа</h3><p>Создайте первый документ. Он сохранится в вашем пространстве.</p><button className="secondary" onClick={create} disabled={busy}>Создать первый документ</button></div>}
      <div className="document-grid">{data?.items.map((doc) => <article className="document-card" key={doc.id}><Link to={`/app/documents/${doc.id}`} className="document-open"><div className="document-thumbnail"><span>f.</span><b>{doc.title}</b><i /><i /><i /></div><div className="document-info"><span className="document-kind">{kindLabels[doc.kind] ?? doc.kind} · {purposeLabels[doc.purpose as keyof typeof purposeLabels] ?? doc.purpose}</span><h3>{doc.title}</h3><p>Изменён {new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(doc.updatedAt))}</p></div></Link><div className="card-actions"><span>Версия {doc.revision}</span><button disabled={busy} onClick={() => action(doc.id, 'duplicate')} aria-label={`Дублировать ${doc.title}`}>Копия</button><button disabled={busy} onClick={() => action(doc.id, 'delete')} aria-label={`Удалить ${doc.title}`}>Удалить</button></div></article>)}</div>
      {data && data.total > 20 && <nav className="pagination" aria-label="Страницы документов"><button disabled={page === 1} onClick={() => setPage(page - 1)}>← Назад</button><span>Страница {page}</span><button disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>Далее →</button></nav>}
    </section></main>
}
