import type { Rect } from './design.js'

export type ImageHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se'
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

// Pointer deltas are percentages of the canvas, independent of screen size.
export function transformImage(start: Rect, handle: ImageHandle, dx: number, dy: number): Rect {
  if (handle === 'move') return { ...start, x: clamp(start.x + dx, 0, 100 - start.w), y: clamp(start.y + dy, 0, 100 - start.h) }
  const west = handle.includes('w'), north = handle.includes('n')
  const right = start.x + start.w, bottom = start.y + start.h
  const x = west ? clamp(start.x + dx, 0, right - 10) : start.x
  const y = north ? clamp(start.y + dy, 0, bottom - 10) : start.y
  return { x, y, w: west ? right - x : clamp(start.w + dx, 10, 100 - x), h: north ? bottom - y : clamp(start.h + dy, 10, 100 - y) }
}
