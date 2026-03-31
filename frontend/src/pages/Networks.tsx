import { useState } from 'react'
import { useNetworks } from '../hooks/useNetworks'
import { networksApi } from '../api/networks'
import { NetworkTable } from '../components/NetworkTable'
import { AttackPanel } from '../components/AttackPanel'
import type { Network } from '../types/network'

export function Networks() {
  const { networks, loading, deleteNetwork, refetch } = useNetworks()
  const [scanning, setScanning] = useState(false)
  const [iface, setIface] = useState('wlan0mon')
  const [duration, setDuration] = useState(60)
  const [selected, setSelected] = useState<Network | null>(null)

  const handleScan = async () => {
    setScanning(true)
    try {
      await networksApi.scan({ interface: iface, duration })
      await refetch()
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-100">Redes Detectadas</h1>
        <span className="text-xs text-gray-500 font-mono">{networks.length} en base de datos</span>
      </div>

      {/* Scan controls */}
      <div className="flex flex-wrap gap-3 items-end bg-dark-800 border border-dark-600 rounded p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Interfaz monitor</label>
          <input
            className="bg-dark-700 border border-dark-500 rounded px-2 py-1 text-xs font-mono text-gray-200 w-32 focus:outline-none focus:border-brand-500"
            value={iface}
            onChange={(e) => setIface(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Duración (s)</label>
          <input
            type="number"
            className="bg-dark-700 border border-dark-500 rounded px-2 py-1 text-xs font-mono text-gray-200 w-20 focus:outline-none focus:border-brand-500"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="px-5 py-1.5 rounded bg-brand-600 hover:bg-brand-500 disabled:bg-dark-600 disabled:text-gray-500 text-white text-xs font-bold transition-colors"
        >
          {scanning ? 'ESCANEANDO...' : 'ESCANEAR'}
        </button>
      </div>

      {/* Attack panel */}
      {selected && (
        <AttackPanel
          network={selected}
          interface_={iface}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Network list */}
      {loading ? (
        <div className="text-gray-500 text-sm animate-pulse">Cargando redes...</div>
      ) : (
        <div className="bg-dark-800 border border-dark-600 rounded">
          <NetworkTable
            networks={networks}
            onDelete={deleteNetwork}
            onAttack={(n) => setSelected(n)}
          />
        </div>
      )}
    </div>
  )
}
