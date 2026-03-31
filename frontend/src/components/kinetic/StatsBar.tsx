import { useEffect, useState } from 'react'
import { FILTER_DEFS, type MapFilter } from '../../utils/networkFilters'
import type { Network } from '../../types/network'

interface Props {
  apCount: number
  clientCount: number
  vulnCount: number
  scanning?: boolean
  onStart?: () => void
  onStop?: () => void
  filter?: MapFilter
  onFilterChange?: (f: MapFilter) => void
  networks?: Network[]
}

function LatencyBar() {
  const [bars, setBars] = useState(() => Array.from({ length: 16 }, () => Math.random()))

  useEffect(() => {
    const t = setInterval(() => {
      setBars(b => [...b.slice(1), Math.random()])
    }, 500)
    return () => clearInterval(t)
  }, [])

  const latency = Math.round(8 + bars[bars.length - 1] * 20)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[9px] mb-1">
        <span className="text-[#2aff8a]/40 tracking-wider">PACKET LATENCY</span>
        <span className="text-[#2aff8a] font-bold">{latency}ms</span>
      </div>
      <div className="flex items-end gap-0.5 h-6">
        {bars.map((v, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm transition-all duration-500"
            style={{
              height: `${Math.round(v * 100)}%`,
              background: v > 0.8 ? '#ff6b35' : v > 0.6 ? '#ffaa00' : '#2aff8a',
              opacity: 0.4 + v * 0.6,
            }}
          />
        ))}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: number | string
  color: string
}) {
  return (
    <div className="flex flex-col items-center px-4 py-1">
      <span
        className="text-xl font-bold tabular-nums leading-none"
        style={{ color, textShadow: `0 0 12px ${color}60` }}
      >
        {typeof value === 'number' ? String(value).padStart(2, '0') : value}
      </span>
      <span className="text-[9px] text-[#2aff8a]/30 tracking-widest mt-0.5">{label}</span>
    </div>
  )
}

export function StatsBar({ apCount, clientCount, vulnCount, filter = 'all', onFilterChange, networks = [] }: Props) {
  return (
    <footer className="flex items-center px-6 py-2.5 gap-6 shrink-0">
      {/* Floating stats — no background, no border */}
      <div className="flex items-center">
        <StatCard label="ACTIVE ACCESS POINTS"     value={apCount}     color="#2aff8a" />
        <StatCard label="CONNECTED CLIENTS"        value={clientCount} color="#00e5ff" />
        <StatCard label="CRITICAL VULNERABILITIES" value={vulnCount}   color="#ff6b35" />
      </div>

      {/* Divider */}
      <div className="w-px self-stretch" style={{ background: 'rgba(42,255,138,0.08)' }} />

      {/* Filter buttons */}
      {onFilterChange && (
        <div className="flex items-center gap-2">
          {FILTER_DEFS.map(({ key, label, match }) => {
            const count  = networks.filter(match).length
            const active = filter === key
            return (
              <button
                key={key}
                onClick={() => onFilterChange(key)}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded transition-all duration-150"
                style={{
                  border:     `1px solid ${active ? 'rgba(42,255,138,0.60)' : 'rgba(42,255,138,0.10)'}`,
                  background: active ? 'rgba(42,255,138,0.13)' : 'rgba(4,8,12,0.55)',
                  color:      active ? '#2aff8a' : 'rgba(42,255,138,0.32)',
                  boxShadow:  active ? '0 0 12px rgba(42,255,138,0.18)' : 'none',
                }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    background: active ? '#2aff8a' : 'rgba(42,255,138,0.22)',
                    boxShadow:  active ? '0 0 6px #2aff8a' : 'none',
                  }}
                />
                <span className="text-[11px] font-bold tracking-widest">{label}</span>
                <span
                  className="text-[10px] tabular-nums font-mono"
                  style={{ color: active ? 'rgba(42,255,138,0.70)' : 'rgba(42,255,138,0.20)' }}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex-1" />

      {/* Latency chart — subtle */}
      <div className="w-32 opacity-50">
        <LatencyBar />
      </div>
    </footer>
  )
}
