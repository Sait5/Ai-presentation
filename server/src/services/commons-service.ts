import { HttpError } from '../middleware/errors.js'
type FileInfo = { url: string; thumburl?: string; descriptionurl: string; mime: string; extmetadata?: Record<string, { value: string }> }
const headers = { 'User-Agent': 'Forma/1.0 (https://github.com/Sait5/Ai-presentation)' }
export function commonsService(transport: typeof fetch = fetch) {
  return async function search(query: string, fallback = true): Promise<{ bytes: Buffer; source: string }> {
    const url = new URL('https://commons.wikimedia.org/w/api.php')
    url.search = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: query + ' filetype:bitmap', gsrnamespace: '6', gsrlimit: '12', prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: '1200' }).toString()
    const response = await transport(url, { headers, signal: AbortSignal.timeout(15000), redirect: 'error' })
    if (!response.ok) throw new HttpError(502, 'IMAGE_SEARCH', 'Поиск картинок временно недоступен. Можно загрузить свою картинку.')
    const data = await response.json() as { query?: { pages?: Record<string, { imageinfo?: FileInfo[] }> } }
    // Automatic use is limited to public domain / CC0; no attribution-dependent licenses.
    for (const page of Object.values(data.query?.pages ?? {})) {
      const info = page.imageinfo?.[0]
      const license = info?.extmetadata?.LicenseShortName?.value ?? ''
      if (!info || !/^(Public domain|CC0(?: 1\.0)?)$/i.test(license) || !['image/png', 'image/jpeg', 'image/webp'].includes(info.mime)) continue
      const imageUrl = new URL(info.thumburl ?? info.url), sourceUrl = new URL(info.descriptionurl)
      if (imageUrl.protocol !== 'https:' || imageUrl.hostname !== 'upload.wikimedia.org' || imageUrl.port || sourceUrl.origin !== 'https://commons.wikimedia.org') continue
      const image = await transport(imageUrl, { headers, redirect: 'error', signal: AbortSignal.timeout(15000) })
      if (!image.ok || !image.body) continue
      const chunks: Uint8Array[] = []; let size = 0
      const reader = image.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.length
          if (size > 8 * 1024 * 1024) throw new HttpError(413, 'IMAGE_SIZE', 'Картинка слишком большая. Загрузите другую.')
          chunks.push(value)
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
      return { bytes: Buffer.concat(chunks), source: sourceUrl.href }
    }
    const words = query.replace(/[,;:]/g, ' ').split(/\s+/).filter(Boolean)
    if (fallback && words.length > 2) return search(words.slice(0, 2).join(' '), false)
    throw new HttpError(404, 'IMAGE_NOT_FOUND', 'Свободная картинка по этой теме не найдена. Загрузите своё изображение.')
  }
}
