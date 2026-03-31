import { apiClient } from './client'
import type { Network, NetworkScanRequest } from '../types/network'

export const networksApi = {
  list: () =>
    apiClient.get<Network[]>('/api/networks').then((r) => r.data),

  getById: (id: number) =>
    apiClient.get<Network>(`/api/networks/${id}`).then((r) => r.data),

  delete: (id: number) =>
    apiClient.delete(`/api/networks/${id}`),

  scan: (req: NetworkScanRequest) =>
    apiClient.post<Network[]>('/api/networks/scan', req).then((r) => r.data),
}
