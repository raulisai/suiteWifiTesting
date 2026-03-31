import { useState } from 'react'
import { useCampaigns }             from '../../hooks/useCampaigns'
import { reportsApi, triggerDownload } from '../../api/reports'
import { campaignsApi }             from '../../api/campaigns'

const STATUS_COLOR: Record<string, string> = {
  pending:   'text-[#2aff8a]/30',
  running:   'text-[#2aff8a] animate-pulse',
  paused:    'text-[#ffaa00]',
  completed: 'text-[#2aff8a]',
  failed:    'text-[#ff4444]',
}

export function KineticReports() {
  const { campaigns, loading } = useCampaigns()
  const [selected,    setSelected]    = useState<number | null>(null)
  const [stats,       setStats]       = useState<Record<string, unknown> | null>(null)
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
    <div className="flex flex-col h-full p-5 gap-4 overflow-hidden">

      {/* Header */}
      <div className="shrink-0">
        <div className="text-[10px] tracking-widest text-[#2aff8a]/50 mb-0.5">INTELLIGENCE</div>
        <h2 className="text-[#2aff8a] font-bold tracking-wider text-sm">REPORTS</h2>
      </div>

      <div className="flex flex-1 min-h-0 gap-5">

        {/* ── Campaign selector ─────────────────────────────────────────── */}
        <div className="flex flex-col w-1/2 gap-3 overflow-hidden">
          <div className="text-[10px] tracking-widest text-[#2aff8a]/40">SELECT CAMPAIGN</div>

          {loading ? (
            <div className="text-[#2aff8a]/30 text-xs animate-pulse tracking-widest">LOADING...</div>
          ) : campaigns.length === 0 ? (
            <div className="text-center text-[#2aff8a]/20 py-8 text-[11px] tracking-widest">
              <div className="text-2xl mb-2">◎</div>
              <div>NO CAMPAIGNS AVAILABLE</div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 overflow-y-auto pr-1">
              {campaigns.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSelect(c.id)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded border text-[10px] font-mono transition-all text-left"
                  style={{
                    borderColor: selected === c.id ? 'rgba(42,255,138,0.45)' : 'rgba(26,47,26,0.8)',
                    background:  selected === c.id ? 'rgba(42,255,138,0.07)' : 'rgba(13,31,13,0.6)',
                  }}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[#a8f0c6] font-medium">{c.name}</span>
                    <span className="text-[#2aff8a]/30 text-[9px]">
                      {c.targets.length} targets · {new Date(c.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <span className={`font-bold text-[9px] tracking-wider ${STATUS_COLOR[c.status] ?? 'text-[#2aff8a]/30'}`}>
                    {c.status.toUpperCase()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Stats + Export ─────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 gap-4 overflow-hidden">
          <div className="text-[10px] tracking-widest text-[#2aff8a]/40">EXPORT</div>

          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-[#2aff8a]/20 text-[11px] tracking-widest">
              SELECT A CAMPAIGN
            </div>
          ) : (
            <>
              {/* Stats card */}
              {stats && (
                <div
                  className="border border-[#1a2f1a] rounded p-4 space-y-3 bg-[#0a1a0a]"
                  style={{ boxShadow: '0 0 20px rgba(42,255,138,0.04)' }}
                >
                  <div className="text-[#2aff8a] font-bold text-[11px] tracking-wider">
                    {String(stats['name'] ?? '')}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ['STATUS',      String(stats['status'] ?? '').toUpperCase()],
                      ['TARGETS',     String(stats['total_targets'] ?? 0)],
                      ['COMPLETED',   String(stats['done_targets'] ?? 0)],
                      ['HANDSHAKES',  String(stats['handshakes_captured'] ?? 0)],
                      ['CREDENTIALS', String(stats['credentials_found'] ?? 0)],
                      ['STARTED',     stats['started_at'] ? new Date(String(stats['started_at'])).toLocaleString() : '—'],
                    ] as [string, string][]).map(([label, value]) => (
                      <div key={label} className="bg-[#0d1f0d] rounded p-2 border border-[#1a2f1a]">
                        <div className="text-[9px] text-[#2aff8a]/30 tracking-wider">{label}</div>
                        <div className="text-[11px] font-bold text-[#a8f0c6] font-mono mt-0.5">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Download buttons */}
              <div className="grid grid-cols-3 gap-3">
                {(['pdf', 'json', 'csv'] as const).map((fmt) => {
                  const icons: Record<string, string> = { pdf: '📄', json: '{ }', csv: '📊' }
                  return (
                    <button
                      key={fmt}
                      onClick={() => download(fmt)}
                      disabled={downloading === fmt}
                      className="flex flex-col items-center gap-2 py-4 rounded border transition-all disabled:opacity-40"
                      style={{
                        borderColor: 'rgba(42,255,138,0.20)',
                        background:  'rgba(13,31,13,0.6)',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(42,255,138,0.45)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(42,255,138,0.08)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(42,255,138,0.20)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(13,31,13,0.6)' }}
                    >
                      <span className="text-xl">{icons[fmt]}</span>
                      <span className="text-[10px] font-bold text-[#2aff8a] tracking-widest">
                        {downloading === fmt ? '···' : fmt.toUpperCase()}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
