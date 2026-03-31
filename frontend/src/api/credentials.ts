import { apiClient } from './client'
import type { Credential, Handshake } from '../types/credential'

export const credentialsApi = {
  list: () =>
    apiClient.get<Credential[]>('/api/credentials').then((r) => r.data),

  forNetwork: (networkId: number) =>
    apiClient.get<Credential[]>(`/api/credentials/${networkId}`).then((r) => r.data),

  delete: (id: number) =>
    apiClient.delete(`/api/credentials/${id}`),

  listHandshakes: () =>
    apiClient.get<Handshake[]>('/api/credentials/handshakes').then((r) => r.data),

  deleteHandshake: (id: number) =>
    apiClient.delete(`/api/credentials/handshakes/${id}`),

  handshakeContent: (id: number) =>
    apiClient.get<string>(`/api/credentials/handshakes/${id}/content`, {
      responseType: 'text',
      transformResponse: [(d) => d],
    }).then((r) => r.data),
}
