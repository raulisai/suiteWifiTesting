import { useEffect, useRef, useState } from 'react'
import type { Network } from '../../types/network'

// ── Soft green – used for ALL active nodes ─────────────────────────────────
const SOFT_GREEN      = '#2aff8a'
const SOFT_GREEN_RGBA = 'rgba(42,255,138,'

// ── Filter types & definitions ─────────────────────────────────────────────
export type MapFilter = 'all' | 'wpa' | 'wps' | 'open' | 'wep'

interface FilterDef {
  key: MapFilter
  label: string
  color: string
  match: (n: Network) => boolean
}

const FILTER_DEFS: FilterDef[] = [
  { key: 'all',  label: 'ALL',  color: '#2aff8a', match: ()  => true },
  { key: 'wpa',  label: 'WPA',  color: '#2aff8a', match: (n) => !!n.encryption?.toUpperCase().includes('WPA') },
  { key: 'wps',  label: 'WPS',  color: '#2aff8a', match: (n) => !!(n.wps_enabled && !n.wps_locked) },
  { key: 'open', label: 'OPEN', color: '#2aff8a', match: (n) => !n.encryption || n.encryption === 'OPN' },
  { key: 'wep',  label: 'WEP',  color: '#2aff8a', match: (n) => n.encryption?.toUpperCase() === 'WEP' },
]

interface Props {
  networks: Network[]
  scanning: boolean
  onAttack: (n: Network) => void
}

interface MapNode {
  network: Network
  x: number
  y: number
  size: number
  pulse: number
}

function encLabel(enc: string | null): string {
  if (!enc) return 'OPEN'
  return enc
}

function signalPct(power: number | null | undefined): number {
  const p = power ?? -95
  return Math.max(0, Math.min(100, Math.round(((p + 95) / 60) * 100)))
}

/* deterministic scatter based on bssid hash */
function bssidHash(bssid: string): number {
  let h = 0
  for (let i = 0; i < bssid.length; i++) h = (h * 31 + bssid.charCodeAt(i)) >>> 0
  return h
}

