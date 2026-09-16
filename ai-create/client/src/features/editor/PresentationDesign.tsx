import { defaultDesign, themeNames, themes, type Design } from '@contracts/design'
import type { PresentationContent, Slide } from '@contracts/office'

function Typography({ value, change }: { value: Design; change: (value: Design) => void }) {
  return <div className="design-fields"><label>Шрифт<select value={value.font} onChange={e => change({ ...value, font: e.target.value as Design['font'] })}>{['Arial', 'Georgia', 'Verdana'].map(font => <option key={font}>{font}</option>)}</select></label>
    <label>Заголовок · {value.titleSize} pt<input type="range" min={24} max={48} value={value.titleSize} onChange={e => change({ ...value, titleSize: Number(e.target.value) })} /></label>
    <label>Текст · {value.bodySize} pt<input type="range" min={16} max={28} value={value.bodySize} onChange={e => change({ ...value, bodySize: Number(e.target.value) })} /></label>
    <label>Выравнивание<select value={value.align} onChange={e => change({ ...value, align: e.target.value as Design['align'] })}><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option></select></label>
    <label className="check-label"><input type="checkbox" checked={value.bold} onChange={e => change({ ...value, bold: e.target.checked })} />Жирный текст</label><label className="check-label"><input type="checkbox" checked={value.italic} onChange={e => change({ ...value, italic: e.target.checked })} />Курсив</label>
  </div>
}
export function PresentationDesign({ content, slide, update, changeSlide }: { content: PresentationContent; slide: Slide; update: (c: PresentationContent) => void; changeSlide: (s: Slide) => void }) {
  return <details className="presentation-panel"><summary>Оформление · {themes[content.metadata.theme].label}</summary>
    <div className="theme-choices">{themeNames.map(key => <button key={key} aria-pressed={content.metadata.theme === key} onClick={() => update({ ...content, metadata: { ...content.metadata, theme: key } })}><span style={{ background: '#' + themes[key].cover, color: '#' + themes[key].coverText }}>Aa</span>{themes[key].label}</button>)}</div>
    <p>Текст всей презентации</p><Typography value={content.design ?? defaultDesign} change={design => update({ ...content, design })} />
    <label className="check-label"><input type="checkbox" checked={Boolean(slide.design)} onChange={e => { if (e.target.checked) changeSlide({ ...slide, design: { ...(content.design ?? defaultDesign) } }); else { const { design: _design, ...rest } = slide; changeSlide(rest) } }} />Свой стиль текста для выбранного слайда</label>
    {slide.design && <Typography value={slide.design} change={design => changeSlide({ ...slide, design })} />}
  </details>
}
