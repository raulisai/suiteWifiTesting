import { useEffect, useRef, useState } from 'react'
import type { Network } from '../../types/network'

interface Props {
  networks: Network[]
  scanning: boolean
  onAttack: (n: Network) => void
}

interface MapNode {
  network: Network
  x: number
  y: number
  color: string
  size: number
  pulse: number
}

function encColor(enc: string | null): string {
  if (!enc) return '#2aff8a'
  if (enc === 'WEP') return '#ff4444'
  if (enc === 'WPA') return '#ffaa00'
  return '#2aff8a'
}

function encLabel(enc: string | null): string {
  if (!enc) return 'OPEN'
  return enc
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
  const [hovered, setHovered] = useState<Network | null>(null)
  const [tooltip, setTooltip] = useState({ x: 0, y: 0 })
  const [selected, setSelected] = useState<Network | null>(null)

  /* build / update node list */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const W = canvas.offsetWidth
    const H = canvas.offsetHeight

    nodesRef.current = networks.map(n => {
      const h = bssidHash(n.bssid)
      const angle = ((h % 360) / 360) * Math.PI * 2
      const radius = 60 + ((h >> 8) % (Math.min(W, H) * 0.38))
      const cx = W / 2 + Math.cos(angle) * radius
      const cy = H / 2 + Math.sin(angle) * radius
      const threat = (n.wps_enabled && !n.wps_locked) || n.encryption === 'WEP'
      return {
        network: n,
        x: cx,
        y: cy,
        color: threat ? '#ff6b35' : encColor(n.encryption),
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

      /* connection lines to centre */
      nodesRef.current.forEach(node => {
        ctx.beginPath()
        ctx.moveTo(W / 2, H / 2)
        ctx.lineTo(node.x, node.y)
        ctx.strokeStyle = `${node.color}18`
        ctx.lineWidth = 0.5
        ctx.stroke()
      })

      /* nodes */
      nodesRef.current.forEach(node => {
        const pulse = Math.sin(t * 0.04 + node.pulse) * 0.5 + 0.5
        const r = node.size

        /* pulse ring */
        ctx.beginPath()
        ctx.arc(node.x, node.y, r + 4 + pulse * 6, 0, Math.PI * 2)
        ctx.strokeStyle = `${node.color}${Math.round(pulse * 40).toString(16).padStart(2, '0')}`
        ctx.lineWidth = 1
        ctx.stroke()

        /* dot */
        ctx.beginPath()
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
        ctx.fillStyle = node.color
        ctx.shadowColor = node.color
        ctx.shadowBlur  = 8
        ctx.fill()
        ctx.shadowBlur  = 0

        /* label */
        ctx.fillStyle = `${node.color}cc`
        ctx.font = '9px monospace'
        ctx.fillText(node.network.ssid ?? node.network.bssid, node.x + r + 4, node.y + 4)
      })

      t++
      frameRef.current = requestAnimationFrame(draw)
    }

    frameRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frameRef.current)
  }, [scanning])

  /* hover hit-test */
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    let found: Network | null = null
    for (const node of nodesRef.current) {
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
      const dx = node.x - mx; const dy = node.y - my
      if (Math.sqrt(dx * dx + dy * dy) < node.size + 8) {
        setSelected(node.network)
        return
      }
    }
    setSelected(null)
  }

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
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
            {hovered.wps_enabled && <span className="text-[#ff6b35]">WPS</span>}
          </div>
        </div>
      )}

      {/* selected node panel */}
      {selected && (
        <div className="absolute bottom-4 left-4 bg-[#0a1a0a]/95 border border-[#2aff8a]/30 rounded p-3 text-[11px] w-64 z-20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[#2aff8a] font-bold tracking-wider">TARGET SELECTED</span>
            <button onClick={() => setSelected(null)} className="text-[#2aff8a]/40 hover:text-[#2aff8a]">✕</button>
          </div>
          <div className="text-[#2aff8a]/80 mb-1">{selected.ssid ?? '(hidden)'}</div>
          <div className="text-[#2aff8a]/50 text-[10px] mb-2">{selected.bssid}</div>
          <div className="grid grid-cols-3 gap-1 text-[10px] mb-3">
            {[
              ['CH', selected.channel ?? '?'],
              ['ENC', selected.encryption ?? 'OPEN'],
              ['PWR', `${selected.power ?? '?'}dBm`],
              ['WPS', selected.wps_enabled ? (selected.wps_locked ? 'LOCKED' : 'OPEN') : 'N/A'],
              ['CIPHER', selected.cipher ?? '?'],
              ['AUTH', selected.auth ?? '?'],
            ].map(([k, v]) => (
              <div key={k} className="bg-[#0d1f0d] rounded p-1">
                <div className="text-[#2aff8a]/40">{k}</div>
                <div className="text-[#2aff8a] font-bold">{String(v)}</div>
              </div>
            ))}
          </div>
          <button
            onClick={() => { onAttack(selected); setSelected(null) }}
            className="w-full bg-[#2aff8a]/10 border border-[#2aff8a]/40 hover:bg-[#2aff8a]/20 hover:border-[#2aff8a]/70 text-[#2aff8a] text-[10px] tracking-widest py-1.5 rounded transition-colors"
          >
            ⚡ INITIATE ATTACK
          </button>
        </div>
      )}
    </div>
  )
}
