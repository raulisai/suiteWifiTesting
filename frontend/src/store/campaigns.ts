import { create } from 'zustand'
import type { Campaign, CampaignCreate } from '../types/campaign'
import { campaignsApi } from '../api/campaigns'

interface CampaignsState {
  campaigns: Campaign[]
  loading: boolean
  error: string | null
  fetchCampaigns: () => Promise<void>
  createCampaign: (data: CampaignCreate) => Promise<Campaign>
  deleteCampaign: (id: number) => Promise<void>
  stopCampaign: (id: number) => Promise<void>
}

export const useCampaignsStore = create<CampaignsState>((set, get) => ({
  campaigns: [],
  loading: false,
  error: null,

  fetchCampaigns: async () => {
    set({ loading: true, error: null })
    try {
      const campaigns = await campaignsApi.list()
      set({ campaigns, loading: false })
    } catch {
      set({ error: 'Failed to load campaigns', loading: false })
    }
  },

  createCampaign: async (data) => {
    const campaign = await campaignsApi.create(data)
    set({ campaigns: [campaign, ...get().campaigns] })
    return campaign
  },

  deleteCampaign: async (id) => {
    await campaignsApi.delete(id)
    set({ campaigns: get().campaigns.filter((c) => c.id !== id) })
  },

  stopCampaign: async (id) => {
    await campaignsApi.stop(id)
    set({
      campaigns: get().campaigns.map((c) =>
        c.id === id ? { ...c, status: 'paused' as const } : c
      ),
    })
  },
}))
