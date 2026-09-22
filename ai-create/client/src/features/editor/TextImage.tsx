import type { TextBlock } from '@contracts/document'
import { useAssetUrl } from './presentation-api'
export function TextImage({ block }: { block: Extract<TextBlock, { type: 'image' }> }) {
  const { url, failed } = useAssetUrl(block.assetId)
  return <figure style={{ textAlign: block.align, margin: '16px 0' }}>{url ? <img src={url} alt={block.alt} style={{ width: `${block.width}%`, maxHeight: '70vh', objectFit: 'contain' }} /> : <p>{failed ? 'Изображение недоступно' : 'Загрузка картинки…'}</p>}</figure>
}
