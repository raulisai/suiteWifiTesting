import { useNetworks } from '../hooks/useNetworks'
import { EnvironmentStatus } from '../components/EnvironmentStatus'
import { SignalChart } from '../components/SignalChart'
import { useAttacksStore } from '../store/attacks'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export function Dashboard() {
  const { networks } = useNetworks()
  const { attacks, fetchAttacks } = useAttacksStore()
  const navigate = useNavigate()

  useEffect(() => { fetchAttacks() }, [fetchAttacks])

  const wpaCount  = networks.filter((n) => n.encryption?.includes('WPA')).length
  const wpsCount  = networks.filter((n) => n.wps_enabled && !n.wps_locked).length
  const openCount = networks.filter((n) => n.encryption === 'OPN').length
  const wepCount  = networks.filter((n) => n.encryption === 'WEP').length

  const stats = [
    { label: 'Redes Totales',    value: networks.length, color: 'text-gray-100' },
    { label: 'WPA/WPA2',         value: wpaCount,         color: 'text-yellow-400' },
    { label: 'WPS Disponible',   value: wpsCount,         color: 'text-orange-400' },
    { label: 'Abiertas',         value: openCount,        color: 'text-red-400' },
    { label: 'WEP',              value: wepCount,         color: 'text-red-600' },
    { label: 'Ataques Activos',  value: attacks.filter((a) => a.status === 'running').length, color: 'text-brand-500' },
  ]

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold text-gray-100">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {stats.map(({ label, value, color }) => (
          <div key={label} className="bg-dark-800 border border-dark-600 rounded p-4">
            <div className={`text-3xl font-bold font-mono ${color}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Kinetic Terminal CTA */}
      <div
        onClick={() => navigate('/kinetic')}
        className="cursor-pointer bg-[#080c10] border border-[#2aff8a]/30 hover:border-[#2aff8a]/60 rounded p-4 flex items-center justify-between transition-colors group"
      >
        <div>
          <div className="text-[#2aff8a] font-bold tracking-widest text-sm">KINETIC_TERMINAL</div>
          <div className="text-xs text-[#2aff8a]/50 mt-0.5">
            Radar map · Live attacks · Real-time alerts
          </div>
        </div>
        <div className="text-[#2aff8a]/40 group-hover:text-[#2aff8a] text-2xl transition-colors">▶</div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Signal chart */}
        <div className="xl:col-span-2 bg-dark-800 border border-dark-600 rounded p-4">
          <h2 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">
            Señal por Red (Top 20)
          </h2>
          <SignalChart networks={networks} />
        </div>

        {/* Environment */}
        <div className="bg-dark-800 border border-dark-600 rounded p-4">
          <h2 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">
            Estado del Entorno
          </h2>
          <EnvironmentStatus />
        </div>
      </div>
    </div>
  )
}
