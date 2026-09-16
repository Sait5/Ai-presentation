import { z } from 'zod'
import { useEffect, useState } from 'react'
import { request } from '../auth/session'
import { presentationContentSchema } from '@contracts/office'
import type { ImageRequest, PresentationRequest } from '@contracts/ai'
import { aiStatusSchema, type AIStatus } from '@contracts/ai'
export function useAIStatus() {
  const [status, setStatus] = useState<AIStatus | null>(null)
  useEffect(() => {
    let active = true
    void request({ url: '/ai/status' }).then(r => { if (active) setStatus(aiStatusSchema.parse(r.data)) }).catch(() => {})
    return () => { active = false }
  }, [])
  return status
}

const assetSchema = z.object({ id: z.string().uuid(), width: z.number(), height: z.number() })
export async function generatePresentation(data: PresentationRequest) {
  return presentationContentSchema.parse((await request({ url: '/ai/presentation', method: 'POST', data, timeout: 200000 })).data)
}
export async function generateImage(data: ImageRequest) {
  return assetSchema.parse((await request({ url: '/ai/image', method: 'POST', data, timeout: 200000 })).data)
}
export async function uploadImage(file: File) {
  return assetSchema.parse((await request({ url: '/images', method: 'POST', data: file, headers: { 'Content-Type': file.type } })).data)
}
export function useAssetUrl(id?: string) {
  const [value, setValue] = useState<{ id: string; url: string } | null>(null)
  const [failedId, setFailedId] = useState('')
  useEffect(() => {
    let active = true
    let url = ''
    if (id) void request<Blob>({ url: `/images/${id}`, responseType: 'blob' }).then(response => {
      if (active) { url = URL.createObjectURL(response.data); setValue({ id, url }) }
    }).catch(() => { if (active) setFailedId(id) })
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [id])
  return { url: value && value.id === id ? value.url : '', failed: Boolean(id && failedId === id) }
}
