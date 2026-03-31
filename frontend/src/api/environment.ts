import { apiClient } from './client'

export interface ToolInfo {
  name: string
  binary: string
  category: 'essential' | 'optional' | 'system'
  apt_package: string
  description: string
  status: 'installed' | 'missing' | 'installing' | 'failed'
  version: string | null
}

export interface EnvironmentSummary {
  ready: boolean
  essential_total: number
  essential_installed: number
  optional_total: number
  optional_installed: number
  system_total: number
  system_installed: number
}

export const environmentApi = {
  getSummary: () =>
    apiClient.get<EnvironmentSummary>('/api/environment/summary').then((r) => r.data),

  checkAll: () =>
    apiClient.get<ToolInfo[]>('/api/environment/check').then((r) => r.data),

  checkOne: (binary: string) =>
    apiClient.get<ToolInfo>(`/api/environment/check/${binary}`).then((r) => r.data),

  filter: (params: { category?: string; status?: string }) =>
    apiClient.get<ToolInfo[]>('/api/environment/filter', { params }).then((r) => r.data),

  install: (binaries?: string[], onlyMissing = true) =>
    apiClient
      .post<{ output: string }>('/api/environment/install', {
        binaries,
        only_missing: onlyMissing,
      })
      .then((r) => r.data),

  installOne: (binary: string) =>
    apiClient
      .post<{ success: boolean; output: string }>(`/api/environment/install/${binary}`)
      .then((r) => r.data),
}
