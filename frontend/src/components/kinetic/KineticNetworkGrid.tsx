import { useState, useMemo } from 'react'
import type { Network } from '../../types/network'
import type { KineticAlert } from '../../pages/KineticTerminal'

type NetFilter = 'all' | 'wpa' | 'wps' | 'open' | 'wep'

interface Props {
  networks: Network[]
  pushAlert: (type: KineticAlert['type'], label: string, value: string) => void
  onAttack: (network: Network) => void
}

interface FilterDef {
  key: NetFilter
  label: string
  sublabel: string
  color: string
  match: (n: Network) => boolean
}

const FILTERS: FilterDef[] = [
  {
    key: 'all',
    label: 'TODAS',
    sublabel: 'Access Points',
    color: '#2aff8a',
    match: () => true,
  },
  {
    key: 'wpa',
    label: 'WPA/WPA2',
    sublabel: 'Handshake · PMKID',
    color: '#ffaa00',
    match: (n) => !!n.encryption?.toUpperCase().includes('WPA'),
  },
  {
    key: 'wps',
    label: 'WPS',
    sublabel: 'Pixie Dust · Brute',
    color: '#ff6b35',
    match: (n) => !!(n.wps_enabled && !n.wps_locked),
  },
  {
    key: 'open',
    label: 'ABIERTAS',
    sublabel: 'Sin cifrado',
    color: '#ff4444',
    match: (n) => !n.encryption || n.encryption === 'OPN',
  },
  {
    key: 'wep',
    label: 'WEP',
    sublabel: 'Cifrado roto',
    color: '#cc2222',
    match: (n) => n.encryption?.toUpperCase() === 'WEP',
  },
]

// ── Single network card ───────────────────────────────────────────────────────
function NetworkCard({ n, onAttack }: { n: Network; onAttack: () => void }) {
  const isVuln =
    !n.encryption ||
    n.encryption === 'OPN' ||
    n.encryption?.toUpperCase() === 'WEP' ||
    (n.wps_enabled && !n.wps_locked)

  const encColor = !n.encryption || n.encryption === 'OPN'
    ? '#ff4444'
    : n.encryption?.toUpperCase() === 'WEP'
    ? '#cc2222'
    : n.encryption?.toUpperCase().includes('WPA')
    ? '#ffaa00'
    : '#2aff8a'

  return (
    <div
      className="relative border rounded p-3 transition-all group cursor-default"
      style={{
        borderColor: isVuln ? 'rgba(255,107,53,0.18)' : 'rgba(42,255,138,0.08)',
        background: isVuln ? 'rgba(255,107,53,0.03)' : 'rgba(10,20,10,0.25)',
      }}
    >
      {/* Vuln indicator top-right corner */}
      {isVuln && (
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
  const [activeFilter, setActiveFilter] = useState<NetFilter>('all')

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [f.key, networks.filter(f.match).length])
      ) as Record<NetFilter, number>,
    [networks]
  )

  const filtered = useMemo(
    () => networks.filter(FILTERS.find((f) => f.key === activeFilter)!.match),
    [networks, activeFilter]
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Filter chips ─────────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap px-4 py-3 border-b border-[#1a2f1a] shrink-0">
        {FILTERS.map(({ key, label, sublabel, color }) => {
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
