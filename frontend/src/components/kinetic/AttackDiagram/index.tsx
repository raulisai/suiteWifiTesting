import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { Network } from '../../../types/network'
import { wsUrl } from '../../../api/client'

// TYPES

interface ScannedClient {
  mac: string
  bssid: string
  power: number | null
  packets: number
  probes: string[]
  last_seen: string
}

interface Packet {
  id: number
  fromX: number
  fromY: number
  toX: number
  toY: number
  progress: number
  type: 'deauth' | 'handshake' | 'probe'
}

interface LogEntry {
  id: number
  time: string
  type: 'info' | 'step' | 'warning' | 'error' | 'success'
  msg: string
}

type Phase = 'idle' | 'scanning' | 'attacking' | 'captured' | 'failed'

interface Props {
  network: Network
  selectedInterface: string
  onClose: () => void
  onHandshakeCaptured?: (hsId: number) => void
}

const SG     = '#2aff8a'
const CYAN   = '#00e5ff'
const ORANGE = '#ff8800'
const RED    = '#ff4444'

const VIEWBOX       = { width: 480, height: 300 }
const AP_POS        = { x: 240, y: 70 }
const ATTACKER_POS  = { x: 240, y: 250 }

function APIcon({ pulse }: { pulse?: boolean }) {
  return (
    <g>
      <circle r="40" fill="url(#apGlow)" opacity={pulse ? 0.9 : 0.5} />
      <rect x="-28" y="-14" width="56" height="28" rx="5"
        fill="rgba(42,255,138,0.08)" stroke={SG} strokeWidth="1.5" />
      <line x1="0" y1="-14" x2="0" y2="-30" stroke={SG} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="0" cy="-33" r="4" fill={SG} />
      {[1, 2, 3].map(i => (
        <path key={i}
          d={`M ${-10 - i*7},-26 Q 0,${-38 - i*5} ${10 + i*7},-26`}
          fill="none" stroke={SG} strokeWidth="1.5" strokeLinecap="round"
          opacity={0.8 - i * 0.2}
          className={pulse ? 'animate-pulse' : ''}
        />
      ))}
      <circle cx="-14" cy="1" r="3.5" fill={SG} className="animate-pulse" />
      <circle cx="-4"  cy="1" r="3.5" fill={CYAN} />
      <circle cx="6"   cy="1" r="3.5" fill={ORANGE} opacity="0.6" />
    </g>
  )
}

function ClientIcon({ selected, deauthing, signal }: { selected?: boolean; deauthing?: boolean; signal?: number }) {
  const bars  = signal ? Math.min(4, Math.max(1, Math.floor((signal + 90) / 15))) : 2
  const color = selected ? ORANGE : deauthing ? RED : SG
  return (
    <g style={{ cursor: 'pointer' }}>
      {selected && (
        <circle r="30" fill="none" stroke={ORANGE} strokeWidth="1.5" strokeDasharray="5,3"
          className="animate-spin" style={{ animationDuration: '9s' }} />
      )}
      {deauthing && (
        <>
          <circle r="26" fill="none" stroke={RED} strokeWidth="1.5" opacity="0.55">
            <animate attributeName="r" from="18" to="36" dur="0.9s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.7" to="0" dur="0.9s" repeatCount="indefinite" />
          </circle>
        </>
      )}
      <rect x="-19" y="-12" width="38" height="24" rx="4"
        fill={deauthing ? 'rgba(255,68,68,0.15)' : selected ? 'rgba(255,136,0,0.15)' : 'rgba(42,255,138,0.08)'}
        stroke={color} strokeWidth={selected ? 2 : 1.5} />
      <rect x="-13" y="-8" width="26" height="15" rx="2"
        fill={deauthing ? 'rgba(255,68,68,0.3)' : 'rgba(0,229,255,0.15)'}
        stroke={deauthing ? RED : CYAN} strokeWidth="1" opacity="0.8" />
      <g transform="translate(9,-5)">
        {[0,1,2,3].map(i => (
          <rect key={i} x={i*3.5} y={7-i*1.8} width="2" height={2+i*1.8}
            fill={i < bars ? color : 'rgba(255,255,255,0.08)'} rx="0.5" />
        ))}
      </g>
    </g>
  )
}