export function NetworkMap({ networks, scanning, onAttack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nodesRef  = useRef<MapNode[]>([])
  const frameRef  = useRef(0)
  const [hovered,  setHovered]  = useState<Network | null>(null)
  const [tooltip,  setTooltip]  = useState({ x: 0, y: 0 })
  const [selected, setSelected] = useState<Network | null>(null)
  const [filter,   setFilter]   = useState<MapFilter>('all')
  const [search,   setSearch]   = useState('')
  const [netOpen,  setNetOpen]  = useState(true)

  /* ── derived filter match set ── */
  const activeDef   = FILTER_DEFS.find((f) => f.key === filter)!
  const matchBssids = new Set(networks.filter(activeDef.match).map((n) => n.bssid))
  const hasFilter   = filter !== 'all'

  /* build / update node list */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const W = canvas.offsetWidth
    const H = canvas.offsetHeight

    nodesRef.current = networks.map(n => {
      const h = bssidHash(n.bssid)
      const angle  = ((h % 360) / 360) * Math.PI * 2
      const radius = 60 + ((h >> 8) % (Math.min(W, H) * 0.38))
      const cx = W / 2 + Math.cos(angle) * radius
      const cy = H / 2 + Math.sin(angle) * radius
      return {
        network: n,
        x: cx,
        y: cy,
        size: 6 + Math.abs((n.power ?? -80) + 50) * 0.15,
        pulse: Math.random() * Math.PI * 2,
      }
    })
  }, [networks])

  /* animation loop */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let t = 0

    const draw = () => {
      const W = canvas.width  = canvas.offsetWidth
      const H = canvas.height = canvas.offsetHeight

      ctx.clearRect(0, 0, W, H)

      /* dot grid */
      ctx.fillStyle = 'rgba(42,255,138,0.06)'
      for (let gx = 0; gx < W; gx += 28)
        for (let gy = 0; gy < H; gy += 28)
          ctx.fillRect(gx, gy, 1, 1)

      /* scanning sweep */
      if (scanning) {
        const sweep = (t * 0.015) % (Math.PI * 2)
        ctx.save()
        ctx.translate(W / 2, H / 2)
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.arc(0, 0, Math.max(W, H), sweep, sweep + 0.8)
        ctx.fillStyle = 'rgba(42,255,138,0.05)'
        ctx.fill()
        ctx.restore()

        /* sweep line */
        ctx.save()
        ctx.translate(W / 2, H / 2)
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(Math.cos(sweep) * Math.max(W, H), Math.sin(sweep) * Math.max(W, H))
        ctx.strokeStyle = 'rgba(42,255,138,0.4)'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.restore()
      }

      /* concentric rings */
      for (let r = 60; r < Math.max(W, H) * 0.7; r += 70) {
        ctx.beginPath()
        ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(42,255,138,0.06)'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      /* centre cross */
      ctx.strokeStyle = 'rgba(42,255,138,0.15)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(W / 2 - 12, H / 2); ctx.lineTo(W / 2 + 12, H / 2)
      ctx.moveTo(W / 2, H / 2 - 12); ctx.lineTo(W / 2, H / 2 + 12)
      ctx.stroke()

      /* build per-frame match set from current filter ref */
      const frameMatchBssids = new Set(
        nodesRef.current
          .filter((nd) => FILTER_DEFS.find((f) => f.key === filter)!.match(nd.network))
          .map((nd) => nd.network.bssid)
      )
      const frameHasFilter = filter !== 'all'

      /* connection lines to centre */
      nodesRef.current.forEach(node => {
        const dimmed = frameHasFilter && !frameMatchBssids.has(node.network.bssid)
        ctx.beginPath()
        ctx.moveTo(W / 2, H / 2)
        ctx.lineTo(node.x, node.y)
        ctx.strokeStyle = dimmed ? 'rgba(60,60,60,0.08)' : `${SOFT_GREEN_RGBA}0.10)`
        ctx.lineWidth = 0.5
        ctx.stroke()
      })

      /* nodes */
      nodesRef.current.forEach(node => {
        const pulse      = Math.sin(t * 0.04 + node.pulse) * 0.5 + 0.5
        const r          = node.size
        const dimmed     = frameHasFilter && !frameMatchBssids.has(node.network.bssid)
        const isSelected = selected?.bssid === node.network.bssid

        if (dimmed) {
          /* ── grey, no glow, smaller dot ── */
          ctx.beginPath()
          ctx.arc(node.x, node.y, r * 0.65, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(55,55,55,0.5)'
          ctx.fill()
          ctx.fillStyle = 'rgba(80,80,80,0.35)'
          ctx.font = '9px monospace'
          ctx.fillText(node.network.ssid ?? node.network.bssid, node.x + r + 3, node.y + 4)
          return
        }

        if (isSelected) {
          /* ── bright #2aff8a + strong glow — attack target ── */
          const selC = '#2aff8a'

          /* outer animated ring */
          ctx.beginPath()
          ctx.arc(node.x, node.y, r + 12 + pulse * 8, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(42,255,138,${(0.12 + pulse * 0.2).toFixed(2)})`
          ctx.lineWidth = 1.5
          ctx.stroke()

          /* mid ring */
          ctx.beginPath()
          ctx.arc(node.x, node.y, r + 5, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(42,255,138,0.55)'
          ctx.lineWidth = 1.5
          ctx.stroke()

          /* core — full bright green with glow */
          ctx.beginPath()
          ctx.arc(node.x, node.y, r + 2, 0, Math.PI * 2)
          ctx.fillStyle = selC
          ctx.shadowColor = selC
          ctx.shadowBlur  = 22
          ctx.fill()
          ctx.shadowBlur  = 0

          ctx.fillStyle = selC
          ctx.font = 'bold 9px monospace'
          ctx.fillText(node.network.ssid ?? node.network.bssid, node.x + r + 6, node.y + 4)
          return
        }

        /* ── normal matching node — ALL soft light green ── */
        /* pulse ring */
        ctx.beginPath()
        ctx.arc(node.x, node.y, r + 4 + pulse * 5, 0, Math.PI * 2)
        ctx.strokeStyle = `${SOFT_GREEN_RGBA}${(pulse * 0.18).toFixed(2)})`
        ctx.lineWidth = 1
        ctx.stroke()

        /* dot */
        ctx.beginPath()
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
        ctx.fillStyle = `${SOFT_GREEN_RGBA}0.68)`
        ctx.shadowColor = SOFT_GREEN
        ctx.shadowBlur  = 5
        ctx.fill()
        ctx.shadowBlur  = 0

        /* label */
        ctx.fillStyle = `${SOFT_GREEN_RGBA}0.55)`
        ctx.font = '9px monospace'
        ctx.fillText(node.network.ssid ?? node.network.bssid, node.x + r + 4, node.y + 4)
      })

      t++
      frameRef.current = requestAnimationFrame(draw)
    }

    frameRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frameRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning, filter, selected])

  /* hover hit-test — skip dimmed nodes */
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    let found: Network | null = null
    for (const node of nodesRef.current) {
      if (hasFilter && !matchBssids.has(node.network.bssid)) continue
      const dx = node.x - mx; const dy = node.y - my
      if (Math.sqrt(dx * dx + dy * dy) < node.size + 8) { found = node.network; break }
    }
    setHovered(found)
    setTooltip({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 8 })
  }

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    for (const node of nodesRef.current) {
      if (hasFilter && !matchBssids.has(node.network.bssid)) continue
      const dx = node.x - mx; const dy = node.y - my
      if (Math.sqrt(dx * dx + dy * dy) < node.size + 8) {
        setSelected(node.network)
        return
      }
    }
    setSelected(null)
  }

/* ── filtered + searched network list for floating panel ── */
  const visibleNets = networks
    .filter(n => !search || (n.ssid ?? n.bssid).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.power ?? -100) - (a.power ?? -100))

  return (
    <div className="relative w-full h-full">

      {/* ── Filter chip overlay ──────────────────────────────────────────── */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 pointer-events-auto">
        {FILTER_DEFS.map(({ key, label, match }) => {
          const count  = networks.filter(match).length
          const active = filter === key
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className="flex items-center gap-1.5 px-3 py-1 rounded border transition-all text-[9px] font-bold tracking-widest"
              style={{
                borderColor:    active ? 'rgba(42,255,138,0.50)' : 'rgba(42,255,138,0.12)',
                background:     active ? 'rgba(42,255,138,0.12)' : 'rgba(8,12,16,0.80)',
                color:          active ? '#2aff8a'                : 'rgba(42,255,138,0.30)',
                backdropFilter: 'blur(4px)',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: active ? '#2aff8a' : 'rgba(42,255,138,0.28)' }}
              />
              {label}
              <span
                className="tabular-nums ml-0.5"
                style={{ color: active ? 'rgba(42,255,138,0.65)' : 'rgba(42,255,138,0.20)' }}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Floating network list (left overlay) ─────────────────────────── */}
      <div
        className="absolute top-12 left-3 z-10 pointer-events-auto transition-all"
        style={{ width: netOpen ? 196 : 36 }}
      >
        {/* header row */}
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-t border-x border-t"
          style={{
            background:   'rgba(8,12,16,0.92)',
            borderColor:  'rgba(42,255,138,0.12)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <button
            onClick={() => setNetOpen(o => !o)}
            className="text-[#2aff8a]/30 hover:text-[#2aff8a]/70 transition-colors text-[10px] leading-none shrink-0"
            title={netOpen ? 'Collapse network list' : 'Expand network list'}
          >
            {netOpen ? '◀' : '▶'}
          </button>

          {netOpen && (
            <>
              <span className="text-[8px] text-[#2aff8a]/35 tracking-widest whitespace-nowrap">
                RF NETWORKS
              </span>
              <span className="ml-auto text-[8px] text-[#2aff8a]/20 tabular-nums shrink-0">
                {networks.length}
              </span>
            </>
          )}
        </div>

        {netOpen && (
          <>
            {/* search */}
            <div
              className="px-2 py-1.5 border-x"
              style={{ background: 'rgba(8,12,16,0.92)', borderColor: 'rgba(42,255,138,0.12)', backdropFilter: 'blur(6px)' }}
            >
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="SEARCH…"
                className="w-full bg-transparent text-[9px] text-[#2aff8a] placeholder:text-[#2aff8a]/20 outline-none font-mono border border-[#2aff8a]/12 rounded px-2 py-0.5 focus:border-[#2aff8a]/35 transition-colors"
              />
            </div>

            {/* list */}
            <div
              className="overflow-y-auto border-x border-b rounded-b"
              style={{
                maxHeight: 240,
                background:   'rgba(8,12,16,0.92)',
                borderColor:  'rgba(42,255,138,0.12)',
                backdropFilter: 'blur(6px)',
              }}
            >
              {visibleNets.length === 0 ? (
                <div className="text-[9px] text-[#2aff8a]/15 text-center py-4 tracking-widest">
                  {networks.length === 0 ? 'NO NETWORKS' : 'NO MATCH'}
                </div>
              ) : (
                visibleNets.map(n => {
                  const pct  = signalPct(n.power)
                  const isS  = selected?.bssid === n.bssid
                  return (
                    <div
                      key={n.bssid}
                      onClick={() => setSelected(isS ? null : n)}
                      className="px-2 py-1.5 cursor-pointer border-b border-[#1a2f1a]/40 last:border-0 transition-colors"
                      style={{ background: isS ? 'rgba(42,255,138,0.06)' : 'transparent' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(42,255,138,0.04)')}
                      onMouseLeave={e => (e.currentTarget.style.background = isS ? 'rgba(42,255,138,0.06)' : 'transparent')}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[9px] text-[#2aff8a]/75 font-mono truncate flex-1">
                          {n.ssid ?? '(hidden)'}
                        </span>
                        <span className="text-[8px] text-[#2aff8a]/30 shrink-0 tabular-nums">
                          {n.power ?? '?'}<span className="text-[7px]">dBm</span>
                        </span>
                      </div>
                      {/* signal bar */}
                      <div className="h-px bg-[#1a2f1a] rounded overflow-hidden">
                        <div
                          className="h-full rounded transition-all"
                          style={{
                            width: `${pct}%`,
                            background: pct > 60 ? 'rgba(42,255,138,0.7)' : pct > 30 ? 'rgba(42,255,138,0.45)' : 'rgba(42,255,138,0.25)',
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[7px] text-[#2aff8a]/20 font-mono truncate">CH{n.channel ?? '?'}</span>
                        <span className="text-[7px] text-[#2aff8a]/20">·</span>
                        <span className="text-[7px] text-[#2aff8a]/25 font-mono">{encLabel(n.encryption)}</span>
                        {n.wps_enabled && !n.wps_locked && (
                          <span className="text-[7px] text-[#2aff8a]/40 ml-auto">WPS</span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>

      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: hovered ? 'pointer' : 'crosshair' }}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHovered(null)}
        onClick={onClick}
      />

      {/* empty state */}
      {networks.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-[#2aff8a]/20 text-xs tracking-widest">
            <div className="text-2xl mb-2">◎</div>
            <div>NO NETWORKS DETECTED</div>
            <div className="mt-1">INITIATE SCAN TO POPULATE MAP</div>
          </div>
        </div>
      )}

      {/* hover tooltip */}
      {hovered && (
        <div
          className="absolute pointer-events-none z-20 bg-[#0a1a0a]/95 border border-[#2aff8a]/30 rounded p-2 text-[10px] min-w-[160px]"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="text-[#2aff8a] font-bold">{hovered.ssid ?? '(hidden)'}</div>
          <div className="text-[#2aff8a]/60 mt-0.5">{hovered.bssid}</div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[#2aff8a]/50">
            <span>CH {hovered.channel ?? '?'}</span>
            <span>{encLabel(hovered.encryption)}</span>
            <span>{hovered.power ?? '?'} dBm</span>
            {hovered.wps_enabled && <span className="text-[#2aff8a]/70">WPS</span>}
          </div>
        </div>
      )}

      {/* selected node panel */}
      {selected && (
        <div
          className="absolute bottom-4 right-4 bg-[#0a1a0a]/95 border border-[#2aff8a]/40 rounded p-3 text-[11px] w-60 z-20"
          style={{ boxShadow: '0 0 24px rgba(42,255,138,0.10)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[#2aff8a]/80 font-bold tracking-wider text-[10px]">TARGET SELECTED</span>
            <button onClick={() => setSelected(null)} className="text-[#2aff8a]/30 hover:text-[#2aff8a] text-xs">✕</button>
          </div>
          <div className="text-[#2aff8a] font-bold mb-0.5">{selected.ssid ?? '(hidden)'}</div>
          <div className="text-[#2aff8a]/40 text-[10px] mb-2 font-mono">{selected.bssid}</div>
          <div className="grid grid-cols-3 gap-1 text-[10px] mb-3">
            {([
              ['CH',     selected.channel ?? '?'],
              ['ENC',    selected.encryption ?? 'OPEN'],
              ['PWR',    `${selected.power ?? '?'}dBm`],
              ['WPS',    selected.wps_enabled ? (selected.wps_locked ? 'LOCKED' : 'OPEN') : 'N/A'],
              ['CIPHER', selected.cipher ?? '?'],
              ['AUTH',   selected.auth ?? '?'],
            ] as [string, string | number][]).map(([k, v]) => (
              <div key={k} className="bg-[#0d1f0d]/80 rounded p-1">
                <div className="text-[#2aff8a]/30 text-[8px]">{k}</div>
                <div className="text-[#2aff8a]/85 font-bold text-[9px]">{String(v)}</div>
              </div>
            ))}
          </div>
          <button
            onClick={() => { onAttack(selected); setSelected(null) }}
            className="w-full text-[10px] tracking-widest py-1.5 rounded font-bold transition-all"
            style={{
              background:   'rgba(42,255,138,0.08)',
              border:       '1px solid rgba(42,255,138,0.35)',
              color:        'rgba(42,255,138,0.85)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(42,255,138,0.18)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(42,255,138,0.08)' }}
          >
            ⚡ INITIATE ATTACK
          </button>
        </div>
      )}
    </div>
  )
}
