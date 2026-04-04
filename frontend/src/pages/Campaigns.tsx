import { useState } from 'react'
import { useCampaigns } from '../hooks/useCampaigns'
import { useNetworks } from '../hooks/useNetworks'
import { useWebSocket } from '../hooks/useWebSocket'
import { useTerminalStore } from '../store/terminal'
import { LiveTerminal } from '../components/LiveTerminal'
import type { WSEvent } from '../types/attack'
import type { Campaign } from '../types/campaign'

const ATTACK_TYPES = [
  { id: 'wpa_handshake', label: 'Handshake WPA' },
  { id: 'wps_pixie',     label: 'WPS Pixie Dust' },
  { id: 'pmkid',         label: 'PMKID' },
  { id: 'crack',         label: 'Crackear' },
]

const STATUS_COLOR: Record<string, string> = {
  pending:   'text-gray-400',
  running:   'text-brand-500 animate-pulse',
  paused:    'text-yellow-400',
  completed: 'text-brand-500',
  failed:    'text-red-400',
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
      className={`border-b border-dark-700 hover:bg-dark-700 cursor-pointer transition-colors ${selected ? 'bg-dark-700' : ''}`}
      onClick={() => onSelect(campaign.id)}
    >
      <td className="py-2 px-3 text-gray-200 font-medium">{campaign.name}</td>
      <td className="py-2 px-3">
        <span className={`text-xs font-bold font-mono ${STATUS_COLOR[campaign.status] ?? 'text-gray-400'}`}>
          {campaign.status.toUpperCase()}
        </span>
      </td>
      <td className="py-2 px-3 text-gray-400 text-xs font-mono">{campaign.interface}</td>
      <td className="py-2 px-3 text-gray-400 text-xs">{campaign.targets.length} objetivos</td>
      <td className="py-2 px-3 text-gray-500 text-xs">
        {new Date(campaign.created_at).toLocaleDateString()}
      </td>
      <td className="py-2 px-3">
        <div className="flex gap-2">
          {campaign.status === 'running' && (
            <button
              onClick={(e) => { e.stopPropagation(); onStop(campaign.id) }}
              className="px-2.5 py-1 rounded bg-yellow-700 hover:bg-yellow-600 text-white text-xs font-bold"
            >
              PAUSAR
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(campaign.id) }}
            className="px-2.5 py-1 rounded bg-dark-600 hover:bg-red-900 text-gray-400 hover:text-red-300 text-xs font-bold"
          >
            DEL
          </button>
        </div>
      </td>
    </tr>
  )
}

export function Campaigns() {
  const { campaigns, loading, createCampaign, deleteCampaign, stopCampaign } = useCampaigns()
  const { networks } = useNetworks()
  const appendLine = useTerminalStore((s) => s.appendLine)

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [iface, setIface] = useState('wlan0mon')
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
      if (prev[netId]) {
        const next = { ...prev }
        delete next[netId]
        return next
      }
      return { ...prev, [netId]: ['wpa_handshake', 'pmkid'] }
    })
  }

  const toggleAttackType = (netId: number, type: string) => {
    setSelectedNetworks((prev) => {
      const types = prev[netId] ?? []
      return {
        ...prev,
        [netId]: types.includes(type) ? types.filter((t) => t !== type) : [...types, type],
      }
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

  const handleLaunch = (id: number) => {
    setActiveCampaignId(id)
    setTimeout(connect, 50)
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-3rem)] overflow-hidden">
      {/* Left panel */}
      <div className="flex flex-col lg:w-1/2 p-6 gap-4 overflow-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-100">Campañas</h1>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-3 py-1.5 rounded bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-colors"
          >
            {showForm ? 'CANCELAR' : '+ NUEVA'}
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="bg-dark-800 border border-dark-600 rounded p-4 space-y-4">
            <h2 className="text-sm font-bold text-gray-300">Nueva Campaña</h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Nombre</label>
                <input
                  className="bg-dark-700 border border-dark-500 rounded px-2 py-1 text-xs font-mono text-gray-200 focus:outline-none focus:border-brand-500"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Auditoría Oficina Junio"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Interfaz</label>
                <input
                  className="bg-dark-700 border border-dark-500 rounded px-2 py-1 text-xs font-mono text-gray-200 focus:outline-none focus:border-brand-500"
                  value={iface}
                  onChange={(e) => setIface(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1 col-span-2">
                <label className="text-xs text-gray-500">Wordlist</label>
                <input
                  className="bg-dark-700 border border-dark-500 rounded px-2 py-1 text-xs font-mono text-gray-200 focus:outline-none focus:border-brand-500"
                  value={wordlist}
                  onChange={(e) => setWordlist(e.target.value)}
                />
              </div>
            </div>

            {/* Network selector */}
            <div>
              <p className="text-xs text-gray-500 mb-2">Seleccionar objetivos ({networks.length} disponibles)</p>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {networks.map((n) => {
                  const checked = !!selectedNetworks[n.id]
                  return (
                    <div key={n.id} className="bg-dark-700 rounded p-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleNetwork(n.id)}
                          className="accent-brand-500"
                        />
                        <span className="text-xs text-gray-300 font-mono">
                          {n.ssid ?? n.bssid} · {n.encryption}
                        </span>
                      </label>
                      {checked && (
                        <div className="flex flex-wrap gap-2 mt-2 ml-6">
                          {ATTACK_TYPES.map(({ id, label }) => (
                            <label key={id} className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={(selectedNetworks[n.id] ?? []).includes(id)}
                                onChange={() => toggleAttackType(n.id, id)}
                                className="accent-brand-500"
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
              className="w-full py-1.5 rounded bg-brand-600 hover:bg-brand-500 disabled:bg-dark-600 disabled:text-gray-500 text-white text-xs font-bold transition-colors"
            >
              CREAR CAMPAÑA
            </button>
          </div>
        )}

        {/* Campaign list */}
        {loading ? (
          <div className="text-gray-500 text-sm animate-pulse">Cargando campañas...</div>
        ) : campaigns.length === 0 ? (
          <div className="text-center text-gray-600 py-10 text-sm">
            Sin campañas. Crea una para comenzar.
          </div>
        ) : (
          <div className="bg-dark-800 border border-dark-600 rounded overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-gray-500 border-b border-dark-600">
                  <th className="text-left py-2 px-3">Nombre</th>
                  <th className="text-left py-2 px-3">Estado</th>
                  <th className="text-left py-2 px-3">Interfaz</th>
                  <th className="text-left py-2 px-3">Targets</th>
                  <th className="text-left py-2 px-3">Creada</th>
                  <th className="text-left py-2 px-3">Acciones</th>
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
          <div className="flex items-center gap-3 bg-dark-800 border border-dark-600 rounded p-3">
            <span className="text-xs text-gray-400 font-mono flex-1">
              Campaña #{activeCampaignId} seleccionada
            </span>
            {!isRunning ? (
              <button
                onClick={() => handleLaunch(activeCampaignId)}
                className="px-4 py-1.5 rounded bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold"
              >
                LANZAR
              </button>
            ) : (
              <button
                onClick={disconnect}
                className="px-4 py-1.5 rounded bg-red-800 hover:bg-red-700 text-white text-xs font-bold"
              >
                DETENER
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right panel — live terminal */}
      <div className="flex flex-col lg:w-1/2 p-6 pt-[4.5rem] lg:pt-6">
        <p className="text-xs text-gray-500 mb-2">Terminal de campaña</p>
        <div className="flex-1 min-h-0">
          <LiveTerminal />
        </div>
      </div>
    </div>
  )
}
