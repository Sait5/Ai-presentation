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
export async function generatePresentation(data: PresentationRequest, onText?: (text: string) => void) {
  let consumed = 0
  const consume = (text: string) => {
    let end: number
    while ((end = text.indexOf('\n', consumed)) >= 0) {
      const line = text.slice(consumed, end); consumed = end + 1
      try { const event = JSON.parse(line); if (event.type === 'text' && typeof event.text === 'string') onText?.(event.text) } catch { /* Wait for a complete event. */ }
    }
  }
  const response = await request<string>({ url: '/ai/presentation/stream', method: 'POST', data, timeout: 200000, responseType: 'text',
    onDownloadProgress: event => { const text = event.event?.target?.responseText; if (typeof text === 'string') consume(text) },
  })
  consume(response.data)
  const events = response.data.trim().split('\n').map(line => JSON.parse(line))
  const error = events.find(event => event.type === 'error')
  if (error) throw new Error(error.message)
  return presentationContentSchema.parse(events.find(event => event.type === 'complete')?.content)
}
export async function findSlideImage(query: string) {
  return assetSchema.extend({ source: z.string().url() }).parse((await request({ url: '/ai/image/search', method: 'POST', data: { query }, timeout: 60000 })).data)
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