function AttackerIcon({ attacking }: { attacking?: boolean }) {
  return (
    <g>
      {attacking && (
        <circle r="38" fill="none" stroke={RED} strokeWidth="1.5" opacity="0.45">
          <animate attributeName="r" from="28" to="52" dur="1.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.65" to="0" dur="1.6s" repeatCount="indefinite" />
        </circle>
      )}
      <polygon points="0,-26 22,-13 22,13 0,26 -22,13 -22,-13"
        fill={attacking ? 'rgba(255,68,68,0.15)' : 'rgba(42,255,138,0.08)'}
        stroke={attacking ? RED : SG} strokeWidth="2" />
      <circle cx="0" cy="-4" r="9" fill="none" stroke={attacking ? RED : SG} strokeWidth="1.5" />
      <circle cx="-3.5" cy="-6" r="1.8" fill={attacking ? RED : SG} />
      <circle cx="3.5"  cy="-6" r="1.8" fill={attacking ? RED : SG} />
      <path d="M -2.5,0.5 L 0,3 L 2.5,0.5" fill="none" stroke={attacking ? RED : SG} strokeWidth="1.5" />
      <text y="17" textAnchor="middle" fontSize="6" fill={attacking ? RED : SG} fontFamily="monospace" opacity="0.75">
        {attacking ? 'ATTACKING' : 'READY'}
      </text>
    </g>
  )
}

function AnimatedPacket({ packet }: { packet: Packet }) {
  const x     = packet.fromX + (packet.toX - packet.fromX) * packet.progress
  const y     = packet.fromY + (packet.toY - packet.fromY) * packet.progress
  const color = packet.type === 'deauth' ? RED : packet.type === 'handshake' ? CYAN : SG
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r="4" fill={color} opacity={1 - packet.progress * 0.5}>
        <animate attributeName="r" from="3" to="6" dur="0.3s" repeatCount="indefinite" />
      </circle>
    </g>
  )
}

function signalPct(power: number | null | undefined): number {
  if (power == null) return 30
  return Math.max(0, Math.min(100, ((power + 30) / -65) * -100 + 100))
}
const QUALITY_COLORS = ['#ff4444', '#ff8800', '#ffcc00', '#2aff8a'] as const
function signalColor(pct: number): string {
  if (pct >= 70) return QUALITY_COLORS[3]
  if (pct >= 45) return QUALITY_COLORS[2]
  if (pct >= 25) return QUALITY_COLORS[1]
  return QUALITY_COLORS[0]
}

