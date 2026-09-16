import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'
import { create } from 'zustand'
import { z } from 'zod'

const userSchema = z.object({ id: z.string().uuid(), email: z.string() })
const sessionSchema = z.object({ user: userSchema, accessToken: z.string() })
type User = z.infer<typeof userSchema>
export const useSession = create<{ user: User | null; ready: boolean }>(() => ({ user: null, ready: false }))
const client = axios.create({ baseURL: '/api/v1', withCredentials: true, timeout: 45000, headers: { 'X-Requested-With': 'AI-Documents' } })
let accessToken: string | null = null
let refreshing: Promise<void> | null = null

function accept(data: unknown) {
  const session = sessionSchema.parse(data)
  accessToken = session.accessToken
  useSession.setState({ user: session.user, ready: true })
}
export function refreshSession() {
  if (!refreshing) {
    const rotate = async () => { accept((await client.post('/auth/refresh')).data) }
    // Serialize cookie rotation across tabs as well as requests in this tab.
    refreshing = (navigator.locks ? navigator.locks.request('forma-session-refresh', rotate) : rotate()).catch((error: unknown) => {
      // A temporary network failure must not unmount an editor with unsaved work.
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        accessToken = null
        useSession.setState({ user: null, ready: true })
      } else { useSession.setState({ ready: true }) }
      throw error
    }).finally(() => { refreshing = null })
  }
  return refreshing
}
export async function signIn(mode: 'login' | 'register', email: string, password: string) {
  accept((await client.post(`/auth/${mode}`, { email, password })).data)
}
export async function signOut() {
  await client.post('/auth/logout')
  accessToken = null
  useSession.setState({ user: null, ready: true })
}
export async function request<T = unknown>(config: AxiosRequestConfig) {
  const send = () => client.request<T>({ ...config, headers: { ...config.headers, Authorization: `Bearer ${accessToken ?? ''}` } })
  try { return await send() }
  catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) throw error
    await refreshSession()
    return send()
  }
}
export function messageOf(error: unknown) {
  if (axios.isAxiosError(error)) {
    const parsed = z.object({ error: z.object({ message: z.string(), fieldErrors: z.array(z.object({ message: z.string() })).optional() }) }).safeParse(error.response?.data)
    if (parsed.success) return parsed.data.error.fieldErrors?.[0]?.message ?? parsed.data.error.message
    return 'Не удалось связаться с сервером. Ваши правки остаются в редакторе.'
  }
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? 'Проверьте документ'
  return 'Не удалось выполнить действие. Попробуйте ещё раз.'
}
