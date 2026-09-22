import { useState, type CSSProperties } from 'react'
import type { PresentationContent, Slide } from '@contracts/office'
import { blockRect, contentRect, defaultDesign, fittedTextSize, imageRect, themes, type Rect } from '@contracts/design'
import { useAssetUrl } from './presentation-api'
import { ImageHandles } from './ImageHandles'

const position = (r: Rect): CSSProperties => ({ position: 'absolute', left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` })
export function SlideView({ slide, content, change }: { slide: Slide; content: PresentationContent; change?: (slide: Slide) => void }) {
  const [liveRect, setLiveRect] = useState<Rect | null>(null)
  const { url, failed } = useAssetUrl(slide.image?.assetId)
  const palette = themes[content.metadata.theme]
  const design = slide.design ?? content.design ?? defaultDesign
  const background = slide.image?.placement === 'background'
  const cover = slide.layout === 'title'
  const color = background ? '#ffffff' : '#' + (cover ? palette.coverText : palette.text)
  const blocks = slide.blocks.map((block, i) => {
    const rect = blockRect(contentRect(slide.image), i, slide.blocks.length, slide.layout === 'twoColumns')
    const fitted = fittedTextSize(block.type === 'paragraph' ? [block.text] : block.type === 'list' ? block.items : [], rect, design.bodySize)
    return { block, rect, fitted }
  })
  return <div className="slide-frame"><article className="designed-slide" aria-label={`Предпросмотр: ${slide.title}`} style={{ background: '#' + (cover ? palette.cover : palette.background), color, fontFamily: design.font, textAlign: design.align }}>
    {slide.image && <div style={{ ...position(liveRect ?? imageRect(slide.image)), opacity: slide.image.opacity }}>{url ? <img draggable={false} className="slide-raster" src={url} alt={slide.image.alt} style={{ objectFit: slide.image.fit }} /> : <div className="image-placeholder">{failed ? 'Изображение недоступно' : 'Загрузка изображения…'}</div>}</div>}
    {background && <div className="slide-shade" />}
    <h2 style={{ ...position({ x: 5, y: 6, w: 90, h: 17 }), fontSize: `${fittedTextSize([slide.title], { x: 5, y: 6, w: 90, h: 17 }, design.titleSize).size / 9.6}cqw` }}>{slide.title}</h2>
    {blocks.map(({ block, rect, fitted }) => <div key={block.id} className="designed-block" style={{ ...position(rect), fontSize: `${fitted.size / 9.6}cqw`, fontWeight: design.bold ? 700 : 400, fontStyle: design.italic ? 'italic' : 'normal' }}>
      {block.type === 'paragraph' ? <p>{block.text}</p> : block.type === 'list' ? <ul>{block.items.map((item, i) => <li key={i}>{item}</li>)}</ul> : <table style={{ fontSize: `${16 / 9.6}cqw`, background: '#' + palette.background, color: '#' + palette.text }}><thead style={{ background: '#' + palette.accent, color: '#' + palette.background }}><tr>{block.columns.map((text, i) => <th key={i}>{text}</th>)}</tr></thead><tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((text, c) => <td key={c}>{text}</td>)}</tr>)}</tbody></table>}
    </div>)}
    {slide.image && change && url && <ImageHandles rect={liveRect ?? imageRect(slide.image)} image={slide.image} preview={setLiveRect} commit={image => change({ ...slide, image })} />}
  </article>{slide.image && change && <p className="muted small-note">Перетащите картинку мышкой. Потяните за угол, чтобы изменить размер. Escape отменяет движение. Затем нажмите «Сохранить».</p>}{blocks.some(item => item.fitted.overflow) && <p role="status" className="notice error">Текст не помещается: сократите его или измените положение картинки.</p>}</div>
}
