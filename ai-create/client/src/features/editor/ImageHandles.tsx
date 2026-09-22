import { useRef, useState, type PointerEvent, type KeyboardEvent } from 'react'
import type { Rect, SlideImage } from '@contracts/design'
import { transformImage, type ImageHandle } from '@contracts/image-transform'

const corners = { nw: 'Верхний левый', ne: 'Верхний правый', sw: 'Нижний левый', se: 'Нижний правый' } as const
type Gesture = { pointer: number; x: number; y: number; width: number; height: number; rect: Rect; handle: ImageHandle; current: Rect }

export function ImageHandles({ rect, image, preview, commit }: { rect: Rect; image: SlideImage; preview: (rect: Rect | null) => void; commit: (image: SlideImage) => void }) {
  const gesture = useRef<Gesture | null>(null)
  const [selected, setSelected] = useState(false)
  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || gesture.current) return
    const bounds = event.currentTarget.parentElement!.getBoundingClientRect()
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-handle]')
    const handle = target?.dataset.handle as ImageHandle | undefined
    event.preventDefault()
    const focusTarget = target ?? event.currentTarget
    focusTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelected(true)
    gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, width: bounds.width, height: bounds.height, rect, handle: handle ?? 'move', current: rect }
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current
    if (!active || active.pointer !== event.pointerId) return
    const dx = (event.clientX - active.x) / active.width * 100
    const dy = (event.clientY - active.y) / active.height * 100
    if (Math.abs(event.clientX - active.x) + Math.abs(event.clientY - active.y) < 3) return
    active.current = transformImage(active.rect, active.handle, dx, dy)
    preview(active.current)
  }
  function finish(cancel = false) {
    const active = gesture.current
    gesture.current = null
    preview(null)
    if (!cancel && active && active.current !== active.rect) commit({ ...image, ...active.current, placement: 'custom' })
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); finish(true); setSelected(false); return }
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
    if (!delta || gesture.current) return
    event.preventDefault()
    const handle = (event.target as HTMLElement).dataset.handle as ImageHandle | undefined
    const step = event.shiftKey ? 5 : 1
    commit({ ...image, ...transformImage(rect, handle ?? 'move', delta[0]! * step, delta[1]! * step), placement: 'custom' })
  }
  return <div className={`image-manipulator${selected ? ' is-selected' : ''}`} tabIndex={0} role="group" aria-label="Картинка: перетащите для перемещения; стрелки — сдвиг, Escape — отмена" style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` }}
    onFocus={() => setSelected(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setSelected(false) }}
    onPointerDown={start} onPointerMove={move} onPointerUp={() => finish()} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)} onKeyDown={keyboard}>
    {Object.entries(corners).map(([handle, label]) => <button key={handle} type="button" data-handle={handle} className={`image-resize-handle handle-${handle}`} aria-label={`${label} угол картинки: изменить размер`} />)}
  </div>
}
