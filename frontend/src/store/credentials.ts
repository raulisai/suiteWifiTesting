import { create } from 'zustand'
import type { Credential } from '../types/credential'
import { credentialsApi } from '../api/credentials'

interface CredentialsState {
  credentials: Credential[]
  loading: boolean
  fetchCredentials: () => Promise<void>
  deleteCredential: (id: number) => Promise<void>
}

export const useCredentialsStore = create<CredentialsState>((set, get) => ({
  credentials: [],
  loading: false,

  fetchCredentials: async () => {
    set({ loading: true })
    try {
      const credentials = await credentialsApi.list()
      set({ credentials, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  deleteCredential: async (id) => {
    await credentialsApi.delete(id)
    set({ credentials: get().credentials.filter((c) => c.id !== id) })
  },
}))
