import sharp from 'sharp'
import type { PrismaClient } from '../generated/prisma/client.js'
import type { DocumentInput } from '../contracts/document.js'
import { HttpError } from '../middleware/errors.js'

export async function normalizeImage(input: Buffer) {
  if (!input.length || input.length > 8 * 1024 * 1024) throw new HttpError(413, 'IMAGE_SIZE', 'Выберите изображение до 8 МБ')
  try {
    const source = sharp(input, { limitInputPixels: 24_000_000, animated: false, failOn: 'warning' })
    const meta = await source.metadata()
    if (!['png', 'jpeg', 'webp'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1) throw new Error('Unsupported image')
    const { data, info } = await source.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true })
    return { bytes: data, width: info.width, height: info.height }
  } catch { throw new HttpError(422, 'INVALID_IMAGE', 'Нужен корректный PNG, JPEG или WebP: до 24 миллионов пикселей, без анимации') }
}

export function imageService(db: PrismaClient) {
  return {
    async store(ownerId: string, input: Buffer) {
      const normalized = await normalizeImage(input)
      return db.$transaction(async tx => {
        // Serialize quota checks per account; asset bytes never live in document snapshots.
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${ownerId}::uuid FOR UPDATE`
        if (await tx.imageAsset.count({ where: { ownerId } }) >= 200) throw new HttpError(422, 'IMAGE_QUOTA', 'Достигнут лимит 200 изображений для аккаунта')
        return tx.imageAsset.create({ data: { ownerId, ...normalized }, select: { id: true, width: true, height: true } })
      })
    },
    async get(ownerId: string, id: string) {
      const asset = await db.imageAsset.findFirst({ where: { id, ownerId } })
      if (!asset) throw new HttpError(404, 'IMAGE_NOT_FOUND', 'Изображение не найдено')
      return Buffer.from(asset.bytes)
    },
    async validate(ownerId: string, data: DocumentInput) {
      const ids = [...new Set(data.content.kind === 'presentation' ? data.content.slides.flatMap(s => s.image ? [s.image.assetId] : []) : data.content.kind === 'text' ? data.content.blocks.flatMap(b => b.type === 'image' ? [b.assetId] : []) : [])]
      if (ids.length && await db.imageAsset.count({ where: { ownerId, id: { in: ids } } }) !== ids.length) throw new HttpError(422, 'IMAGE_NOT_FOUND', 'Одно из изображений недоступно вашему аккаунту')
    },
  }
}
