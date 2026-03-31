import { useState, useMemo } from 'react'
import type { Network } from '../../types/network'
import type { KineticAlert } from '../../pages/KineticTerminal'
import {
  FILTER_DEFS,
  type MapFilter,
  isVulnerable,
  getEncryptionColor,
} from '../../utils/networkFilters'

interface Props {
  networks: Network[]
  pushAlert: (type: KineticAlert['type'], label: string, value: string) => void
  onAttack: (network: Network) => void
}

// ── Single network card ───────────────────────────────────────────────────────
function NetworkCard({ n, onAttack }: { n: Network; onAttack: () => void }) {
  const vuln = isVulnerable(n)
  const encColor = getEncryptionColor(n)

  return (
    <div
      className="relative border rounded p-3 transition-all group cursor-default"
      style={{
        borderColor: vuln ? 'rgba(255,107,53,0.18)' : 'rgba(42,255,138,0.08)',
        background: vuln ? 'rgba(255,107,53,0.03)' : 'rgba(10,20,10,0.25)',
      }}
    >
      {/* Vuln indicator top-right corner */}
      {vuln && (
        <span
          className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
          style={{ background: '#ff6b35', boxShadow: '0 0 6px rgba(255,107,53,0.8)' }}
        />
      )}

      {/* Header row */}
      <div className="flex items-start gap-2 pr-4">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold text-[#a8f0c6] truncate leading-tight">
            {n.ssid ?? <span className="text-[#2aff8a]/25 italic text-[10px]">— HIDDEN SSID —</span>}
          </div>
          <div className="text-[9px] text-[#2aff8a]/30 font-mono mt-0.5 truncate tracking-wider">
            {n.bssid}
          </div>
        </div>
      </div>

      {/* Tags row */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {n.channel != null && (
          <span className="text-[8px] text-[#2aff8a]/25 font-mono tabular-nums">
            CH{String(n.channel).padStart(2, ' ')}
          </span>
        )}
        {n.power != null && (
          <span className="text-[8px] text-[#2aff8a]/25 font-mono tabular-nums">
            {n.power}dBm
          </span>
        )}
        <span
          className="text-[8px] font-bold px-1.5 py-0.5 rounded"
          style={{
            color: encColor,
            background: `${encColor}14`,
            border: `1px solid ${encColor}28`,
          }}
        >
          {n.encryption ?? 'OPEN'}
        </span>
        {n.wps_enabled && !n.wps_locked && (
          <span
            className="text-[8px] font-bold px-1.5 py-0.5 rounded"
            style={{
              color: '#ff6b35',
              background: 'rgba(255,107,53,0.1)',
              border: '1px solid rgba(255,107,53,0.28)',
            }}
          >
            WPS
          </span>
        )}
        {n.wps_locked && (
          <span
            className="text-[8px] px-1.5 py-0.5 rounded"
            style={{ color: 'rgba(42,255,138,0.2)', border: '1px solid rgba(42,255,138,0.1)' }}
          >
            WPS✗
          </span>
        )}
      </div>

      {/* Attack button — appears on hover */}
      <button
        onClick={onAttack}
        className="absolute bottom-2 right-2 px-2 py-0.5 border rounded text-[8px] font-bold tracking-widest
                   transition-all opacity-0 group-hover:opacity-100"
        style={{
          borderColor: 'rgba(42,255,138,0.25)',
          color: '#2aff8a',
          background: 'rgba(42,255,138,0.08)',
        }}
      >
        ATTACK ▶
      </button>
    </div>
  )
}

// ── Main grid component ───────────────────────────────────────────────────────
export function KineticNetworkGrid({ networks, pushAlert, onAttack }: Props) {
  const [activeFilter, setActiveFilter] = useState<MapFilter>('all')

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTER_DEFS.map((f) => [f.key, networks.filter(f.match).length])
      ) as Record<MapFilter, number>,
    [networks]
  )

  const filtered = useMemo(
    () => networks.filter(FILTER_DEFS.find((f) => f.key === activeFilter)!.match),
    [networks, activeFilter]
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Filter chips ─────────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap px-4 py-3 border-b border-[#1a2f1a] shrink-0">
        {FILTER_DEFS.map(({ key, label, sublabel, color }) => {
          const active = activeFilter === key
          const count  = counts[key]
          const dim    = count === 0

          return (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              disabled={dim}
              className="flex flex-col items-start px-4 py-2.5 rounded border transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                borderColor: active ? `${color}55` : `${color}15`,
                background:  active ? `${color}0d` : 'transparent',
              }}
            >
              {/* Count — big number */}
              <span
                className="text-[26px] font-bold tabular-nums leading-none"
                style={{
                  color: active ? color : `${color}35`,
                  textShadow: active ? `0 0 20px ${color}55` : 'none',
                }}
              >
                {String(count).padStart(2, '0')}
              </span>
              {/* Label */}
              <span
                className="text-[9px] font-bold tracking-widest mt-0.5"
                style={{ color: active ? `${color}90` : `${color}40` }}
              >
                {label}
              </span>
              {/* Sublabel */}
              <span
                className="text-[8px] tracking-wide mt-0.5"
                style={{ color: active ? `${color}50` : `${color}20` }}
              >
                {sublabel}
              </span>
            </button>
          )
        })}

        {/* Spacer + total badge */}
        <div className="ml-auto flex items-end pb-1">
          <span className="text-[9px] text-[#2aff8a]/20 font-mono tracking-widest">
            {filtered.length} / {networks.length} TARGETS
          </span>
        </div>
      </div>

      {/* ── Network grid ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <span className="text-[#2aff8a]/10 text-4xl">◎</span>
            <span className="text-[#2aff8a]/20 text-[10px] tracking-widest">
              — NO TARGETS MATCH CURRENT FILTER —
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {filtered.map((n) => (
              <NetworkCard
                key={n.bssid}
                n={n}
                onAttack={() => {
                  pushAlert('handshake', 'TARGETING', n.ssid ?? n.bssid)
                  onAttack(n)
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
