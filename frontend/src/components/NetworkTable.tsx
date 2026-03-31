import type { Network } from '../types/network'
import { VulnBadge } from './VulnBadge'

interface NetworkTableProps {
  networks: Network[]
  onDelete?: (id: number) => void
  onAttack?: (network: Network) => void
}

export function NetworkTable({ networks, onDelete, onAttack }: NetworkTableProps) {
  if (networks.length === 0) {
    return (
      <div className="text-center text-gray-600 py-10 text-sm">
        Sin redes. Ejecuta un escaneo para detectar objetivos.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-gray-500 border-b border-dark-600">
            <th className="text-left py-2 px-3">BSSID</th>
            <th className="text-left py-2 px-3">SSID</th>
            <th className="text-left py-2 px-3">CH</th>
            <th className="text-left py-2 px-3">PWR</th>
            <th className="text-left py-2 px-3">Seguridad</th>
            <th className="text-left py-2 px-3">Vulns</th>
            <th className="text-left py-2 px-3">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {networks.map((n) => (
            <tr
              key={n.id}
              className="border-b border-dark-700 hover:bg-dark-700 transition-colors"
            >
              <td className="py-2 px-3 text-gray-400">{n.bssid}</td>
              <td className="py-2 px-3 text-gray-200 max-w-[140px] truncate">
                {n.ssid ?? <span className="text-gray-600 italic">oculto</span>}
              </td>
              <td className="py-2 px-3 text-gray-400">{n.channel ?? '—'}</td>
              <td className="py-2 px-3">
                <span
                  className={
                    (n.power ?? -999) >= -65
                      ? 'text-brand-500'
                      : (n.power ?? -999) >= -75
                      ? 'text-yellow-400'
                      : 'text-red-400'
                  }
                >
                  {n.power ?? '—'} dBm
                </span>
              </td>
              <td className="py-2 px-3 text-gray-400">{n.encryption ?? '—'}</td>
              <td className="py-2 px-3">
                <VulnBadge
                  encryption={n.encryption}
                  wpsEnabled={n.wps_enabled}
                  wpsLocked={n.wps_locked}
                />
              </td>
              <td className="py-2 px-3">
                <div className="flex gap-2">
                  {onAttack && (
                    <button
                      onClick={() => onAttack(n)}
                      className="px-2 py-0.5 rounded bg-brand-600 hover:bg-brand-500 text-white text-[10px] font-bold transition-colors"
                    >
                      ATACAR
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(n.id)}
                      className="px-2 py-0.5 rounded bg-dark-600 hover:bg-red-900 text-gray-400 hover:text-red-300 text-[10px] transition-colors"
                    >
                      DEL
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
