import { useState, useEffect } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell } from 'recharts'
import { environmentApi, type ToolInfo } from '../../api/environment'
import type { Network } from '../../types/network'
import { isVulnerable } from '../../utils/networkFilters'

interface Props {
  networks: Network[]
}

// ── Kinetic-styled mini signal chart ─────────────────────────────────────────
function KineticSignalMini({ networks }: { networks: Network[] }) {
  const data = networks
    .filter((n) => n.power != null)
    .sort((a, b) => (b.power ?? -100) - (a.power ?? -100))
    .slice(0, 12)
    .map((n) => ({
      name: (n.ssid ?? n.bssid.slice(-8)).slice(0, 14),
      power: n.power ?? -100,
      vuln: isVulnerable(n),
    }))

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-28 text-[#2aff8a]/15 text-[9px] tracking-widest">
        — NO RF DATA —
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(80, data.length * 14 + 16)}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 14, top: 0, bottom: 0 }}>
        <XAxis
          type="number"
          domain={[-100, 0]}
          tick={{ fill: 'rgba(42,255,138,0.22)', fontSize: 8 }}
          axisLine={{ stroke: 'rgba(42,255,138,0.12)' }}
          tickLine={false}
          ticks={[-100, -80, -60, -40, -20, 0]}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={96}
          tick={{ fill: 'rgba(42,255,138,0.45)', fontSize: 8, fontFamily: 'monospace' }}
          axisLine={false}
          tickLine={false}
        />
        <Bar dataKey="power" radius={[0, 2, 2, 0]} maxBarSize={9}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.vuln ? '#ff6b35' : '#2aff8a'} fillOpacity={0.65} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Kinetic-styled env status ─────────────────────────────────────────────────
function KineticEnvMini() {
  const [tools, setTools] = useState<ToolInfo[]>([])

  useEffect(() => {
    environmentApi.checkAll().then(setTools).catch(() => {})
  }, [])

  const essential = tools.filter((t) => t.category === 'essential')
  const ok = essential.filter((t) => t.status === 'installed').length
  const total = essential.length

  if (!tools.length) {
    return (
      <div className="text-[#2aff8a]/20 text-[9px] tracking-widest animate-pulse">
        SCANNING DEPS…
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[8px] text-[#2aff8a]/30 tracking-widest">ESSENTIAL</span>
        <span
          className="text-[10px] font-bold tabular-nums"
          style={{
            color: ok === total ? '#2aff8a' : ok > total / 2 ? '#ffaa00' : '#ff4444',
            textShadow: `0 0 8px currentColor`,
          }}
        >
          {ok}/{total}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {essential.map((t) => (
          <div key={t.binary} className="flex items-center gap-1.5 min-w-0">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                background: t.status === 'installed' ? '#2aff8a' : '#ff4444',
                boxShadow: t.status === 'installed' ? '0 0 4px rgba(42,255,138,0.6)' : 'none',
              }}
            />
            <span className="text-[8px] font-mono text-[#2aff8a]/50 truncate">{t.binary}</span>
          </div>
        ))}
      </div>

      {/* Optional count summary */}
      {tools.filter((t) => t.category === 'optional').length > 0 && (
        <div className="mt-2 pt-2 border-t border-[#1a2f1a] text-[8px] text-[#2aff8a]/20 tracking-widest">
          OPTIONAL{' '}
          {tools.filter((t) => t.category === 'optional' && t.status === 'installed').length}/
          {tools.filter((t) => t.category === 'optional').length}
        </div>
      )}
    </div>
  )
}

// ── Main collapsible panel ────────────────────────────────────────────────────
export function KineticInfoPanel({ networks }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className="border-b border-[#1a2f1a] shrink-0 transition-all"
      style={{ background: open ? 'rgba(8,12,16,0.97)' : 'transparent' }}
    >
      {/* Toggle bar */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-1.5 hover:bg-[#2aff8a]/[0.03] transition-colors group text-left select-none"
      >
        <span className="text-[#2aff8a]/25 text-[9px] w-3 leading-none">
          {open ? '▲' : '▼'}
        </span>
        <span className="text-[9px] text-[#2aff8a]/45 tracking-widest font-bold">INTEL_PANEL</span>
        <span className="text-[9px] text-[#2aff8a]/15 ml-1">
          · RF SIGNAL MAP + ENVIRONMENT STATUS
        </span>
        <span className="ml-auto text-[9px] text-[#2aff8a]/15 group-hover:text-[#2aff8a]/35 tracking-widest">
          {open ? 'COLLAPSE ▲' : 'EXPAND ▼'}
        </span>
      </button>

      {/* Panel content */}
      {open && (
        <div className="flex gap-0 border-t border-[#1a2f1a]">
          {/* Signal chart */}
          <div className="flex-1 min-w-0 px-4 py-3">
            <div className="text-[8px] text-[#2aff8a]/25 tracking-widest mb-2 flex items-center gap-2">
              RF SIGNAL MAP
              <span className="text-[#2aff8a]/15">({networks.length} APs)</span>
            </div>
            <KineticSignalMini networks={networks} />
          </div>

          {/* Divider */}
          <div className="w-px bg-[#1a2f1a] shrink-0" />

          {/* Env status */}
          <div className="w-52 shrink-0 px-4 py-3">
            <div className="text-[8px] text-[#2aff8a]/25 tracking-widest mb-2">
              TOOL DEPENDENCIES
            </div>
            <KineticEnvMini />
          </div>
        </div>
      )}
    </div>
  )
}
