import { useEffect, useState } from 'react'
import { useInterfacesStore } from '../../store/interfaces'

interface Props {
  scanning: boolean
  scanCount: number
  packetRate: number
}

function Blink({ active }: { active: boolean }) {
  const [on, setOn] = useState(true)
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setOn(o => !o), 600)
    return () => clearInterval(t)
  }, [active])
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full mr-2 ${
        active && on ? 'bg-[#2aff8a] shadow-[0_0_6px_#2aff8a]' : 'bg-[#2aff8a]/20'
      }`}
    />
  )
}

export function KineticHeader({ scanning, scanCount, packetRate }: Props) {
  const { interfaces, selected, loading, fetch, select } = useInterfacesStore()
  const [ts, setTs] = useState(() => new Date().toLocaleTimeString('en-US', { hour12: false }))

  useEffect(() => {
    const t = setInterval(() => setTs(new Date().toLocaleTimeString('en-US', { hour12: false })), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-[#1a2f1a] bg-[#080c10] shrink-0">
      {/* Left: title + status */}
      <div className="flex items-center gap-4">
        <span className="text-[#2aff8a] font-bold text-sm tracking-[0.3em]">KINETIC_TERMINAL</span>

        <div className="flex items-center text-[10px] gap-1">
          <Blink active={scanning} />
          <span className={scanning ? 'text-[#2aff8a]' : 'text-[#2aff8a]/40'}>
            {scanning ? 'SCANNING_ACTIVE' : 'STANDBY'}
          </span>
        </div>

        {scanning && (
          <span className="text-[10px] text-[#2aff8a]/70 border border-[#2aff8a]/20 rounded px-2 py-0.5">
            SCAN_ACTIVE: {scanCount.toLocaleString()}
          </span>
        )}

        {scanning && packetRate > 0 && (
          <span className="text-[10px] text-[#00e5ff]/70">
            PROBING PACKETS: {(packetRate / 1000).toFixed(1)}K/SEC
          </span>
        )}
      </div>

      {/* Right: interface selector + clock */}
      <div className="flex items-center gap-4 text-[10px]">
        <div className="flex items-center gap-1.5">
          <span className="text-[#2aff8a]/40">IFACE:</span>

          {loading ? (
            <span className="text-[#2aff8a]/25 animate-pulse text-[9px] tracking-widest">DETECTING…</span>
          ) : interfaces.length === 0 ? (
            <span className="text-[#ff4444]/60 text-[9px] tracking-widest">NO INTERFACE</span>
          ) : (
            <select
              value={selected}
              onChange={(e) => select(e.target.value)}
              disabled={scanning}
              className="bg-[#0d1f0d] border border-[#2aff8a]/20 rounded px-2 py-0.5 text-[#2aff8a] font-mono text-[10px] focus:outline-none focus:border-[#2aff8a]/50 disabled:opacity-50 cursor-pointer"
            >
              {interfaces.map((i) => (
                <option key={i.name} value={i.name}>
                  {i.name}{i.type ? ` [${i.type}]` : ''}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={fetch}
            disabled={loading || scanning}
            title="Refresh interfaces"
            className="text-[#2aff8a]/25 hover:text-[#2aff8a] disabled:opacity-30 transition-colors text-sm leading-none"
          >
            ↻
          </button>

          {/* Type badge for selected interface */}
          {selected && (() => {
            const iface = interfaces.find((i) => i.name === selected)
            if (!iface?.type) return null
            const mon = iface.type === 'monitor'
            return (
              <span
                className="text-[8px] px-1 rounded border tracking-wide"
                style={{
                  color: mon ? 'rgba(42,255,138,0.7)' : 'rgba(255,170,0,0.7)',
                  borderColor: mon ? 'rgba(42,255,138,0.25)' : 'rgba(255,170,0,0.25)',
                }}
              >
                {iface.type.toUpperCase()}
              </span>
            )
          })()}
        </div>

        <span className="text-[#2aff8a]/30 tabular-nums">{ts}</span>

        <div className="flex gap-1">
          {['SYS','NET','RF'].map(tag => (
            <span key={tag} className="border border-[#2aff8a]/20 rounded px-1.5 py-0.5 text-[#2aff8a]/40">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </header>
  )
}
