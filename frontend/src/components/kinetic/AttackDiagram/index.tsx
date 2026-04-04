import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { Network } from '../../../types/network'
import { wsUrl } from '../../../api/client'

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface ScannedClient {
  mac: string
  bssid: string
  power: number | null
  packets: number
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

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const SG = '#2aff8a'
const CYAN = '#00e5ff'
const ORANGE = '#ff8800'
const RED = '#ff4444'

const VIEWBOX = { width: 500, height: 340 }
const AP_POS = { x: 250, y: 80 }
const ATTACKER_POS = { x: 250, y: 280 }
const CLIENT_RADIUS = 100

// ═══════════════════════════════════════════════════════════════════════════════
// SVG ICONS
// ═══════════════════════════════════════════════════════════════════════════════

function APIcon({ pulse }: { pulse?: boolean }) {
  return (
    <g>
      {/* Glow effect */}
      <circle r="45" fill="url(#apGlow)" opacity={pulse ? 0.8 : 0.4} />

      {/* Router body */}
      <rect x="-32" y="-16" width="64" height="32" rx="6"
        fill="rgba(42,255,138,0.08)" stroke={SG} strokeWidth="2" />

      {/* Antenna */}
      <line x1="0" y1="-16" x2="0" y2="-35" stroke={SG} strokeWidth="3" strokeLinecap="round" />
      <circle cx="0" cy="-38" r="5" fill={SG} />

      {/* Signal waves */}
      {[1, 2, 3].map(i => (
        <path key={i}
          d={`M ${-12 - i*8},-30 Q 0,${-42 - i*6} ${12 + i*8},-30`}
          fill="none" stroke={SG} strokeWidth="2" strokeLinecap="round"
          opacity={0.8 - i * 0.2}
          className={pulse ? 'animate-pulse' : ''}
        />
      ))}

      {/* LED lights */}
      <circle cx="-18" cy="0" r="4" fill={SG} className="animate-pulse" />
      <circle cx="-6" cy="0" r="4" fill={CYAN} />
      <circle cx="6" cy="0" r="4" fill={ORANGE} opacity="0.5" />

      {/* Ethernet ports */}
      <rect x="14" y="-6" width="10" height="12" rx="1" fill="rgba(0,0,0,0.5)" stroke={SG} strokeWidth="1" opacity="0.5" />
    </g>
  )
}

function ClientIcon({ selected, deauthing, signal }: { selected?: boolean; deauthing?: boolean; signal?: number }) {
  const signalStrength = signal ? Math.min(4, Math.max(1, Math.floor((signal + 90) / 15))) : 2
  const color = selected ? ORANGE : deauthing ? RED : SG

  return (
    <g style={{ cursor: 'pointer' }}>
      {/* Selection ring */}
      {selected && (
        <circle r="35" fill="none" stroke={ORANGE} strokeWidth="2" strokeDasharray="6,3"
          className="animate-spin" style={{ animationDuration: '8s' }} />
      )}

      {/* Deauth effect */}
      {deauthing && (
        <>
          <circle r="30" fill="none" stroke={RED} strokeWidth="2" opacity="0.6">
            <animate attributeName="r" from="20" to="40" dur="0.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.8" to="0" dur="0.8s" repeatCount="indefinite" />
          </circle>
          <text y="-25" textAnchor="middle" fontSize="14" fill={RED}>✕</text>
        </>
      )}

      {/* Device body (laptop style) */}
      <rect x="-22" y="-14" width="44" height="28" rx="4"
        fill={deauthing ? 'rgba(255,68,68,0.15)' : selected ? 'rgba(255,136,0,0.15)' : 'rgba(42,255,138,0.08)'}
        stroke={color} strokeWidth={selected ? 2 : 1.5} />

      {/* Screen */}
      <rect x="-16" y="-10" width="32" height="18" rx="2"
        fill={deauthing ? 'rgba(255,68,68,0.3)' : 'rgba(0,229,255,0.15)'}
        stroke={deauthing ? RED : CYAN} strokeWidth="1" opacity="0.8" />

      {/* Signal bars */}
      <g transform="translate(12, -6)">
        {[0, 1, 2, 3].map(i => (
          <rect key={i} x={i * 4} y={8 - i * 2} width="2" height={2 + i * 2}
            fill={i < signalStrength ? color : 'rgba(255,255,255,0.1)'} rx="0.5" />
        ))}
      </g>
    </g>
  )
}

function AttackerIcon({ attacking }: { attacking?: boolean }) {
  return (
    <g>
      {/* Attack pulse effect */}
      {attacking && (
        <circle r="40" fill="none" stroke={RED} strokeWidth="2" opacity="0.5">
          <animate attributeName="r" from="30" to="55" dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.7" to="0" dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Hexagon body */}
      <polygon points="0,-28 24,-14 24,14 0,28 -24,14 -24,-14"
        fill={attacking ? 'rgba(255,68,68,0.15)' : 'rgba(42,255,138,0.08)'}
        stroke={attacking ? RED : SG} strokeWidth="2" />

      {/* Skull/hacker icon */}
      <circle cx="0" cy="-5" r="10" fill="none" stroke={attacking ? RED : SG} strokeWidth="2" />
      <circle cx="-4" cy="-7" r="2" fill={attacking ? RED : SG} />
      <circle cx="4" cy="-7" r="2" fill={attacking ? RED : SG} />
      <path d="M -3,0 L 0,3 L 3,0" fill="none" stroke={attacking ? RED : SG} strokeWidth="1.5" />

      {/* Terminal lines */}
      <text y="18" textAnchor="middle" fontSize="7" fill={attacking ? RED : SG} fontFamily="monospace" opacity="0.7">
        {attacking ? 'ATTACKING' : 'READY'}
      </text>
    </g>
  )
}

function AnimatedPacket({ packet }: { packet: Packet }) {
  const x = packet.fromX + (packet.toX - packet.fromX) * packet.progress
  const y = packet.fromY + (packet.toY - packet.fromY) * packet.progress
  const color = packet.type === 'deauth' ? RED : packet.type === 'handshake' ? CYAN : SG

  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r="4" fill={color} opacity={1 - packet.progress * 0.5}>
        <animate attributeName="r" from="3" to="6" dur="0.3s" repeatCount="indefinite" />
      </circle>
      {packet.type === 'deauth' && (
        <text y="1" textAnchor="middle" fontSize="6" fill="white" fontWeight="bold">!</text>
      )}
      {packet.type === 'handshake' && (
        <text y="2" textAnchor="middle" fontSize="5" fill="white">HS</text>
      )}
    </g>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function AttackDiagram({ network, selectedInterface, onClose, onHandshakeCaptured }: Props) {
  // State
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

  // Refs
  const packetIdRef = useRef(0)
  const logIdRef = useRef(0)
  const clientScanWsRef = useRef<WebSocket | null>(null)
  const attackWsRef = useRef<WebSocket | null>(null)
  const animFrameRef = useRef<number>(0)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Calculate client positions in orbit around AP
  const clientPositions = useMemo(() => {
    return clients.map((client, i, arr) => {
      const angle = (i / Math.max(arr.length, 1)) * Math.PI * 2 - Math.PI / 2
      return {
        mac: client.mac,
        x: AP_POS.x + Math.cos(angle) * CLIENT_RADIUS,
        y: AP_POS.y + 50 + Math.sin(angle) * (CLIENT_RADIUS * 0.6),
        client
      }
    })
  }, [clients])

  // Add log entry
  const addLog = useCallback((type: LogEntry['type'], msg: string) => {
    setLogs(prev => [...prev.slice(-100), {
      id: ++logIdRef.current,
      time: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type,
      msg
    }])
  }, [])

  // Add packet animation
  const addPacket = useCallback((fromX: number, fromY: number, toX: number, toY: number, type: Packet['type']) => {
    setPackets(prev => [...prev.slice(-30), {
      id: ++packetIdRef.current,
      fromX, fromY, toX, toY,
      progress: 0,
      type
    }])
  }, [])

  // Animation loop
  useEffect(() => {
    const tick = () => {
      setPackets(prev => prev
        .map(p => ({ ...p, progress: Math.min(1, p.progress + 0.035) }))
        .filter(p => p.progress < 1)
      )
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [])

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Start client scan
  const startClientScan = useCallback(() => {
    if (!selectedInterface || !network.channel) return
    setPhase('scanning')
    setScanProgress(0)
    setClients([])
    addLog('info', `Escaneando clientes en ${network.ssid || network.bssid}...`)

    const ws = new WebSocket(wsUrl('/api/attacks/scan-clients'))
    clientScanWsRef.current = ws

    ws.onmessage = (msg) => {
      let ev: { type: string; message?: string; progress?: number; data?: ScannedClient }
      try { ev = JSON.parse(msg.data) } catch { return }

      if (ev.type === 'ready') {
        ws.send(JSON.stringify({
          interface: selectedInterface,
          bssid: network.bssid,
          channel: network.channel,
          duration: 20
        }))
      }
      if (ev.type === 'step') addLog('step', ev.message || '')
      if (ev.type === 'client' && ev.data) {
        setClients(prev => {
          if (prev.find(c => c.mac === ev.data!.mac)) return prev
          addLog('success', `Cliente detectado: ${ev.data!.mac}`)
          return [...prev, ev.data!]
        })
      }
      if (ev.type === 'client_update' && ev.data) {
        setClients(prev => prev.map(c => c.mac === ev.data!.mac ? ev.data! : c))
      }
      if (ev.type === 'progress' && ev.progress !== undefined) {
        setScanProgress(ev.progress)
      }
      if (ev.type === 'done' || ev.type === 'error') {
        setPhase('idle')
        addLog(ev.type === 'done' ? 'success' : 'error', ev.message || 'Escaneo completado')
      }
    }
    ws.onerror = () => { setPhase('idle'); addLog('error', 'Error de conexión') }
  }, [selectedInterface, network, addLog])

  // Start attack
  const startAttack = useCallback(() => {
    if (!selectedInterface || !network.channel) return
    setPhase('attacking')
    setCaptureProgress(0)
    setWsAttempt(1)
    addLog('info', `Iniciando ataque a ${network.ssid || network.bssid}`)

    const ws = new WebSocket(wsUrl('/api/attacks/handshake'))
    attackWsRef.current = ws

    ws.onmessage = (msg) => {
      let ev: { type: string; message?: string; attempt?: number; max_retries?: number; progress?: number; data?: Record<string, unknown> }
      try { ev = JSON.parse(msg.data) } catch { return }

      switch (ev.type) {
        case 'ready':
          ws.send(JSON.stringify({
            interface: selectedInterface,
            bssid: network.bssid,
            channel: network.channel,
            client_mac: targetMac,
            deauth_count: config.deauthCount,
            max_retries: config.maxRetries,
          }))
          break
        case 'step':
          addLog('step', ev.message || '')
          if (ev.attempt !== undefined) {
            setWsAttempt(ev.attempt)
            setWsMaxAttempts(ev.max_retries || config.maxRetries)
          }
          // Trigger deauth animation on deauth step
          if (ev.message?.toLowerCase().includes('deauth')) {
            if (targetMac) {
              const target = clientPositions.find(c => c.mac === targetMac)
              if (target) {
                addPacket(ATTACKER_POS.x, ATTACKER_POS.y, target.x, target.y, 'deauth')
                setDeauthingMacs(new Set([targetMac]))
                setTimeout(() => setDeauthingMacs(new Set()), 1500)
              }
            } else {
              // Broadcast - animate to all clients
              clientPositions.forEach((c, i) => {
                setTimeout(() => {
                  addPacket(ATTACKER_POS.x, ATTACKER_POS.y, c.x, c.y, 'deauth')
                }, i * 100)
              })
              setDeauthingMacs(new Set(clients.map(c => c.mac)))
              setTimeout(() => setDeauthingMacs(new Set()), 2000)
            }
          }
          break
        case 'output':
        case 'warning':
          addLog(ev.type === 'warning' ? 'warning' : 'info', ev.message || '')
          break
        case 'progress':
          if (ev.progress !== undefined) setCaptureProgress(ev.progress)
          break
        case 'handshake':
          setPhase('captured')
          addLog('success', `HANDSHAKE CAPTURADO!`)
          // Animate handshake packets from clients to attacker
          clientPositions.forEach((c, i) => {
            setTimeout(() => {
              addPacket(c.x, c.y, ATTACKER_POS.x, ATTACKER_POS.y, 'handshake')
            }, i * 200)
          })
          if (ev.data?.handshake_id && onHandshakeCaptured) {
            onHandshakeCaptured(ev.data.handshake_id as number)
          }
          break
        case 'error':
          setPhase('failed')
          addLog('error', ev.message || 'Error en captura')
          break
        case 'done':
          if (phase !== 'captured') setPhase('idle')
          addLog('info', ev.message || 'Ataque finalizado')
          break
      }
    }
    ws.onerror = () => { setPhase('failed'); addLog('error', 'Error de conexión WebSocket') }
  }, [selectedInterface, network, targetMac, config, clientPositions, clients, phase, addLog, addPacket, onHandshakeCaptured])

  // Stop attack
  const stopAttack = useCallback(() => {
    attackWsRef.current?.close()
    clientScanWsRef.current?.close()
    setPhase('idle')
    addLog('warning', 'Ataque detenido por el usuario')
  }, [addLog])

  // Cleanup
  useEffect(() => {
    return () => {
      attackWsRef.current?.close()
      clientScanWsRef.current?.close()
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  // ═══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="absolute inset-0 z-30 flex" style={{ background: 'rgba(3,6,10,0.98)', backdropFilter: 'blur(12px)' }}>
      {/* ─── LEFT PANEL: LOGS ─────────────────────────────────────────────────── */}
      <div className="w-[260px] flex flex-col border-r border-[#1a2f1a]">
        <div className="px-3 py-2 border-b border-[#1a2f1a] flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(42,255,138,0.5)' }}>TERMINAL</span>
          <span className="text-[8px] ml-auto" style={{ color: 'rgba(42,255,138,0.25)' }}>{logs.length} líneas</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 font-mono text-[8px] space-y-0.5" style={{ background: 'rgba(0,0,0,0.3)' }}>
          {logs.map(log => (
            <div key={log.id} className="flex gap-2">
              <span style={{ color: 'rgba(42,255,138,0.25)' }}>{log.time}</span>
              <span style={{
                color: log.type === 'error' ? RED :
                       log.type === 'warning' ? ORANGE :
                       log.type === 'success' ? SG :
                       log.type === 'step' ? CYAN :
                       'rgba(42,255,138,0.5)'
              }}>
                {log.type === 'error' ? '✗' : log.type === 'success' ? '✓' : log.type === 'warning' ? '⚠' : '›'} {log.msg}
              </span>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>

        {/* Config panel */}
        <div className="p-3 border-t border-[#1a2f1a] space-y-3">
          <div className="text-[8px] font-bold tracking-[0.15em]" style={{ color: 'rgba(42,255,138,0.4)' }}>CONFIGURACIÓN</div>

          <div>
            <div className="text-[7px] mb-1" style={{ color: 'rgba(42,255,138,0.3)' }}>DEAUTH / BURST</div>
            <div className="flex gap-1">
              {[16, 32, 64, 128].map(v => (
                <button key={v} onClick={() => setConfig(c => ({ ...c, deauthCount: v }))}
                  disabled={phase === 'attacking'}
                  className="flex-1 py-1 rounded text-[8px] font-mono transition-all disabled:opacity-30"
                  style={{
                    background: config.deauthCount === v ? 'rgba(42,255,138,0.12)' : 'transparent',
                    border: `1px solid ${config.deauthCount === v ? 'rgba(42,255,138,0.4)' : 'rgba(42,255,138,0.1)'}`,
                    color: config.deauthCount === v ? SG : 'rgba(42,255,138,0.4)'
                  }}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[7px] mb-1" style={{ color: 'rgba(42,255,138,0.3)' }}>MAX REINTENTOS</div>
            <div className="flex gap-1">
              {[1, 3, 5, 10].map(v => (
                <button key={v} onClick={() => setConfig(c => ({ ...c, maxRetries: v }))}
                  disabled={phase === 'attacking'}
                  className="flex-1 py-1 rounded text-[8px] font-mono transition-all disabled:opacity-30"
                  style={{
                    background: config.maxRetries === v ? 'rgba(42,255,138,0.12)' : 'transparent',
                    border: `1px solid ${config.maxRetries === v ? 'rgba(42,255,138,0.4)' : 'rgba(42,255,138,0.1)'}`,
                    color: config.maxRetries === v ? SG : 'rgba(42,255,138,0.4)'
                  }}>
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── CENTER PANEL: DIAGRAM ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#1a2f1a] flex items-center">
          <div>
            <div className="text-[11px] font-bold tracking-[0.2em]" style={{ color: SG }}>
              {network.ssid || 'HIDDEN NETWORK'}
            </div>
            <div className="text-[9px] font-mono mt-0.5" style={{ color: 'rgba(42,255,138,0.4)' }}>
              {network.bssid} • CH {network.channel} • {network.encryption || 'OPEN'}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {phase === 'attacking' && (
              <div className="text-[9px] font-mono" style={{ color: ORANGE }}>
                Intento {wsAttempt}/{wsMaxAttempts}
              </div>
            )}
            <button onClick={onClose} className="text-[10px] px-2 py-1 rounded transition-all"
              style={{ color: 'rgba(255,68,68,0.4)', border: '1px solid rgba(255,68,68,0.2)' }}
              onMouseEnter={e => (e.currentTarget.style.color = RED)}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,68,68,0.4)')}>
              ESC ✕
            </button>
          </div>
        </div>

        {/* SVG Diagram */}
        <div className="flex-1 relative">
          <svg viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`} className="w-full h-full">
            <defs>
              {/* Gradients */}
              <radialGradient id="apGlow">
                <stop offset="0%" stopColor={SG} stopOpacity="0.3" />
                <stop offset="100%" stopColor={SG} stopOpacity="0" />
              </radialGradient>
              <radialGradient id="attackerGlow">
                <stop offset="0%" stopColor={phase === 'attacking' ? RED : SG} stopOpacity="0.2" />
                <stop offset="100%" stopColor={phase === 'attacking' ? RED : SG} stopOpacity="0" />
              </radialGradient>

              {/* Grid pattern */}
              <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
                <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(42,255,138,0.03)" strokeWidth="0.5" />
              </pattern>
            </defs>

            {/* Background grid */}
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* Connection lines: Clients to AP */}
            {clientPositions.map(({ mac, x, y }) => (
              <line key={`line-${mac}`}
                x1={x} y1={y} x2={AP_POS.x} y2={AP_POS.y}
                stroke={targetMac === mac ? ORANGE : deauthingMacs.has(mac) ? RED : 'rgba(42,255,138,0.12)'}
                strokeWidth={targetMac === mac ? 2 : 1}
                strokeDasharray={deauthingMacs.has(mac) ? '4,4' : 'none'}
              />
            ))}

            {/* Connection line: Attacker to AP (when attacking) */}
            {phase === 'attacking' && (
              <line x1={ATTACKER_POS.x} y1={ATTACKER_POS.y} x2={AP_POS.x} y2={AP_POS.y}
                stroke="rgba(255,68,68,0.2)" strokeWidth="2" strokeDasharray="8,4" />
            )}

            {/* Access Point */}
            <g transform={`translate(${AP_POS.x}, ${AP_POS.y})`}>
              <APIcon pulse={phase === 'attacking'} />
              <text y="55" textAnchor="middle" fontSize="9" fill={SG} fontFamily="monospace">ACCESS POINT</text>
            </g>

            {/* Clients */}
            {clientPositions.map(({ mac, x, y, client }) => (
              <g key={mac} transform={`translate(${x}, ${y})`}
                onClick={() => setTargetMac(targetMac === mac ? null : mac)}
                style={{ cursor: 'pointer' }}>
                <ClientIcon
                  selected={targetMac === mac}
                  deauthing={deauthingMacs.has(mac)}
                  signal={client.power ?? undefined}
                />
                <text y="28" textAnchor="middle" fontSize="7" fill={targetMac === mac ? ORANGE : 'rgba(42,255,138,0.5)'} fontFamily="monospace">
                  {mac.slice(-8)}
                </text>
                <text y="37" textAnchor="middle" fontSize="6" fill="rgba(42,255,138,0.25)" fontFamily="monospace">
                  {client.packets} pkts
                </text>
              </g>
            ))}

            {/* Attacker */}
            <g transform={`translate(${ATTACKER_POS.x}, ${ATTACKER_POS.y})`}>
              <circle r="50" fill="url(#attackerGlow)" />
              <AttackerIcon attacking={phase === 'attacking'} />
              <text y="45" textAnchor="middle" fontSize="8" fill={phase === 'attacking' ? RED : SG} fontFamily="monospace">
                {selectedInterface}
              </text>
            </g>

            {/* Animated packets */}
            {packets.map(pkt => (
              <AnimatedPacket key={pkt.id} packet={pkt} />
            ))}

            {/* Status overlay */}
            {phase === 'captured' && (
              <g transform={`translate(${VIEWBOX.width / 2}, ${VIEWBOX.height / 2})`}>
                <rect x="-80" y="-25" width="160" height="50" rx="8"
                  fill="rgba(0,229,255,0.15)" stroke={CYAN} strokeWidth="2" />
                <text y="-5" textAnchor="middle" fontSize="11" fill={CYAN} fontWeight="bold">HANDSHAKE CAPTURED</text>
                <text y="12" textAnchor="middle" fontSize="8" fill="rgba(0,229,255,0.6)">Listo para crackear</text>
              </g>
            )}

            {/* No clients message */}
            {clients.length === 0 && phase === 'idle' && (
              <text x={VIEWBOX.width / 2} y={VIEWBOX.height / 2} textAnchor="middle"
                fontSize="10" fill="rgba(42,255,138,0.25)">
                Escanea clientes para ver dispositivos conectados
              </text>
            )}
          </svg>

          {/* Progress bar overlay */}
          {(phase === 'scanning' || phase === 'attacking') && (
            <div className="absolute bottom-0 left-0 right-0 h-1" style={{ background: 'rgba(0,0,0,0.5)' }}>
              <div className="h-full transition-all duration-300"
                style={{
                  width: `${phase === 'scanning' ? scanProgress : captureProgress}%`,
                  background: phase === 'scanning' ? CYAN : ORANGE
                }} />
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-4 py-3 border-t border-[#1a2f1a] flex gap-3">
          <button onClick={startClientScan}
            disabled={phase === 'attacking' || phase === 'scanning'}
            className="px-4 py-2 rounded text-[10px] font-bold tracking-wider transition-all disabled:opacity-30"
            style={{
              background: 'rgba(0,229,255,0.08)',
              border: '1px solid rgba(0,229,255,0.3)',
              color: CYAN
            }}>
            {phase === 'scanning' ? 'ESCANEANDO...' : 'ESCANEAR CLIENTES'}
          </button>

          {phase === 'attacking' ? (
            <button onClick={stopAttack}
              className="flex-1 py-2 rounded text-[10px] font-bold tracking-wider transition-all"
              style={{ background: 'rgba(255,68,68,0.15)', border: '1px solid rgba(255,68,68,0.4)', color: RED }}>
              DETENER ATAQUE
            </button>
          ) : (
            <button onClick={startAttack}
              disabled={phase === 'scanning' || phase === 'captured'}
              className="flex-1 py-2 rounded text-[10px] font-bold tracking-wider transition-all disabled:opacity-30"
              style={{
                background: targetMac ? 'rgba(255,136,0,0.15)' : 'rgba(42,255,138,0.08)',
                border: `1px solid ${targetMac ? 'rgba(255,136,0,0.4)' : 'rgba(42,255,138,0.3)'}`,
                color: targetMac ? ORANGE : SG
              }}>
              {targetMac ? `ATACAR ${targetMac.slice(-8)}` : 'INICIAR ATAQUE (BROADCAST)'}
            </button>
          )}

          {phase === 'captured' && (
            <button onClick={onClose}
              className="px-6 py-2 rounded text-[10px] font-bold tracking-wider"
              style={{ background: 'rgba(0,229,255,0.15)', border: '1px solid rgba(0,229,255,0.4)', color: CYAN }}>
              CONTINUAR A CRACKING
            </button>
          )}
        </div>
      </div>

      {/* ─── RIGHT PANEL: TARGET INFO ─────────────────────────────────────────── */}
      <div className="w-[200px] border-l border-[#1a2f1a] flex flex-col">
        <div className="px-3 py-2 border-b border-[#1a2f1a]">
          <span className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(42,255,138,0.5)' }}>
            {targetMac ? 'OBJETIVO' : 'SELECCIONA OBJETIVO'}
          </span>
        </div>

        <div className="flex-1 p-3 space-y-3">
          {targetMac ? (
            <>
              <div className="rounded-lg p-3" style={{ background: 'rgba(255,136,0,0.08)', border: '1px solid rgba(255,136,0,0.2)' }}>
                <div className="text-[9px] font-bold" style={{ color: ORANGE }}>CLIENTE SELECCIONADO</div>
                <div className="text-[10px] font-mono mt-1" style={{ color: 'rgba(255,136,0,0.7)' }}>{targetMac}</div>
                {(() => {
                  const c = clients.find(cl => cl.mac === targetMac)
                  return c && (
                    <div className="mt-2 space-y-1 text-[8px]" style={{ color: 'rgba(255,136,0,0.5)' }}>
                      <div>Señal: {c.power ?? '?'} dBm</div>
                      <div>Paquetes: {c.packets}</div>
                    </div>
                  )
                })()}
              </div>
              <button onClick={() => setTargetMac(null)}
                className="w-full py-2 rounded text-[9px] transition-all"
                style={{ border: '1px solid rgba(42,255,138,0.2)', color: 'rgba(42,255,138,0.5)' }}>
                CAMBIAR A BROADCAST
              </button>
            </>
          ) : (
            <div className="text-[8px] text-center py-4" style={{ color: 'rgba(42,255,138,0.25)' }}>
              Click en un cliente para seleccionarlo como objetivo específico del deauth.
              <br/><br/>
              Sin selección = broadcast a todos.
            </div>
          )}
        </div>

        {/* Client list */}
        {clients.length > 0 && (
          <div className="border-t border-[#1a2f1a]">
            <div className="px-3 py-2 text-[8px] font-bold tracking-wider" style={{ color: 'rgba(42,255,138,0.3)' }}>
              CLIENTES ({clients.length})
            </div>
            <div className="max-h-40 overflow-y-auto">
              {clients.map(c => (
                <button key={c.mac} onClick={() => setTargetMac(targetMac === c.mac ? null : c.mac)}
                  className="w-full px-3 py-2 text-left transition-all"
                  style={{
                    background: targetMac === c.mac ? 'rgba(255,136,0,0.1)' : 'transparent',
                    borderBottom: '1px solid rgba(42,255,138,0.05)'
                  }}>
                  <div className="text-[8px] font-mono" style={{ color: targetMac === c.mac ? ORANGE : 'rgba(42,255,138,0.6)' }}>
                    {c.mac}
                  </div>
                  <div className="text-[7px] mt-0.5" style={{ color: 'rgba(42,255,138,0.25)' }}>
                    {c.power ?? '?'} dBm • {c.packets} pkts
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AttackDiagram
