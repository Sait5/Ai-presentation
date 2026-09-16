import { useState } from 'react'
import type { Slide } from '@contracts/office'
import { imageRect, imageStyles, newSlideImage, placementLabels, placements, type SlideImage, type themeNames } from '@contracts/design'
import { generateImage, uploadImage, useAssetUrl, useAIStatus } from './presentation-api'
import { messageOf } from '../auth/session'

export function SlideImages({ slide, theme, change, onBusy }: { slide: Slide; theme: typeof themeNames[number]; change: (slide: Slide) => void; onBusy: (busy: boolean) => void }) {
  const [prompt, setPrompt] = useState(slide.imagePrompt ?? '')
  const [style, setStyle] = useState<string>(slide.imageStyle ?? imageStyles[1])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [candidate, setCandidate] = useState<{ id: string; alt: string } | null>(null)
  const { url } = useAssetUrl(candidate?.id)
  const status = useAIStatus()
  async function upload(file?: File) {
    if (!file) return
    if (file.size > 8 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Выберите PNG, JPEG или WebP до 8 МБ'); return }
    setBusy(true); onBusy(true); setError('')
    try { const asset = await uploadImage(file); setCandidate({ id: asset.id, alt: file.name.slice(0, 500) }) } catch (err) { setError(messageOf(err)) } finally { setBusy(false); onBusy(false) }
  }
  async function generate() {
    setBusy(true); onBusy(true); setError('')
    try { const asset = await generateImage({ prompt, style, theme }); setCandidate({ id: asset.id, alt: prompt.slice(0, 500) }) } catch (err) { setError(messageOf(err)) } finally { setBusy(false); onBusy(false) }
  }
  const image = slide.image
  const edit = (next: SlideImage) => change({ ...slide, image: next })
  return <details className="presentation-panel"><summary>Изображение слайда{image ? ' · добавлено' : ''}</summary>
    <label>Загрузить своё изображение<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} /></label><small>PNG, JPEG, WebP до 8 МБ. Одно изображение на слайд.</small>
    <label>Что нарисовать?<textarea rows={3} maxLength={1500} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Например: команда обсуждает план запуска продукта в светлом офисе" /></label>
    <label>Стиль картинки<input list="slide-image-styles" maxLength={300} value={style} onChange={e => setStyle(e.target.value)} placeholder="Выберите или опишите свой стиль" /><datalist id="slide-image-styles">{imageStyles.map(s => <option key={s}>{s}</option>)}</datalist></label>
    {status?.imageGeneration ? <><button disabled={busy || prompt.trim().length < 5 || !style.trim()} onClick={() => void generate()}>✦ Сгенерировать картинку</button><p className="muted small-note">Генерация одной картинки расходует баланс OpenAI API. Цвета подбираются под текущую тему презентации.</p></> : <p className="muted small-note">Генерация картинок отключена. Загрузите своё изображение; описание AI можно использовать как подсказку для выбора картинки.</p>}
    {busy && <p role="status">Готовим изображение… Дождитесь результата перед переключением слайда.</p>}{error && <p className="notice error" role="alert">{error}</p>}
    {candidate && <div className="image-candidate">{url && <img src={url} alt={candidate.alt} />}<div className="office-toolbar"><button className="primary" onClick={() => { change({ ...slide, image: { ...(slide.image ?? newSlideImage(candidate.id)), assetId: candidate.id, alt: candidate.alt }, imagePrompt: prompt, imageStyle: style }); setCandidate(null) }}>{image ? 'Заменить картинку слайда' : 'Добавить на слайд'}</button><button onClick={() => setCandidate(null)}>Отклонить</button></div></div>}
    {image && <><div className="design-fields"><label>Положение<select value={image.placement} onChange={e => edit({ ...image, ...imageRect(image), placement: e.target.value as SlideImage['placement'] })}>{placements.map(p => <option key={p} value={p}>{placementLabels[p]}</option>)}</select></label><label>Заполнение<select value={image.fit} onChange={e => edit({ ...image, fit: e.target.value as SlideImage['fit'] })}><option value="cover">Заполнить с обрезкой</option><option value="contain">Показать целиком</option></select></label><label>Непрозрачность · {Math.round(image.opacity * 100)}%<input type="range" min={10} max={100} value={image.opacity * 100} onChange={e => edit({ ...image, opacity: Number(e.target.value) / 100 })} /></label></div>
      {image.placement === 'custom' && <><div className="design-fields">{(['x', 'y', 'w', 'h'] as const).map((key, i) => <label key={key}>{['Отступ слева', 'Отступ сверху', 'Ширина', 'Высота'][i]} · {image[key]}%<input type="range" min={i < 2 ? 0 : 10} max={key === 'x' ? 100 - image.w : key === 'y' ? 100 - image.h : key === 'w' ? 100 - image.x : 100 - image.y} value={image[key]} onChange={e => edit({ ...image, [key]: Number(e.target.value) })} /></label>)}</div><small>Свободное положение допускает наложение картинки на область текста. Текст находится поверх изображения.</small></>}
      <label>Описание картинки<input maxLength={500} value={image.alt} onChange={e => edit({ ...image, alt: e.target.value })} /></label><button onClick={() => { const { image: _image, ...rest } = slide; change(rest) }}>Убрать со слайда</button>
    </>}
  </details>
}
