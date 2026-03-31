import { useState } from 'react'
import { useCampaigns }      from '../../hooks/useCampaigns'
import { useNetworks }       from '../../hooks/useNetworks'
import { useWebSocket }      from '../../hooks/useWebSocket'
import { useTerminalStore }  from '../../store/terminal'
import { useInterfacesStore } from '../../store/interfaces'
import { LiveTerminal }      from '../LiveTerminal'
import type { WSEvent }      from '../../types/attack'
import type { Campaign }     from '../../types/campaign'

const ATTACK_TYPES = [
  { id: 'wpa_handshake', label: 'Handshake WPA' },
  { id: 'wps_pixie',     label: 'WPS Pixie Dust' },
  { id: 'pmkid',         label: 'PMKID' },
  { id: 'crack',         label: 'Crackear' },
]

const STATUS_COLOR: Record<string, string> = {
  pending:   'text-[#2aff8a]/40',
  running:   'text-[#2aff8a] animate-pulse',
  paused:    'text-[#ffaa00]',
  completed: 'text-[#2aff8a]',
  failed:    'text-[#ff4444]',
}

const STATUS_BG: Record<string, string> = {
  pending:   'border-[#2aff8a]/10',
  running:   'border-[#2aff8a]/40',
  paused:    'border-[#ffaa00]/40',
  completed: 'border-[#2aff8a]/30',
  failed:    'border-[#ff4444]/40',
}

function CampaignRow({
  campaign,
  onDelete,
  onStop,
  onSelect,
  selected,
}: {
  campaign: Campaign
  onDelete: (id: number) => void
  onStop: (id: number) => void
  onSelect: (id: number) => void
  selected: boolean
}) {
  return (
    <tr
      className="border-b border-[#1a2f1a]/60 hover:bg-[#2aff8a]/5 cursor-pointer transition-colors"
      style={selected ? { background: 'rgba(42,255,138,0.08)' } : {}}
      onClick={() => onSelect(campaign.id)}
    >
      <td className="py-2 px-3 text-[#a8f0c6] font-medium">{campaign.name}</td>
      <td className="py-2 px-3">
        <span className={`text-[10px] font-bold font-mono ${STATUS_COLOR[campaign.status] ?? 'text-[#a8f0c6]/40'}`}>
          {campaign.status.toUpperCase()}
        </span>
      </td>
      <td className="py-2 px-3 text-[#2aff8a]/50 text-[10px] font-mono">{campaign.interface}</td>
      <td className="py-2 px-3 text-[#2aff8a]/50 text-[10px]">{campaign.targets.length} targets</td>
      <td className="py-2 px-3 text-[#2aff8a]/30 text-[10px]">
        {new Date(campaign.created_at).toLocaleDateString()}
      </td>
      <td className="py-2 px-3">
        <div className="flex gap-1.5">
          {campaign.status === 'running' && (
            <button
              onClick={(e) => { e.stopPropagation(); onStop(campaign.id) }}
              className="px-2 py-0.5 rounded border border-[#ffaa00]/40 text-[#ffaa00] text-[9px] font-bold hover:bg-[#ffaa00]/10 transition-colors"
            >
              PAUSE
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(campaign.id) }}
            className="px-2 py-0.5 rounded border border-[#ff4444]/20 text-[#ff4444]/60 hover:text-[#ff4444] hover:border-[#ff4444]/50 text-[9px] transition-colors"
          >
            DEL
          </button>
        </div>
      </td>
    </tr>
  )
}

