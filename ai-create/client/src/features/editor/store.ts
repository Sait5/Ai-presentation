import { create } from 'zustand'
import type { SavedDocument, DocumentInput } from '@contracts/document'
import { saveDocument } from '../documents/api'
import { messageOf } from '../auth/session'

interface EditorState {
  document: SavedDocument | null
  change: number
  dirty: boolean
  saving: boolean
  error: string
  load: (document: SavedDocument) => void
  edit: (data: Partial<DocumentInput>) => void
  save: () => Promise<SavedDocument | null>
}
export const useEditor = create<EditorState>((set, get) => ({
  document: null, change: 0, dirty: false, saving: false, error: '',
  load: (document) => set({ document, change: 0, dirty: false, saving: false, error: '' }),
  edit: (data) => set((state) => ({ document: state.document ? { ...state.document, ...data } : null, change: state.change + 1, dirty: true, error: '' })),
  save: async () => {
    const state = get()
    if (!state.document || state.saving) return null
    if (!state.dirty) return state.document
    const snapshot = state.document
    set({ saving: true, error: '' })
    try {
      const saved = await saveDocument(snapshot.id, { title: snapshot.title, purpose: snapshot.purpose, content: snapshot.content }, snapshot.revision)
      const current = get()
      if (current.document?.id !== snapshot.id) return null
      const changedWhileSaving = current.change !== state.change
      set({ document: changedWhileSaving ? { ...current.document, revision: saved.revision, updatedAt: saved.updatedAt } : saved,
        dirty: changedWhileSaving, saving: false })
      return changedWhileSaving ? null : saved
    } catch (error) { set({ saving: false, error: messageOf(error) }); return null }
  },
}))
