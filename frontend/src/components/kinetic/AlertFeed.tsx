import { useEffect, useRef } from 'react'
import type { KineticAlert } from '../../pages/KineticTerminal'

interface Props {
  alerts: KineticAlert[]
}

const TYPE_STYLES: Record<KineticAlert['type'], { border: string; label: string; dot: string }> = {
  brute:     { border: 'border-[#ff4444]/30', label: 'text-[#ff6b6b]', dot: 'bg-[#ff4444]' },
  new:       { border: 'border-[#2aff8a]/20', label: 'text-[#2aff8a]', dot: 'bg-[#2aff8a]' },
  pmkid:     { border: 'border-[#ff9900]/30', label: 'text-[#ffaa33]', dot: 'bg-[#ff9900]' },
  handshake: { border: 'border-[#00e5ff]/20', label: 'text-[#00e5ff]', dot: 'bg-[#00e5ff]' },
  crack:     { border: 'border-[#ff4444]/40', label: 'text-[#ff4444]', dot: 'bg-[#ff4444]' },
  info:      { border: 'border-[#2aff8a]/10', label: 'text-[#2aff8a]/60', dot: 'bg-[#2aff8a]/40' },
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m`
}

export function AlertFeed({ alerts }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [alerts.length])

  return (
    <aside className="w-52 flex flex-col border-l border-[#1a2f1a] bg-[#080c10] shrink-0">
      {/* header */}
      <div className="px-3 py-2 border-b border-[#1a2f1a] flex items-center gap-2 shrink-0">
        <span className="text-[10px] text-[#2aff8a]/50 tracking-widest">LIVE ALERTS</span>
        {alerts.length > 0 && (
          <span className="ml-auto text-[9px] bg-[#2aff8a]/10 border border-[#2aff8a]/20 text-[#2aff8a]/60 rounded px-1.5 py-0.5">
            {alerts.length}
          </span>
        )}
      </div>

      {/* list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 p-2 flex flex-col gap-1.5">
        {alerts.length === 0 && (
          <div className="text-[10px] text-[#2aff8a]/15 text-center mt-8 tracking-wider">
            NO EVENTS
          </div>
        )}

        {alerts.map(a => {
          const s = TYPE_STYLES[a.type]
          return (
            <div
              key={a.id}
              className={`border ${s.border} rounded p-1.5 bg-[#0a140a]/60`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot} shrink-0`} />
                <span className={`text-[9px] font-bold tracking-wider ${s.label} truncate`}>
                  {a.label}
                </span>
                <span className="ml-auto text-[8px] text-[#2aff8a]/20 shrink-0">{timeAgo(a.ts)}</span>
              </div>
              <div className="text-[9px] text-[#2aff8a]/50 pl-3 truncate">{a.value}</div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
