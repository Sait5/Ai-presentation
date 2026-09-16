import { z } from 'zod'
import axios from 'axios'
import { documentSchema, documentInputSchema } from '@contracts/document'
import type { DocumentInput } from '@contracts/document'
import { request } from '../auth/session'
import type { ExportFormat } from '@contracts/office'

const listSchema = z.object({ items: z.array(z.object({ id: z.string(), title: z.string(), kind: z.string(), purpose: z.string(), revision: z.number(), updatedAt: z.string() })), total: z.number(), page: z.number(), pageSize: z.number() })
export const listDocuments = async (page: number) => listSchema.parse((await request({ url: '/documents', params: { page } })).data)
export const getDocument = async (id: string) => documentSchema.parse((await request({ url: `/documents/${id}` })).data)
export const createDocument = async (data: DocumentInput) => documentSchema.parse((await request({ url: '/documents', method: 'POST', data: documentInputSchema.parse(data) })).data)
export const saveDocument = async (id: string, data: DocumentInput, expectedRevision: number) => documentSchema.parse((await request({ url: `/documents/${id}`, method: 'PATCH', data: { ...documentInputSchema.parse(data), expectedRevision } })).data)
export const removeDocument = (id: string) => request({ url: `/documents/${id}`, method: 'DELETE' })
export const duplicateDocument = async (id: string) => documentSchema.parse((await request({ url: `/documents/${id}/duplicate`, method: 'POST' })).data)
export async function exportDocument(id: string, revision: number, title: string, format: ExportFormat) {
  const response = await request<Blob>({ url: `/documents/${id}/exports`, method: 'POST', data: { format, revision }, responseType: 'blob' }).catch(async (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
      try { error.response.data = JSON.parse(await error.response.data.text()) } catch { /* Keep the original HTTP error. */ }
    }
    throw error
  })
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = `${title.replace(/[<>:"/\\|?*]/g, '_')}.${format === 'markdown' ? 'md' : format}`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
