import { useEffect, useRef, useState } from 'react'
import type { PresentationContent } from '@contracts/office'
import { defaultDesign, imageStyles, newSlideImage, themes } from '@contracts/design'
import { presentationRequestSchema, type PresentationRequest } from '@contracts/ai'
import { messageOf } from '../auth/session'
import { findSlideImage, generateImage, generatePresentation, useAIStatus } from './presentation-api'
import { StreamingOutline } from './StreamingOutline'
import { SlideView } from './SlideView'

export function PresentationAI({ content, update }: { content: PresentationContent; update: (content: PresentationContent) => void }) {
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState(6)
  const [tone, setTone] = useState<PresentationRequest['tone']>('Деловой')
  const [imageStyle, setImageStyle] = useState<string>(imageStyles[1])
  const [busy, setBusy] = useState(false)
  const status = useAIStatus()
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<PresentationContent | null>(null)
  const [selected, setSelected] = useState(0)
  const [withImages, setWithImages] = useState(false)
  const [progress, setProgress] = useState('')
  const [writing, setWriting] = useState('')
  const [imageWarnings, setImageWarnings] = useState<string[]>([])
  const mounted = useRef(true)
  const stopImages = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stopImages.current = true } }, [])
  async function generate() {
    setError(''); setBusy(true); setWriting(''); setDraft(null); setImageWarnings([])
    stopImages.current = false
    try {
      const input = presentationRequestSchema.parse({ topic, count, tone, imageStyle, theme: content.metadata.theme, language: content.metadata.language, design: content.design ?? defaultDesign })
      setProgress('Создаём структуру и текст…')
      let result = await generatePresentation(input, text => { if (mounted.current) setWriting(text) })
      if (!mounted.current) return
      setWriting(''); setDraft(result); setSelected(0)
      if (withImages) for (let i = 0; i < result.slides.length; i++) {
        if (!mounted.current || stopImages.current) break
        const slide = result.slides[i]!
        setProgress(`${status?.imageGeneration ? 'Создаём' : 'Ищем'} изображение ${i + 1} из ${result.slides.length}…`)
        try {
        const asset = status?.imageGeneration ? await generateImage({ prompt: slide.imagePrompt || slide.title, style: input.imageStyle, theme: input.theme }) : await findSlideImage((slide.imagePrompt?.split('.')[0] || slide.title).slice(0, 150))
        if (!mounted.current) return
        result = { ...result, slides: result.slides.map((s, j) => i === j ? { ...s, image: { ...newSlideImage(asset.id, slide.title), ...('source' in asset ? { source: asset.source as string } : {}) } } : s) }
        setDraft(result); setSelected(i)
        } catch (err) { if (mounted.current) setImageWarnings(previous => [...previous, `Слайд ${i + 1}: ${messageOf(err)}`]) }
      }
    } catch (err) { if (mounted.current) setError(err instanceof Error && !('isAxiosError' in err) ? err.message : messageOf(err)) } finally { if (mounted.current) setBusy(false) }
  }
  return <details className="presentation-panel ai-panel"><summary>✦ Создать презентацию с AI</summary>
    <p>Опишите тему, аудиторию и цель. AI подготовит слайды и описания подходящих иллюстраций. Затем добавьте изображения к слайдам.</p>
    {status?.enabled === false && <p className="notice" role="status">AI пока не подключён. Добавьте ключ {status.provider === 'gemini' ? 'Gemini' : 'OpenAI'} в настройки сервера и перезапустите его. Загрузка своих картинок доступна.</p>}
    {!status && <p role="status">Проверяем подключение AI. Если проверка не завершится, обновите страницу.</p>}
    {status?.provider === 'gemini' && <p className="notice">Gemini создаёт текст и структуру. Используйте проект Free Tier без подключённого Billing; бесплатная квота ограничена. Google может использовать данные бесплатного тарифа для улучшения продуктов.</p>}
    <label>О чём презентация?<textarea rows={4} maxLength={5000} value={topic} placeholder="Например: 6 слайдов для команды о запуске нового продукта. Цель — согласовать план на месяц…" onChange={e => setTopic(e.target.value)} /></label>
    <div className="design-fields"><label>Слайдов<select value={count} onChange={e => setCount(Number(e.target.value))}>{Array.from({ length: 13 }, (_, i) => i + 3).map(n => <option key={n}>{n}</option>)}</select></label><label>Стиль изложения<select value={tone} onChange={e => setTone(e.target.value as PresentationRequest['tone'])}>{presentationRequestSchema.shape.tone.options.map(t => <option key={t}>{t}</option>)}</select></label><label>Стиль иллюстраций<input list="deck-image-styles" maxLength={300} value={imageStyle} onChange={e => setImageStyle(e.target.value)} /><datalist id="deck-image-styles">{imageStyles.map(s => <option key={s}>{s}</option>)}</datalist></label></div>
    <p className="muted small-note">Тема: {themes[content.metadata.theme].label}. Язык: {content.metadata.language === 'ru' ? 'русский' : 'English'}.{status?.provider === 'openai' && ' Запрос расходует баланс OpenAI API.'}</p>
    <label className="check-label"><input type="checkbox" checked={withImages} disabled={busy} onChange={e => setWithImages(e.target.checked)} />{status?.imageGeneration ? `Создать картинки для всех слайдов: ${count} отдельных запросов к API` : 'Подобрать бесплатные картинки по теме из Wikimedia Commons'}</label>
    {!status?.imageGeneration && <small>Поиск готовых фотографий и иллюстраций, а не генерация новых. Нужный художественный стиль может отсутствовать. Если подходящей картинки нет, слайд останется без неё.</small>}
    <button className="primary" disabled={busy || !status?.enabled || topic.trim().length < 10 || !imageStyle.trim()} onClick={() => void generate()}>{busy ? 'Готовим слайды…' : 'Создать черновик'}</button>
    {busy && <p role="status">{progress} Это может занять несколько минут. Дождитесь завершения на этой странице.</p>}
    {busy && withImages && <button onClick={() => { stopImages.current = true; setProgress('Остановимся после текущего запроса. Готовые слайды останутся в черновике.') }}>Остановить после текущего запроса</button>}
    {error && <p role="alert" className="notice error">{error}</p>}
    {writing && <StreamingOutline text={writing} />}
    {imageWarnings.length > 0 && <ul className="notice">{imageWarnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
    {draft && <fieldset className="ai-draft" disabled={busy}><h3>Черновик AI · {draft.slides.length} слайдов</h3><p>Проверьте содержание и факты перед использованием.</p><nav className="office-tabs" aria-label="Слайды черновика AI">{draft.slides.map((s, i) => <button key={s.id} aria-pressed={i === selected} onClick={() => setSelected(i)}>{i + 1}. {s.title}</button>)}</nav><SlideView slide={draft.slides[selected]!} content={draft} /><div className="office-toolbar"><button className="primary" onClick={() => { update(draft); setDraft(null) }}>Заменить текущие слайды черновиком</button><button disabled={content.slides.length + draft.slides.length > 40} onClick={() => { update({ ...content, slides: [...content.slides, ...draft.slides] }); setDraft(null) }}>Добавить слайды в конец</button><button onClick={() => setDraft(null)}>Удалить черновик</button></div><small>После применения нажмите «Сохранить».</small></fieldset>}
  </details>
}
