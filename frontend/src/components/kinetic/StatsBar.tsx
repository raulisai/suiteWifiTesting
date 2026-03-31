import { useEffect, useRef, useState } from 'react'

interface Props {
  apCount: number
  clientCount: number
  vulnCount: number
  scanning: boolean
  onStart: () => void
  onStop: () => void
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
    <div className="flex flex-col items-center px-4 py-1 border-r border-[#1a2f1a] last:border-r-0">
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

export function StatsBar({ apCount, clientCount, vulnCount, scanning, onStart, onStop }: Props) {
  return (
    <footer className="flex items-center border-t border-[#1a2f1a] bg-[#080c10] px-4 py-2 gap-4 shrink-0">
      {/* Stats */}
      <div className="flex items-center">
        <StatCard label="ACTIVE ACCESS POINTS"  value={apCount}     color="#2aff8a" />
        <StatCard label="CONNECTED CLIENTS"     value={clientCount} color="#00e5ff" />
        <StatCard label="CRITICAL VULNERABILITIES" value={vulnCount}  color="#ff6b35" />
      </div>

      <div className="flex-1" />

      {/* Latency chart */}
      <div className="w-36 border border-[#1a2f1a] rounded p-2 bg-[#0a140a]">
        <LatencyBar />
      </div>

      {/* CTA */}
      {scanning ? (
        <button
          onClick={onStop}
          className="flex flex-col items-center px-5 py-2 border border-[#ff4444]/50 rounded bg-[#ff4444]/10 hover:bg-[#ff4444]/20 transition-colors group"
        >
          <span className="text-[10px] text-[#ff6b6b]/60 tracking-widest">SCANNING_ACTIVE</span>
          <span className="text-[11px] font-bold text-[#ff6b6b] tracking-widest group-hover:text-[#ff4444]">
            ■ STOP SEQUENCE
          </span>
        </button>
      ) : (
        <button
          onClick={onStart}
          className="flex flex-col items-center px-5 py-2 border border-[#2aff8a]/40 rounded bg-[#2aff8a]/10 hover:bg-[#2aff8a]/20 hover:border-[#2aff8a]/70 transition-colors group"
        >
          <span className="text-[10px] text-[#2aff8a]/50 tracking-widest">PENETRATION_READY</span>
          <span className="text-[11px] font-bold text-[#2aff8a] tracking-widest group-hover:shadow-[0_0_8px_#2aff8a]">
            ▶ INITIATE SEQUENCE
          </span>
        </button>
      )}
    </footer>
  )
}
