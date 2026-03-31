import { apiClient } from './client'
import type { Credential } from '../types/credential'

export const credentialsApi = {
  list: () =>
    apiClient.get<Credential[]>('/api/credentials').then((r) => r.data),

  forNetwork: (networkId: number) =>
    apiClient.get<Credential[]>(`/api/credentials/${networkId}`).then((r) => r.data),

  delete: (id: number) =>
    apiClient.delete(`/api/credentials/${id}`),
}
