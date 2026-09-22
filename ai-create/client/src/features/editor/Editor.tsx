import { useEffect, useState } from 'react'
import { Link, useBlocker, useParams } from 'react-router-dom'
import type { DocumentInput } from '@contracts/document'
import { exportFormats, type ExportFormat } from '@contracts/office'
import { exportDocument, getDocument } from '../documents/api'
import { purposeLabels } from '../documents/labels'
import { messageOf } from '../auth/session'
import { useEditor } from './store'
import { Preview } from './Preview'
import { TextCanvas } from './TextCanvas'
import { PresentationEditor } from './PresentationEditor'
import { SpreadsheetEditor } from './SpreadsheetEditor'
import { UnsavedDialog } from '../../components/UnsavedDialog'
import { OfficeAI } from './OfficeAI'
import { TextDesign } from './TextDesign'

const kindLabels = { text: 'Документ · Word / PDF', presentation: 'Презентация · PowerPoint', spreadsheet: 'Таблица · Excel' }
export function Editor() {
  const { id } = useParams()
  const { document, dirty, saving, error, edit, load, save } = useEditor()
  const [loadError, setLoadError] = useState('')
  const [preview, setPreview] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    let active = true
    if (id) getDocument(id).then(doc => { if (active) { load(doc); setLoadError(''); setPreview(false); setExportError(''); setFormat(exportFormats[doc.kind][0]) } }).catch((error: unknown) => { if (active) setLoadError(messageOf(error)) })
    return () => { active = false; useEditor.setState({ dirty: false }) }
  }, [id, load])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (useEditor.getState().dirty) { event.preventDefault(); event.returnValue = '' } }
    const shortcut = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save() } }
    window.addEventListener('beforeunload', warn); window.addEventListener('keydown', shortcut)
    return () => { window.removeEventListener('beforeunload', warn); window.removeEventListener('keydown', shortcut) }
  }, [save])
  if (loadError) return <main className="library"><p className="notice error" role="alert">{loadError}</p><Link to="/app">Вернуться к документам</Link></main>
  if (!document || document.id !== id) return <div className="loading">Открываем документ…</div>
  const content = document.content
  const formats: readonly ExportFormat[] = exportFormats[document.kind]
  const selectedFormat = formats.includes(format) ? format : formats[0]!
  function changeLanguage(language: 'ru' | 'en') {
    if (content.kind === 'presentation') edit({ content: { ...content, metadata: { ...content.metadata, language } } })
    else if (content.kind === 'text') edit({ content: { ...content, metadata: { ...content.metadata, language } } })
    else edit({ content: { ...content, metadata: { ...content.metadata, language } } })
  }
  async function download() {
    setExporting(true); setExportError('')
    try {
      const saved = await save()
      if (!saved) { setExportError('Сначала сохраните изменения. Дождитесь завершения сохранения.'); return }
      await exportDocument(saved.id, saved.revision, saved.title, selectedFormat)
    } catch (error) { setExportError(messageOf(error)) }
    finally { setExporting(false) }
  }
  return <main className={`editor-page editor-kind-${content.kind}`}><div className="editor-top"><div><Link className="back-link" to="/app">← Все документы</Link><span className="save-status" role="status">{saving ? 'Сохранение…' : dirty ? '● Есть изменения' : `✓ Сохранено · версия ${document.revision}`}</span></div><div className="editor-actions"><button className="secondary" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Сохранение…' : 'Сохранить'}</button><select aria-label="Формат экспорта" value={selectedFormat} onChange={e => setFormat(e.target.value as ExportFormat)}>{formats.map(value => <option value={value} key={value}>{value.toUpperCase()}</option>)}</select><button className="primary" disabled={saving || exporting} onClick={download}>{exporting ? 'Создаём файл…' : `↓ Экспорт ${selectedFormat.toUpperCase()}`}</button></div></div>
    {(error || exportError) && <div className="notice error" role="alert">{error || exportError}</div>}
    <div className="office-canvas-area"><div className="canvas-toolbar"><div className="segmented"><button className={!preview ? 'selected' : ''} onClick={() => setPreview(false)}>Редактор</button><button className={preview ? 'selected' : ''} onClick={() => setPreview(true)}>Предпросмотр</button></div><span>{kindLabels[document.kind]}</span></div>
      {!preview && <div className="office-document-meta"><label className="title-label">НАЗВАНИЕ ДОКУМЕНТА<input className="document-title" aria-label="Название документа" value={document.title} maxLength={300} onChange={e => edit({ title: e.target.value })} /></label><div className="document-meta"><label>Назначение<select value={document.purpose} onChange={e => edit({ purpose: e.target.value as DocumentInput['purpose'] })}>{Object.entries(purposeLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label><label>Язык документа<select value={content.metadata.language} onChange={e => changeLanguage(e.target.value as 'ru' | 'en')}><option value="ru">Русский</option><option value="en">English</option></select></label></div></div>}
      {content.kind !== 'presentation' && <div hidden={preview}><OfficeAI key={document.id} content={content} update={content => edit({ content })} /></div>}
      {content.kind === 'text' && !preview && <TextDesign key={document.id} content={content} update={content => edit({ content })} />}
      {content.kind === 'text' ? preview ? <Preview document={document} /> : <article className="editor-paper" style={content.design ? { fontFamily: content.design.font, fontSize: `${content.design.size}pt`, lineHeight: content.design.lineHeight, color: content.design.color, textAlign: content.design.align } : undefined}><TextCanvas content={content} update={content => edit({ content })} /></article> : content.kind === 'presentation' ? <PresentationEditor key={document.id} content={content} update={content => edit({ content })} preview={preview} /> : <SpreadsheetEditor key={document.id} content={content} update={content => edit({ content })} preview={preview} />}
      <p className="canvas-footnote">{content.kind === 'text' ? 'Точная разбивка на страницы формируется при экспорте. Ctrl + S — сохранить.' : 'Экспорт содержит редактируемые элементы. Ctrl + S — сохранить.'}</p>
    </div>{blocker.state === 'blocked' && <UnsavedDialog onStay={() => blocker.reset()} onLeave={() => blocker.proceed()} onSave={async () => { if (await save()) blocker.proceed() }} />}
  </main>
}