export function AttackDiagram({ network, selectedInterface, onClose, onHandshakeCaptured }: Props) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])
  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 360)
  }, [onClose])

  const [phase, setPhase] = useState<Phase>('idle')
  const [clients, setClients] = useState<ScannedClient[]>([])
  const [targetMac, setTargetMac] = useState<string | null>(null)
  const [deauthingMacs, setDeauthingMacs] = useState<Set<string>>(new Set())
  const [packets, setPackets] = useState<Packet[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [config, setConfig] = useState({ deauthCount: 64, maxRetries: 5 })
  const [wsAttempt, setWsAttempt] = useState(1)
  const [wsMaxAttempts, setWsMaxAttempts] = useState(5)
  const [scanProgress, setScanProgress] = useState(0)
  const [captureProgress, setCaptureProgress] = useState(0)
  const [activeTab, setActiveTab] = useState<'diagram' | 'logs'>('diagram')

  const packetIdRef     = useRef(0)
  const logIdRef        = useRef(0)
  const clientScanWsRef = useRef<WebSocket | null>(null)
  const attackWsRef     = useRef<WebSocket | null>(null)
  const animFrameRef    = useRef<number>(0)
  const logsEndRef      = useRef<HTMLDivElement>(null)

  const clientPositions = useMemo(() => {
    const n = clients.length
    if (n === 0) return []

    // Place clients in a horizontal band between AP (y=70) and Attacker (y=250).
    // Use a bottom-arc from the AP: angles 25°→155° so clients stay BELOW the AP
    // and never overlap the AP icon or the attacker icon.
    // For >6 clients use two staggered rows.
    const MAX_ROW = 6
    const ROW_GAP = 52

    return clients.map((client, i) => {
      const row  = Math.floor(i / MAX_ROW)
      const posInRow = i % MAX_ROW
      const rowSize  = Math.min(MAX_ROW, n - row * MAX_ROW)

      // Angle arc: 25° → 155° distributed across this row
      const arcStart = (25 * Math.PI) / 180
      const arcEnd   = (155 * Math.PI) / 180
      const angle = rowSize === 1
        ? Math.PI / 2                                              // single → centre
        : arcStart + (posInRow / (rowSize - 1)) * (arcEnd - arcStart)

      const xR = 175  // horizontal radius — uses most of the 480px width
      const yR = 85   // vertical radius — keeps clients away from AP & attacker

      const baseY = AP_POS.y + yR + 18 + row * ROW_GAP  // row 0 → ~173, row1 → ~225

      return {
        mac: client.mac,
        x: AP_POS.x + Math.cos(angle) * xR,
        y: baseY     + Math.sin(angle) * (yR * 0.25),   // small vertical wobble
        client,
      }
    })
  }, [clients])

  const addLog = useCallback((type: LogEntry['type'], msg: string) => {
    setLogs(prev => [...prev.slice(-200), {
      id: ++logIdRef.current,
      time: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type, msg,
    }])
  }, [])

  const addPacket = useCallback((fromX: number, fromY: number, toX: number, toY: number, type: Packet['type']) => {
    setPackets(prev => [...prev.slice(-40), {
      id: ++packetIdRef.current, fromX, fromY, toX, toY, progress: 0, type,
    }])
  }, [])

  useEffect(() => {
    const tick = () => {
      setPackets(prev => prev.map(p => ({ ...p, progress: Math.min(1, p.progress + 0.032) })).filter(p => p.progress < 1))
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [])

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  const startClientScan = useCallback(() => {
    if (!selectedInterface || !network.channel) return
    clientScanWsRef.current?.close()
    setPhase('scanning'); setScanProgress(0); setClients([])
    addLog('info', `Escaneando clientes en ${network.ssid || network.bssid} (CH${network.channel})...`)
    const ws = new WebSocket(wsUrl('/api/attacks/scan-clients'))
    clientScanWsRef.current = ws
    ws.onmessage = (msg) => {
      let ev: { type: string; message?: string; progress?: number; data?: ScannedClient }
      try { ev = JSON.parse(msg.data) } catch { return }
      if (ev.type === 'ready') {
        ws.send(JSON.stringify({ interface: selectedInterface, bssid: network.bssid, channel: network.channel, duration: 25 }))
      }
      if (ev.type === 'step') addLog('step', ev.message || '')
      if (ev.type === 'client' && ev.data) {
        const c = ev.data
        setClients(prev => {
          if (prev.find(x => x.mac === c.mac)) return prev
          addLog('success', `[+] ${c.mac}${c.power != null ? ` (${c.power} dBm)` : ''}${c.probes?.length ? ` → ${c.probes[0]}` : ''}`)
          return [...prev, c]
        })
      }
      if (ev.type === 'client_update' && ev.data) {
        setClients(prev => prev.map(c => c.mac === ev.data!.mac ? ev.data! : c))
      }
      if (ev.type === 'progress' && ev.progress !== undefined) setScanProgress(ev.progress)
      if (ev.type === 'done' || ev.type === 'error') {
        setPhase('idle')
        addLog(ev.type === 'done' ? 'success' : 'error', ev.message || 'Escaneo completado')
      }
    }
    ws.onerror = () => { setPhase('idle'); addLog('error', 'Error de conexión WebSocket') }
    ws.onclose = () => { setPhase(p => p === 'scanning' ? 'idle' : p) }
  }, [selectedInterface, network, addLog])

  // Auto-scan clients when the diagram opens (if interface & channel are available)
  useEffect(() => {
    if (selectedInterface && network.channel) {
      const t = setTimeout(() => startClientScan(), 400)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startAttack = useCallback(() => {
    if (!selectedInterface || !network.channel) return
    setPhase('attacking'); setCaptureProgress(0); setWsAttempt(1)
    addLog('info', `Iniciando ataque a ${network.ssid || network.bssid}`)
    const ws = new WebSocket(wsUrl('/api/attacks/handshake'))
    attackWsRef.current = ws
    ws.onmessage = (msg) => {
      let ev: { type: string; message?: string; attempt?: number; max_retries?: number; progress?: number; data?: Record<string, unknown> }
      try { ev = JSON.parse(msg.data) } catch { return }
      switch (ev.type) {
        case 'ready':
          ws.send(JSON.stringify({ interface: selectedInterface, bssid: network.bssid, channel: network.channel, client_mac: targetMac, deauth_count: config.deauthCount, max_retries: config.maxRetries }))
          break
        case 'step':
          addLog('step', ev.message || '')
          if (ev.attempt !== undefined) { setWsAttempt(ev.attempt); setWsMaxAttempts(ev.max_retries || config.maxRetries) }
          if (ev.message?.toLowerCase().includes('deauth')) {
            if (targetMac) {
              const target = clientPositions.find(c => c.mac === targetMac)
              if (target) { addPacket(ATTACKER_POS.x, ATTACKER_POS.y, target.x, target.y, 'deauth'); setDeauthingMacs(new Set([targetMac])); setTimeout(() => setDeauthingMacs(new Set()), 1500) }
            } else {
              clientPositions.forEach((c, i) => { setTimeout(() => { addPacket(ATTACKER_POS.x, ATTACKER_POS.y, c.x, c.y, 'deauth') }, i * 100) })
              setDeauthingMacs(new Set(clients.map(c => c.mac))); setTimeout(() => setDeauthingMacs(new Set()), 2000)
            }
          }
          break
        case 'output': case 'warning': addLog(ev.type === 'warning' ? 'warning' : 'info', ev.message || ''); break
        case 'progress': if (ev.progress !== undefined) setCaptureProgress(ev.progress); break
        case 'handshake':
          setPhase('captured'); addLog('success', 'HANDSHAKE CAPTURADO!')
          clientPositions.forEach((c, i) => { setTimeout(() => { addPacket(c.x, c.y, ATTACKER_POS.x, ATTACKER_POS.y, 'handshake') }, i * 200) })
          if (ev.data?.handshake_id && onHandshakeCaptured) onHandshakeCaptured(ev.data.handshake_id as number)
          break
        case 'error': setPhase('failed'); addLog('error', ev.message || 'Error en captura'); break
        case 'done': if (phase !== 'captured') setPhase('idle'); addLog('info', ev.message || 'Ataque finalizado'); break
      }
    }
    ws.onerror = () => { setPhase('failed'); addLog('error', 'Error de conexion WebSocket') }
  }, [selectedInterface, network, targetMac, config, clientPositions, clients, phase, addLog, addPacket, onHandshakeCaptured])

  const stopAttack = useCallback(() => {
    attackWsRef.current?.close(); clientScanWsRef.current?.close()
    setPhase('idle'); addLog('warning', 'Ataque detenido por el usuario')
  }, [addLog])

  useEffect(() => {
    return () => { attackWsRef.current?.close(); clientScanWsRef.current?.close(); cancelAnimationFrame(animFrameRef.current) }
  }, [])

  const sortedClients = [...clients].sort((a, b) => (b.power ?? -100) - (a.power ?? -100))
  const phaseColor  = phase === 'attacking' ? RED : phase === 'captured' ? CYAN : phase === 'failed' ? RED : SG
  const phaseLabel  = phase === 'idle' ? 'LISTO' : phase === 'scanning' ? 'ESCANEANDO' : phase === 'attacking' ? `ATACANDO ${wsAttempt}/${wsMaxAttempts}` : phase === 'captured' ? 'HANDSHAKE OK' : 'FALLIDO'
  const progress    = phase === 'scanning' ? scanProgress : phase === 'attacking' ? captureProgress : 0

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col"
      style={{
        background: 'rgba(3,6,10,0.97)', backdropFilter: 'blur(16px)',
        transition: 'opacity 360ms cubic-bezier(0.4,0,0.2,1), transform 360ms cubic-bezier(0.4,0,0.2,1)',
        opacity: visible ? 1 : 0, transform: visible ? 'scale(1)' : 'scale(0.96)',
        transformOrigin: 'center center',
      }}
    >
      {/* HEADER */}
      <div className="flex items-center gap-3 px-4 py-2.5 shrink-0" style={{ borderBottom: '1px solid rgba(42,255,138,0.08)', background: 'rgba(0,0,0,0.35)' }}>
        <button onClick={handleClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded font-bold text-[10px] tracking-widest transition-all shrink-0"
          style={{ background: 'rgba(42,255,138,0.06)', border: '1px solid rgba(42,255,138,0.22)', color: 'rgba(42,255,138,0.75)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(42,255,138,0.14)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(42,255,138,0.06)' }}>
          &lt; RADAR
        </button>
        <div style={{ width: 1, height: 16, background: 'rgba(42,255,138,0.12)', flexShrink: 0 }} />
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[11px] font-bold tracking-[0.18em] truncate" style={{ color: SG, textShadow: '0 0 12px rgba(42,255,138,0.5)' }}>
            {network.ssid || 'HIDDEN NETWORK'}
          </span>
          <span className="text-[8px] font-mono shrink-0 hidden sm:inline" style={{ color: 'rgba(42,255,138,0.35)' }}>
            {network.bssid} &middot; CH{network.channel} &middot; {network.encryption || 'OPEN'}
          </span>
        </div>
        <div className="px-2.5 py-1 rounded font-bold text-[9px] tracking-widest shrink-0 transition-all duration-300"
          style={{ background: `${phaseColor}18`, border: `1px solid ${phaseColor}35`, color: phaseColor }}>
          {phaseLabel}
        </div>
        <div className="px-2 py-1 rounded text-[8px] font-mono shrink-0" style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.15)', color: 'rgba(0,229,255,0.6)' }}>
          {selectedInterface}
        </div>
      </div>

      {/* PROGRESS BAR */}
      <div className="h-0.5 shrink-0" style={{ background: 'rgba(0,0,0,0.5)' }}>
        <div className="h-full transition-all duration-500" style={{ width: `${progress}%`, background: phase === 'scanning' ? CYAN : phase === 'attacking' ? ORANGE : 'transparent', boxShadow: progress > 0 ? `0 0 8px ${phase === 'scanning' ? CYAN : ORANGE}` : 'none' }} />
      </div>

      {/* MAIN BODY */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* LEFT: device list */}
        <div className="w-60 flex flex-col shrink-0" style={{ borderRight: '1px solid rgba(42,255,138,0.07)' }}>
          <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ borderBottom: '1px solid rgba(0,229,255,0.08)', background: 'rgba(0,229,255,0.03)' }}>
            <span className="text-[9px] font-bold tracking-[0.2em] flex-1" style={{ color: 'rgba(0,229,255,0.6)' }}>DISPOSITIVOS</span>
            {clients.length > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold" style={{ background: 'rgba(0,229,255,0.12)', color: CYAN }}>{clients.length}</span>
            )}
            <button onClick={startClientScan} disabled={phase === 'attacking' || phase === 'scanning'}
              className="px-2 py-1 rounded text-[8px] font-bold tracking-widest transition-all disabled:opacity-30"
              style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.25)', color: CYAN }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,229,255,0.16)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,229,255,0.08)' }}>
              {phase === 'scanning' ? 'SCAN...' : clients.length > 0 ? 'RESCAN' : 'SCAN'}
            </button>
          </div>

          {phase === 'scanning' && (
            <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid rgba(0,229,255,0.06)' }}>
              <div className="flex justify-between text-[7px] mb-1" style={{ color: 'rgba(0,229,255,0.4)' }}>
                <span>Escaneando...</span><span>{scanProgress}%</span>
              </div>
              <div className="h-1 rounded overflow-hidden" style={{ background: 'rgba(0,229,255,0.07)' }}>
                <div className="h-full transition-all duration-300" style={{ width: `${scanProgress}%`, background: CYAN, boxShadow: `0 0 6px ${CYAN}` }} />
              </div>
            </div>
          )}

          {/* Broadcast row */}
          <button onClick={() => setTargetMac(null)} className="flex items-center gap-2 px-3 py-2 text-left transition-all shrink-0"
            style={{ background: targetMac === null ? 'rgba(255,136,0,0.10)' : 'transparent', borderBottom: '1px solid rgba(42,255,138,0.05)', borderLeft: targetMac === null ? `2px solid ${ORANGE}` : '2px solid transparent' }}>
            <span style={{ color: targetMac === null ? ORANGE : 'rgba(255,255,255,0.2)', fontSize: 12 }}>{targetMac === null ? '\u25C9' : '\u25CB'}</span>
            <span className="text-[8px] font-bold tracking-wider" style={{ color: targetMac === null ? ORANGE : 'rgba(255,255,255,0.3)' }}>BROADCAST</span>
            <span className="text-[7px] ml-auto" style={{ color: 'rgba(255,136,0,0.35)' }}>todos</span>
          </button>

          {/* All clients scrollable */}
          <div className="flex-1 overflow-y-auto">
            {sortedClients.length === 0 && phase !== 'scanning' && (
              <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
                <span style={{ fontSize: 24, color: 'rgba(0,229,255,0.15)' }}>\u25CE</span>
                <span className="text-[8px] leading-relaxed" style={{ color: 'rgba(0,229,255,0.25)' }}>Pulsa SCAN para descubrir dispositivos conectados</span>
              </div>
            )}
            {sortedClients.map((c, idx) => {
              const pct     = signalPct(c.power)
              const sColor  = signalColor(pct)
              const isTarget = targetMac === c.mac
              const probe   = c.probes?.[0]
              return (
                <button key={c.mac} onClick={() => setTargetMac(isTarget ? null : c.mac)}
                  className="w-full flex items-start gap-2 px-3 py-2 text-left transition-all"
                  style={{
                    background: isTarget ? 'rgba(255,136,0,0.10)' : idx % 2 === 0 ? 'rgba(42,255,138,0.015)' : 'transparent',
                    borderBottom: '1px solid rgba(42,255,138,0.045)',
                    borderLeft: isTarget ? `2px solid ${ORANGE}` : '2px solid transparent',
                  }}
                  onMouseEnter={e => { if (!isTarget) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(42,255,138,0.06)' }}
                  onMouseLeave={e => { if (!isTarget) (e.currentTarget as HTMLButtonElement).style.background = isTarget ? 'rgba(255,136,0,0.10)' : idx % 2 === 0 ? 'rgba(42,255,138,0.015)' : 'transparent' }}>
                  <span className="mt-0.5 shrink-0 text-[10px]" style={{ color: isTarget ? ORANGE : 'rgba(42,255,138,0.3)' }}>
                    {isTarget ? '\u25C9' : '\u25CB'}
                  </span>
                  <div className="flex-1 min-w-0">
                    {/* MAC + signal dBm */}
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-mono text-[8px] font-bold truncate" style={{ color: isTarget ? ORANGE : 'rgba(42,255,138,0.80)' }}>
                        {c.mac}
                      </span>
                      <span className="ml-auto text-[7px] font-mono shrink-0 tabular-nums" style={{ color: sColor }}>
                        {c.power ?? '?'} dBm
                      </span>
                    </div>
                    {/* Signal bar */}
                    <div className="h-1 rounded overflow-hidden mb-0.5" style={{ background: 'rgba(42,255,138,0.07)' }}>
                      <div className="h-full rounded transition-all duration-500" style={{ width: `${pct}%`, background: sColor, boxShadow: isTarget ? `0 0 4px ${sColor}` : 'none' }} />
                    </div>
                    {/* Packets + probe hint */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[7px] font-mono" style={{ color: 'rgba(42,255,138,0.25)' }}>{c.packets} pkts</span>
                      {probe && (
                        <span className="text-[7px] truncate max-w-[90px]" style={{ color: 'rgba(0,229,255,0.35)' }}>
                          ↝ {probe}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {targetMac && (
            <div className="px-3 py-2 shrink-0" style={{ borderTop: '1px solid rgba(255,136,0,0.15)', background: 'rgba(255,136,0,0.06)' }}>
              <div className="text-[7px] tracking-widest mb-1" style={{ color: 'rgba(255,136,0,0.45)' }}>OBJETIVO</div>
              <div className="font-mono text-[9px] font-bold truncate" style={{ color: ORANGE }}>{targetMac}</div>
              <button onClick={() => setTargetMac(null)} className="text-[7px] mt-1 transition-all" style={{ color: 'rgba(255,136,0,0.35)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,136,0,0.7)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,136,0,0.35)' }}>
                x cambiar a broadcast
              </button>
            </div>
          )}
        </div>

        {/* CENTER: diagram + logs tabs */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex shrink-0" style={{ borderBottom: '1px solid rgba(42,255,138,0.07)' }}>
            {(['diagram', 'logs'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className="px-4 py-2 text-[9px] font-bold tracking-widest transition-all"
                style={{ color: activeTab === tab ? SG : 'rgba(42,255,138,0.3)', background: activeTab === tab ? 'rgba(42,255,138,0.06)' : 'transparent', borderBottom: activeTab === tab ? `1px solid ${SG}` : '1px solid transparent' }}>
                {tab === 'diagram' ? 'DIAGRAMA' : `TERMINAL (${logs.length})`}
              </button>
            ))}
            {phase === 'attacking' && (
              <div className="ml-auto flex items-center pr-3 gap-1.5">
                <span className="text-[8px] font-mono" style={{ color: ORANGE }}>INT. {wsAttempt}/{wsMaxAttempts}</span>
              </div>
            )}
          </div>

          {activeTab === 'diagram' && (
            <div className="flex-1 relative">
              <svg viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`} className="w-full h-full" style={{ display: 'block' }}>
                <defs>
                  <radialGradient id="apGlow">
                    <stop offset="0%" stopColor={SG} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={SG} stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="attackerGlow">
                    <stop offset="0%" stopColor={phase === 'attacking' ? RED : SG} stopOpacity="0.22" />
                    <stop offset="100%" stopColor={phase === 'attacking' ? RED : SG} stopOpacity="0" />
                  </radialGradient>
                  <pattern id="svgGrid" width="30" height="30" patternUnits="userSpaceOnUse">
                    <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(42,255,138,0.03)" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#svgGrid)" />
                {clientPositions.map(({ mac, x, y }) => (
                  <line key={`line-${mac}`} x1={x} y1={y} x2={AP_POS.x} y2={AP_POS.y}
                    stroke={targetMac === mac ? ORANGE : deauthingMacs.has(mac) ? RED : 'rgba(42,255,138,0.10)'}
                    strokeWidth={targetMac === mac ? 2 : 1} strokeDasharray={deauthingMacs.has(mac) ? '4,4' : 'none'} />
                ))}
                {phase === 'attacking' && (
                  <line x1={ATTACKER_POS.x} y1={ATTACKER_POS.y} x2={AP_POS.x} y2={AP_POS.y}
                    stroke="rgba(255,68,68,0.22)" strokeWidth="2" strokeDasharray="8,4" />
                )}
                <g transform={`translate(${AP_POS.x}, ${AP_POS.y})`}>
                  <APIcon pulse={phase === 'attacking'} />
                  <text y="52" textAnchor="middle" fontSize="8" fill={SG} fontFamily="monospace" opacity="0.7">ACCESS POINT</text>
                  <text y="63" textAnchor="middle" fontSize="7" fill="rgba(42,255,138,0.35)" fontFamily="monospace">{network.ssid ?? network.bssid}</text>
                </g>
                {clientPositions.map(({ mac, x, y, client }) => (
                  <g key={mac} transform={`translate(${x}, ${y})`} onClick={() => setTargetMac(targetMac === mac ? null : mac)}>
                    <ClientIcon selected={targetMac === mac} deauthing={deauthingMacs.has(mac)} signal={client.power ?? undefined} />
                    <text y="26" textAnchor="middle" fontSize="6" fill={targetMac === mac ? ORANGE : 'rgba(42,255,138,0.45)'} fontFamily="monospace">{mac.slice(-8)}</text>
                    <text y="34" textAnchor="middle" fontSize="6" fill="rgba(42,255,138,0.22)" fontFamily="monospace">{client.packets}p</text>
                  </g>
                ))}
                <g transform={`translate(${ATTACKER_POS.x}, ${ATTACKER_POS.y})`}>
                  <circle r="46" fill="url(#attackerGlow)" />
                  <AttackerIcon attacking={phase === 'attacking'} />
                  <text y="42" textAnchor="middle" fontSize="7" fill={phase === 'attacking' ? RED : SG} fontFamily="monospace" opacity="0.7">{selectedInterface}</text>
                </g>
                {packets.map(pkt => <AnimatedPacket key={pkt.id} packet={pkt} />)}
                {phase === 'captured' && (
                  <g transform={`translate(${VIEWBOX.width / 2}, ${VIEWBOX.height / 2 - 10})`}>
                    <rect x="-90" y="-28" width="180" height="56" rx="10" fill="rgba(0,229,255,0.12)" stroke={CYAN} strokeWidth="1.5" />
                    <text y="-8" textAnchor="middle" fontSize="12" fill={CYAN} fontWeight="bold" fontFamily="monospace">HANDSHAKE CAPTURED</text>
                    <text y="12" textAnchor="middle" fontSize="8" fill="rgba(0,229,255,0.55)" fontFamily="monospace">Listo para crackear</text>
                  </g>
                )}
                {clients.length === 0 && phase === 'idle' && (
                  <text x={VIEWBOX.width / 2} y={VIEWBOX.height / 2 + 20} textAnchor="middle" fontSize="9" fill="rgba(42,255,138,0.18)" fontFamily="monospace">
                    Escanea clientes en el panel izquierdo
                  </text>
                )}
              </svg>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="flex-1 overflow-y-auto p-3 font-mono text-[8px] space-y-0.5" style={{ background: 'rgba(0,0,0,0.25)' }}>
              {logs.length === 0 && <div className="text-center py-8" style={{ color: 'rgba(42,255,138,0.15)' }}>AWAITING TASK</div>}
              {logs.map(log => (
                <div key={log.id} className="flex gap-2 leading-relaxed">
                  <span style={{ color: 'rgba(42,255,138,0.22)', minWidth: 56 }}>{log.time}</span>
                  <span style={{ color: log.type === 'error' ? RED : log.type === 'warning' ? ORANGE : log.type === 'success' ? SG : log.type === 'step' ? CYAN : 'rgba(42,255,138,0.5)' }}>
                    {log.type === 'error' ? 'x' : log.type === 'success' ? 'v' : log.type === 'warning' ? '!' : '>'} {log.msg}
                  </span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>

        {/* RIGHT: Direct attack controls */}
        <div className="w-60 flex flex-col shrink-0" style={{ borderLeft: '1px solid rgba(42,255,138,0.07)' }}>
          <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid rgba(255,68,68,0.10)', background: 'rgba(255,68,68,0.04)' }}>
            <div className="text-[9px] font-bold tracking-[0.2em]" style={{ color: 'rgba(255,68,68,0.65)' }}>ATAQUE DIRECTO</div>
            <div className="text-[7px] mt-0.5" style={{ color: 'rgba(255,68,68,0.30)' }}>
              {targetMac ? `-> ${targetMac.slice(-8)}` : 'BROADCAST'}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            <div>
              <div className="text-[7px] font-bold tracking-wider mb-2" style={{ color: 'rgba(42,255,138,0.35)' }}>DEAUTH / BURST</div>
              <div className="grid grid-cols-4 gap-1">
                {[16, 32, 64, 128].map(v => (
                  <button key={v} onClick={() => setConfig(c => ({ ...c, deauthCount: v }))} disabled={phase === 'attacking'}
                    className="py-1.5 rounded text-[8px] font-mono font-bold transition-all disabled:opacity-30"
                    style={{ background: config.deauthCount === v ? 'rgba(42,255,138,0.14)' : 'transparent', border: `1px solid ${config.deauthCount === v ? 'rgba(42,255,138,0.45)' : 'rgba(42,255,138,0.10)'}`, color: config.deauthCount === v ? SG : 'rgba(42,255,138,0.35)' }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[7px] font-bold tracking-wider mb-2" style={{ color: 'rgba(42,255,138,0.35)' }}>MAX REINTENTOS</div>
              <div className="grid grid-cols-4 gap-1">
                {[1, 3, 5, 10].map(v => (
                  <button key={v} onClick={() => setConfig(c => ({ ...c, maxRetries: v }))} disabled={phase === 'attacking'}
                    className="py-1.5 rounded text-[8px] font-mono font-bold transition-all disabled:opacity-30"
                    style={{ background: config.maxRetries === v ? 'rgba(42,255,138,0.14)' : 'transparent', border: `1px solid ${config.maxRetries === v ? 'rgba(42,255,138,0.45)' : 'rgba(42,255,138,0.10)'}`, color: config.maxRetries === v ? SG : 'rgba(42,255,138,0.35)' }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded p-2 font-mono text-[7px] leading-relaxed" style={{ background: 'rgba(0,0,0,0.35)', color: 'rgba(42,255,138,0.22)', border: '1px solid rgba(42,255,138,0.06)' }}>
              <div>$ aireplay-ng -0 {config.deauthCount} \</div>
              <div className="pl-2">-a {network.bssid} \</div>
              {targetMac && <div className="pl-2">-c {targetMac} \</div>}
              <div className="pl-2">{selectedInterface}</div>
            </div>
            {(phase === 'attacking' || phase === 'scanning') && (
              <div className="rounded p-2.5" style={{ background: `${phaseColor}08`, border: `1px solid ${phaseColor}22` }}>
                <div className="text-[8px] font-bold tracking-wider" style={{ color: phaseColor }}>{phaseLabel}</div>
                {phase === 'attacking' && (
                  <div className="mt-1.5 h-1 rounded overflow-hidden" style={{ background: `${ORANGE}15` }}>
                    <div className="h-full transition-all duration-500" style={{ width: `${captureProgress}%`, background: ORANGE }} />
                  </div>
                )}
              </div>
            )}
            {phase === 'captured' && (
              <div className="rounded p-3 text-center" style={{ background: 'rgba(0,229,255,0.08)', border: `1px solid ${CYAN}30` }}>
                <div className="text-[9px] font-bold" style={{ color: CYAN }}>HANDSHAKE CAPTURADO</div>
                <div className="text-[7px] mt-1" style={{ color: 'rgba(0,229,255,0.45)' }}>Guardado en Credenciales</div>
              </div>
            )}
            {phase === 'failed' && (
              <div className="rounded p-3 text-center" style={{ background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.25)' }}>
                <div className="text-[9px] font-bold" style={{ color: RED }}>CAPTURA FALLIDA</div>
                <button onClick={() => { setPhase('idle'); setWsAttempt(1) }} className="mt-2 px-3 py-1 rounded text-[8px] transition-all"
                  style={{ border: '1px solid rgba(255,68,68,0.3)', color: RED }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,68,68,0.10)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
                  REINTENTAR
                </button>
              </div>
            )}
          </div>

          <div className="p-3 space-y-2 shrink-0" style={{ borderTop: '1px solid rgba(42,255,138,0.07)' }}>
            {phase === 'attacking' ? (
              <button onClick={stopAttack} className="w-full py-3 rounded font-bold text-[10px] tracking-[0.2em] transition-all"
                style={{ background: 'rgba(255,68,68,0.14)', border: '1px solid rgba(255,68,68,0.45)', color: RED, boxShadow: '0 0 16px rgba(255,68,68,0.12)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,68,68,0.24)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,68,68,0.14)' }}>
                DETENER ATAQUE
              </button>
            ) : (
              <button onClick={startAttack} disabled={phase === 'scanning' || phase === 'captured'}
                className="w-full py-3 rounded font-bold text-[10px] tracking-[0.2em] transition-all disabled:opacity-30"
                style={{ background: targetMac ? 'rgba(255,136,0,0.14)' : 'rgba(255,68,68,0.10)', border: `1px solid ${targetMac ? 'rgba(255,136,0,0.45)' : 'rgba(255,68,68,0.35)'}`, color: targetMac ? ORANGE : 'rgba(255,110,110,0.92)', boxShadow: `0 0 18px ${targetMac ? 'rgba(255,136,0,0.08)' : 'rgba(255,68,68,0.08)'}` }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = targetMac ? 'rgba(255,136,0,0.22)' : 'rgba(255,68,68,0.18)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = targetMac ? 'rgba(255,136,0,0.14)' : 'rgba(255,68,68,0.10)' }}>
                {targetMac ? `ATACAR ${targetMac.slice(-8)}` : 'INICIAR ATAQUE'}
              </button>
            )}
            {phase === 'captured' && (
              <button onClick={handleClose} className="w-full py-2 rounded font-bold text-[9px] tracking-wider transition-all"
                style={{ background: 'rgba(0,229,255,0.10)', border: `1px solid ${CYAN}30`, color: CYAN }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,229,255,0.18)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,229,255,0.10)' }}>
                CONTINUAR AL CRACKING
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AttackDiagram
