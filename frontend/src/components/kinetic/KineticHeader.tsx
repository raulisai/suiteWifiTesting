import { useEffect, useState } from 'react'

interface Props {
  scanning: boolean
  scanCount: number
  packetRate: number
  iface: string
  setIface: (v: string) => void
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

export function KineticHeader({ scanning, scanCount, packetRate, iface, setIface }: Props) {
  const now = new Date()
  const ts = now.toLocaleTimeString('en-US', { hour12: false })

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
        <label className="text-[#2aff8a]/50 flex items-center gap-2">
          IFACE:
          <input
            value={iface}
            onChange={e => setIface(e.target.value)}
            className="bg-[#0d1f0d] border border-[#2aff8a]/20 rounded px-2 py-0.5 text-[#2aff8a] w-24 font-mono text-[10px] focus:outline-none focus:border-[#2aff8a]/50"
            disabled={scanning}
          />
        </label>

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
