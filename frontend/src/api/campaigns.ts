import { apiClient } from './client'
import type { Campaign, CampaignCreate } from '../types/campaign'

export const campaignsApi = {
  list: () =>
    apiClient.get<Campaign[]>('/api/campaigns').then((r) => r.data),

  getById: (id: number) =>
    apiClient.get<Campaign>(`/api/campaigns/${id}`).then((r) => r.data),

  create: (data: CampaignCreate) =>
    apiClient.post<Campaign>('/api/campaigns', data).then((r) => r.data),

  delete: (id: number) =>
    apiClient.delete(`/api/campaigns/${id}`),

  stop: (id: number) =>
    apiClient.post(`/api/campaigns/${id}/stop`).then((r) => r.data),

  getStats: (id: number) =>
    apiClient.get<Record<string, unknown>>(`/api/campaigns/${id}/stats`).then((r) => r.data),
}
