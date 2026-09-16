import { z } from 'zod'

export const themeNames = ['business', 'minimal', 'midnight', 'warm', 'creative'] as const
export const themes = {
  business: { label: 'Деловая', background: 'FAFBF8', text: '22332E', accent: '163E33', cover: '163E33', coverText: 'FFFFFF' },
  minimal: { label: 'Минимализм', background: 'FFFFFF', text: '20232A', accent: '3458D4', cover: 'EEF2FF', coverText: '20232A' },
  midnight: { label: 'Тёмная', background: '152030', text: 'EDF4FF', accent: '66D9CC', cover: '0B1320', coverText: 'EDF4FF' },
  warm: { label: 'Тёплая', background: 'FFF8ED', text: '493426', accent: 'AA4F29', cover: '703A29', coverText: 'FFF8ED' },
  creative: { label: 'Креативная', background: 'F5F0FF', text: '352653', accent: '7945B8', cover: '432568', coverText: 'FFFFFF' },
} as const
export const designSchema = z.object({
  font: z.enum(['Arial', 'Georgia', 'Verdana']), titleSize: z.number().int().min(24).max(48),
  bodySize: z.number().int().min(16).max(28), align: z.enum(['left', 'center', 'right']),
  bold: z.boolean(), italic: z.boolean(),
}).strict()
export type Design = z.infer<typeof designSchema>
export const defaultDesign: Design = { font: 'Arial', titleSize: 36, bodySize: 22, align: 'left', bold: false, italic: false }
export const imageStyles = ['Фотография', 'Минималистичная иллюстрация', 'Акварель', '3D', 'Линейный рисунок', 'Коллаж', 'Инфографика'] as const
export const placements = ['left', 'right', 'top', 'bottom', 'background', 'custom'] as const
export const placementLabels = { left: 'Слева', right: 'Справа', top: 'Сверху', bottom: 'Снизу', background: 'Фон', custom: 'Свободное положение' }
export const slideImageSchema = z.object({
  assetId: z.string().uuid(), alt: z.string().max(500), placement: z.enum(placements),
  x: z.number().min(0).max(90), y: z.number().min(0).max(90), w: z.number().min(10).max(100), h: z.number().min(10).max(100),
  fit: z.enum(['cover', 'contain']), opacity: z.number().min(0.1).max(1),
}).strict().refine(v => v.x + v.w <= 100 && v.y + v.h <= 100, 'Изображение должно находиться внутри слайда')
export type SlideImage = z.infer<typeof slideImageSchema>
export const newSlideImage = (assetId: string, alt = ''): SlideImage => ({ assetId, alt, placement: 'right', x: 55, y: 27, w: 40, h: 60, fit: 'cover', opacity: 1 })
export type Rect = { x: number; y: number; w: number; h: number }
// Percentages of a 16:9 canvas, shared by browser preview and PowerPoint.
export function imageRect(image: SlideImage): Rect {
  switch (image.placement) {
    case 'left': return { x: 5, y: 27, w: 40, h: 60 }
    case 'right': return { x: 55, y: 27, w: 40, h: 60 }
    case 'top': return { x: 5, y: 25, w: 90, h: 32 }
    case 'bottom': return { x: 5, y: 59, w: 90, h: 32 }
    case 'background': return { x: 0, y: 0, w: 100, h: 100 }
    case 'custom': return { x: image.x, y: image.y, w: image.w, h: image.h }
  }
}
export function contentRect(image?: SlideImage): Rect {
  switch (image?.placement) {
    case 'left': return { x: 50, y: 27, w: 45, h: 61 }
    case 'right': return { x: 5, y: 27, w: 45, h: 61 }
    case 'top': return { x: 5, y: 61, w: 90, h: 29 }
    case 'bottom': return { x: 5, y: 27, w: 90, h: 28 }
    default: return { x: 5, y: 27, w: 90, h: 61 }
  }
}

export function blockRect(area: Rect, index: number, count: number, twoColumns: boolean): Rect {
  if (twoColumns) return { x: area.x + index * (area.w + 3) / 2, y: area.y, w: (area.w - 3) / 2, h: area.h }
  const h = (area.h - (count - 1) * 3) / Math.max(1, count)
  return { x: area.x, y: area.y + index * (h + 3), w: area.w, h }
}
export function fittedTextSize(lines: string[], rect: Rect, preferred: number) {
  const height = (size: number) => lines.reduce((sum, line) => sum + line.split('\n').reduce((total, part) => total + Math.max(1, Math.ceil(part.length * size * 0.7 / (rect.w * 9.6 - 24))), 0) * size * 1.3 + 10, 0)
  let size = preferred
  while (size > 16 && height(size) > rect.h * 5.4) size--
  return { size, overflow: height(size) > rect.h * 5.4 }
}
