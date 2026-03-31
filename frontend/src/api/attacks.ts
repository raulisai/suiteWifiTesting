import { apiClient } from './client'
import type { AttackStatus } from '../types/attack'

export const attacksApi = {
  list: () =>
    apiClient.get<AttackStatus[]>('/api/attacks').then((r) => r.data),

  stop: (attackId: string) =>
    apiClient.post(`/api/attacks/${attackId}/stop`).then((r) => r.data),
}
