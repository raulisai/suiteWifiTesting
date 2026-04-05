import { create } from 'zustand'
import { environmentApi, type WifiInterface } from '../api/environment'
import { getBackendStatus } from './backendStatus'

interface InterfacesState {
  interfaces: WifiInterface[]
  selected: string           // name of the selected interface
  loading: boolean
  error: string | null
  fetch: () => Promise<void>
  select: (name: string) => void
}

export const useInterfacesStore = create<InterfacesState>((set, get) => ({
  interfaces: [],
  selected: '',
  loading: false,
  error: null,

  fetch: async () => {
    // Don't fire a doomed request when the backend is already known to be down
    if (getBackendStatus() === 'offline') return
    set({ loading: true, error: null })
    try {
      const list = await environmentApi.getInterfaces()
      const current = get().selected

      // Auto-select: prefer monitor-mode interface, then first available
      const monitor = list.find((i) => i.type === 'monitor')
      const autoSelected =
        // keep existing selection if still valid
        list.some((i) => i.name === current)
          ? current
          : monitor?.name ?? list[0]?.name ?? ''

      set({ interfaces: list, selected: autoSelected, loading: false })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Error al obtener interfaces',
      })
    }
  },

  select: (name) => set({ selected: name }),
}))
