import { create } from 'zustand'
import type { Network } from '../types/network'
import { networksApi } from '../api/networks'

interface NetworksState {
  networks: Network[]
  loading: boolean
  error: string | null
  fetchNetworks: () => Promise<void>
  deleteNetwork: (id: number) => Promise<void>
  addNetwork: (network: Network) => void
  setNetworks: (networks: Network[]) => void
}

export const useNetworksStore = create<NetworksState>((set, get) => ({
  networks: [],
  loading: false,
  error: null,

  fetchNetworks: async () => {
    set({ loading: true, error: null })
    try {
      const networks = await networksApi.list()
      set({ networks, loading: false })
    } catch (e) {
      set({ error: 'Failed to load networks', loading: false })
    }
  },

  deleteNetwork: async (id) => {
    await networksApi.delete(id)
    set({ networks: get().networks.filter((n) => n.id !== id) })
  },

  addNetwork: (network) => {
    const exists = get().networks.some((n) => n.bssid === network.bssid)
    if (!exists) {
      set({ networks: [network, ...get().networks] })
    }
  },

  setNetworks: (networks) => set({ networks }),
}))
