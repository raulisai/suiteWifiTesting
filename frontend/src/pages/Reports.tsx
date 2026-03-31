import { useState } from 'react'
import { useCampaigns } from '../hooks/useCampaigns'
import { reportsApi, triggerDownload } from '../api/reports'
import { campaignsApi } from '../api/campaigns'

const STATUS_COLOR: Record<string, string> = {
  pending:   'text-gray-400',
  running:   'text-brand-500',
  paused:    'text-yellow-400',
  completed: 'text-brand-500',
  failed:    'text-red-400',
}

export function Reports() {
  const { campaigns, loading } = useCampaigns()
  const [selected, setSelected] = useState<number | null>(null)
  const [stats, setStats] = useState<Record<string, unknown> | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  const handleSelect = async (id: number) => {
    setSelected(id)
    const data = await campaignsApi.getStats(id)
    setStats(data)
  }

  const download = async (format: 'json' | 'csv' | 'pdf') => {
    if (!selected) return
    setDownloading(format)
    try {
      let blob: Blob
      let filename: string
      if (format === 'json') {
        blob = await reportsApi.downloadJson(selected)
        filename = `report_${selected}.json`
      } else if (format === 'csv') {
        blob = await reportsApi.downloadCsv(selected)
        filename = `credentials_${selected}.csv`
      } else {
        blob = await reportsApi.downloadPdf(selected)
        filename = `report_${selected}.pdf`
      }
      triggerDownload(blob, filename)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold text-gray-100">Reportes</h1>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Campaign selector */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Seleccionar Campaña</h2>

          {loading ? (
            <div className="text-gray-500 text-sm animate-pulse">Cargando...</div>
          ) : campaigns.length === 0 ? (
            <div className="text-gray-600 text-sm">Sin campañas disponibles.</div>
          ) : (
            <div className="space-y-2">
              {campaigns.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSelect(c.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded border text-xs font-mono transition-colors ${
                    selected === c.id
                      ? 'border-brand-500 bg-brand-500/10'
                      : 'border-dark-600 bg-dark-800 hover:border-dark-400'
                  }`}
                >
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="text-gray-200 font-medium text-sm">{c.name}</span>
                    <span className="text-gray-500">{c.targets.length} targets · {new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                  <span className={`font-bold ${STATUS_COLOR[c.status] ?? 'text-gray-400'}`}>
                    {c.status.toUpperCase()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Stats + Export */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Exportar</h2>

          {!selected ? (
            <div className="text-gray-600 text-sm">Selecciona una campaña a la izquierda.</div>
          ) : (
            <>
              {/* Stats card */}
              {stats && (
                <div className="bg-dark-800 border border-dark-600 rounded p-4 space-y-3">
                  <h3 className="text-sm font-bold text-gray-300">{String(stats['name'] ?? '')}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Estado',          value: String(stats['status'] ?? '').toUpperCase() },
                      { label: 'Objetivos',        value: String(stats['total_targets'] ?? 0) },
                      { label: 'Completados',      value: String(stats['done_targets'] ?? 0) },
                      { label: 'Handshakes',       value: String(stats['handshakes_captured'] ?? 0) },
                      { label: 'Credenciales',     value: String(stats['credentials_found'] ?? 0) },
                      { label: 'Iniciada',         value: stats['started_at'] ? new Date(String(stats['started_at'])).toLocaleString() : '—' },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-dark-700 rounded p-2">
                        <div className="text-xs text-gray-500">{label}</div>
                        <div className="text-sm font-bold text-gray-100 font-mono mt-0.5">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Download buttons */}
              <div className="grid grid-cols-3 gap-3">
                {(['pdf', 'json', 'csv'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => download(fmt)}
                    disabled={downloading === fmt}
                    className="flex flex-col items-center gap-1 py-3 rounded border border-dark-600 bg-dark-800 hover:border-brand-500 hover:bg-brand-500/5 transition-colors disabled:opacity-50"
                  >
                    <span className="text-2xl">
                      {fmt === 'pdf' ? '📄' : fmt === 'json' ? '{ }' : '📊'}
                    </span>
                    <span className="text-xs font-bold text-gray-300 uppercase">
                      {downloading === fmt ? '...' : fmt}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