export function KineticCampaigns() {
  const { campaigns, loading, createCampaign, deleteCampaign, stopCampaign } = useCampaigns()
  const { networks } = useNetworks()
  const appendLine  = useTerminalStore((s) => s.appendLine)
  const iface       = useInterfacesStore((s) => s.selected) ?? 'wlan0mon'

  const [showForm, setShowForm] = useState(false)
  const [name, setName]         = useState('')
  const [wordlist, setWordlist] = useState('/usr/share/wordlists/rockyou.txt')
  const [selectedNetworks, setSelectedNetworks] = useState<Record<number, string[]>>({})
  const [activeCampaignId, setActiveCampaignId] = useState<number | null>(null)

  const handleEvent = (event: WSEvent) => appendLine(event)
  const { status: wsStatus, connect, disconnect } = useWebSocket({
    path: activeCampaignId ? `/api/campaigns/${activeCampaignId}/stream` : '/api/campaigns/0/stream',
    config: { start: true },
    onEvent: handleEvent,
  })
  const isRunning = ['connecting', 'ready', 'running'].includes(wsStatus)

  const toggleNetwork = (netId: number) => {
    setSelectedNetworks((prev) => {
      if (prev[netId]) { const next = { ...prev }; delete next[netId]; return next }
      return { ...prev, [netId]: ['wpa_handshake', 'pmkid'] }
    })
  }

  const toggleAttackType = (netId: number, type: string) => {
    setSelectedNetworks((prev) => {
      const types = prev[netId] ?? []
      return { ...prev, [netId]: types.includes(type) ? types.filter((t) => t !== type) : [...types, type] }
    })
  }

  const handleCreate = async () => {
    if (!name.trim() || Object.keys(selectedNetworks).length === 0) return
    await createCampaign({
      name,
      interface: iface,
      wordlist: wordlist || undefined,
      targets: Object.entries(selectedNetworks).map(([netId, types]) => ({
        network_id: Number(netId),
        attack_types: types,
      })),
    })
    setShowForm(false)
    setName('')
    setSelectedNetworks({})
  }

  const handleLaunch = (id: number) => { setActiveCampaignId(id); setTimeout(connect, 50) }

  const inputCls = 'bg-[#0d1f0d] border border-[#1a2f1a] rounded px-2 py-1.5 text-[11px] font-mono text-[#a8f0c6] focus:outline-none focus:border-[#2aff8a]/50 w-full'

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left panel ──────────────────────────────────────────────────── */}
      <div className="flex flex-col w-1/2 p-5 gap-4 overflow-y-auto border-r border-[#1a2f1a]">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] tracking-widest text-[#2aff8a]/50 mb-0.5">OPERATIONS</div>
            <h2 className="text-[#2aff8a] font-bold tracking-wider text-sm">CAMPAIGNS</h2>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-3 py-1.5 rounded border border-[#2aff8a]/40 hover:border-[#2aff8a]/70 hover:bg-[#2aff8a]/10 text-[#2aff8a] text-[10px] font-bold tracking-widest transition-colors"
          >
            {showForm ? '✕ CANCEL' : '+ NEW'}
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="border border-[#2aff8a]/20 rounded p-4 space-y-3 bg-[#0a1a0a]"
            style={{ boxShadow: '0 0 20px rgba(42,255,138,0.04)' }}
          >
            <div className="text-[10px] tracking-widest text-[#2aff8a]/60 mb-1">NEW CAMPAIGN</div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[#2aff8a]/40 tracking-wider">NAME</label>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Office Audit June" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[#2aff8a]/40 tracking-wider">INTERFACE</label>
                <div className={`${inputCls} cursor-default`}>{iface}</div>
              </div>
              <div className="flex flex-col gap-1 col-span-2">
                <label className="text-[10px] text-[#2aff8a]/40 tracking-wider">WORDLIST</label>
                <input className={inputCls} value={wordlist} onChange={(e) => setWordlist(e.target.value)} />
              </div>
            </div>

            {/* Network selector */}
            <div>
              <p className="text-[10px] text-[#2aff8a]/40 tracking-wider mb-2">
                SELECT TARGETS <span className="text-[#2aff8a]/20">({networks.length} available)</span>
              </p>
              <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                {networks.map((n) => {
                  const checked = !!selectedNetworks[n.id]
                  return (
                    <div key={n.id} className="bg-[#0d1f0d] rounded border border-[#1a2f1a] p-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleNetwork(n.id)}
                          className="accent-[#2aff8a]"
                        />
                        <span className="text-[10px] text-[#a8f0c6] font-mono">
                          {n.ssid ?? n.bssid}
                          <span className="text-[#2aff8a]/30 ml-1">· {n.encryption ?? 'OPEN'}</span>
                        </span>
                      </label>
                      {checked && (
                        <div className="flex flex-wrap gap-2 mt-2 ml-5">
                          {ATTACK_TYPES.map(({ id, label }) => (
                            <label key={id} className="flex items-center gap-1 text-[9px] text-[#2aff8a]/50 cursor-pointer hover:text-[#2aff8a]/80">
                              <input
                                type="checkbox"
                                checked={(selectedNetworks[n.id] ?? []).includes(id)}
                                onChange={() => toggleAttackType(n.id, id)}
                                className="accent-[#2aff8a]"
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={!name.trim() || Object.keys(selectedNetworks).length === 0}
              className="w-full py-2 rounded border border-[#2aff8a]/50 bg-[#2aff8a]/10 hover:bg-[#2aff8a]/20 disabled:opacity-30 disabled:cursor-not-allowed text-[#2aff8a] text-[10px] font-bold tracking-widest transition-colors"
            >
              CREATE CAMPAIGN
            </button>
          </div>
        )}

        {/* Campaign list */}
        {loading ? (
          <div className="text-[#2aff8a]/30 text-xs animate-pulse tracking-widest">LOADING...</div>
        ) : campaigns.length === 0 ? (
          <div className="text-center text-[#2aff8a]/20 py-12 text-[11px] tracking-widest">
            <div className="text-2xl mb-2">◎</div>
            <div>NO CAMPAIGNS</div>
            <div className="mt-1">CREATE ONE TO BEGIN</div>
          </div>
        ) : (
          <div className="border border-[#1a2f1a] rounded overflow-hidden">
            <table className="w-full text-[10px] font-mono">
              <thead>
                <tr className="border-b border-[#1a2f1a] text-[#2aff8a]/30 bg-[#0a1a0a]">
                  <th className="text-left py-2 px-3 tracking-wider">NAME</th>
                  <th className="text-left py-2 px-3 tracking-wider">STATUS</th>
                  <th className="text-left py-2 px-3 tracking-wider">IFACE</th>
                  <th className="text-left py-2 px-3 tracking-wider">TGT</th>
                  <th className="text-left py-2 px-3 tracking-wider">DATE</th>
                  <th className="text-left py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <CampaignRow
                    key={c.id}
                    campaign={c}
                    selected={activeCampaignId === c.id}
                    onDelete={deleteCampaign}
                    onStop={stopCampaign}
                    onSelect={(id) => setActiveCampaignId(id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Launch controls */}
        {activeCampaignId && (
          <div className={`flex items-center gap-3 rounded border p-3 ${STATUS_BG[campaigns.find((c) => c.id === activeCampaignId)?.status ?? ''] ?? 'border-[#1a2f1a]'}`}>
            <span className="text-[10px] text-[#2aff8a]/50 font-mono flex-1 tracking-wider">
              CAMPAIGN #{activeCampaignId}
            </span>
            {!isRunning ? (
              <button
                onClick={() => handleLaunch(activeCampaignId)}
                className="px-4 py-1.5 rounded border border-[#2aff8a]/50 bg-[#2aff8a]/10 hover:bg-[#2aff8a]/20 text-[#2aff8a] text-[10px] font-bold tracking-widest transition-colors"
              >
                ⚡ LAUNCH
              </button>
            ) : (
              <button
                onClick={disconnect}
                className="px-4 py-1.5 rounded border border-[#ff4444]/40 bg-[#ff4444]/10 hover:bg-[#ff4444]/20 text-[#ff4444] text-[10px] font-bold tracking-widest transition-colors"
              >
                ■ STOP
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Right panel — live terminal ─────────────────────────────────── */}
      <div className="flex flex-col flex-1 p-5">
        <div className="text-[10px] tracking-widest text-[#2aff8a]/40 mb-2">LIVE OUTPUT</div>
        <div className="flex-1 min-h-0">
          <LiveTerminal />
        </div>
      </div>
    </div>
  )
}
