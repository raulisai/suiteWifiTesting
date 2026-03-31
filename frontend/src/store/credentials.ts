import { create } from 'zustand'
import type { Credential, Handshake } from '../types/credential'
import { credentialsApi } from '../api/credentials'

interface CredentialsState {
  credentials: Credential[]
  handshakes: Handshake[]
  loading: boolean
  loadingHandshakes: boolean
  fetchCredentials: () => Promise<void>
  deleteCredential: (id: number) => Promise<void>
  fetchHandshakes: () => Promise<void>
  deleteHandshake: (id: number) => Promise<void>
}

export const useCredentialsStore = create<CredentialsState>((set, get) => ({
  credentials: [],
  handshakes: [],
  loading: false,
  loadingHandshakes: false,

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

  fetchHandshakes: async () => {
    set({ loadingHandshakes: true })
    try {
      const handshakes = await credentialsApi.listHandshakes()
      set({ handshakes, loadingHandshakes: false })
    } catch {
      set({ loadingHandshakes: false })
    }
  },

  deleteHandshake: async (id) => {
    await credentialsApi.deleteHandshake(id)
    set({ handshakes: get().handshakes.filter((h) => h.id !== id) })
  },
}))
