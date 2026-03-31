import { create } from 'zustand'
import type { AttackStatus } from '../types/attack'
import { attacksApi } from '../api/attacks'

interface AttacksState {
  attacks: AttackStatus[]
  loading: boolean
  fetchAttacks: () => Promise<void>
  stopAttack: (id: string) => Promise<void>
}

export const useAttacksStore = create<AttacksState>((set, get) => ({
  attacks: [],
  loading: false,

  fetchAttacks: async () => {
    set({ loading: true })
    try {
      const attacks = await attacksApi.list()
      set({ attacks, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  stopAttack: async (id) => {
    await attacksApi.stop(id)
    set({
      attacks: get().attacks.map((a) =>
        a.id === id ? { ...a, status: 'stopped' as const } : a
      ),
    })
  },
}))
