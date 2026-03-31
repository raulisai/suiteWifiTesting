import { apiClient } from './client'

export const reportsApi = {
  downloadJson: (campaignId: number) =>
    apiClient
      .get(`/api/reports/${campaignId}/json`, { responseType: 'blob' })
      .then((r) => r.data as Blob),

  downloadCsv: (campaignId: number) =>
    apiClient
      .get(`/api/reports/${campaignId}/csv`, { responseType: 'blob' })
      .then((r) => r.data as Blob),

  downloadPdf: (campaignId: number) =>
    apiClient
      .get(`/api/reports/${campaignId}/pdf`, { responseType: 'blob' })
      .then((r) => r.data as Blob),
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
