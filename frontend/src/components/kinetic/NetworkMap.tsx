import { useEffect, useRef, useState, useCallback } from 'react'
import type { Network } from '../../types/network'
import { useCredentialsStore } from '../../store/credentials'
import { credentialsApi } from '../../api/credentials'
import { wsUrl } from '../../api/client'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useInterfacesStore } from '../../store/interfaces'
import {
  FILTER_DEFS,
  type MapFilter,
  isVulnerable,
  encLabel,
  signalPct,
  signalColor,
} from '../../utils/networkFilters'

// ── constants ─────────────────────────────────────────────────────────────────
const SG      = '#2aff8a'
const SG_RGBA = 'rgba(42,255,138,'

interface Props {
  networks: Network[]
  scanning: boolean
  onAttack: (n: Network) => void
  onStart?: () => void
  onStop?: () => void
  filter: MapFilter
}

interface MapNode {
  network: Network
  x: number
  y: number
  size: number
  pulse: number
  enterT: number   // 0 = just appeared → 1 = fully visible
}


function bssidHash(bssid: string): number {
  let h = 0
  for (let i = 0; i < bssid.length; i++) h = (h * 31 + bssid.charCodeAt(i)) >>> 0
  return h
}

interface Attack {
  id: string
  label: string
  desc: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  available: boolean
}

function possibleAttacks(n: Network): Attack[] {
  const enc = n.encryption?.toUpperCase() ?? ''
  const attacks: Attack[] = []
  if (n.wps_enabled && !n.wps_locked) {
    attacks.push({ id: 'pixie', label: 'WPS PIXIE-DUST', desc: 'PixieDust offline brute', severity: 'critical', available: true })
    attacks.push({ id: 'reaver', label: 'WPS BRUTE-FORCE', desc: 'Reaver / Bully PIN attack', severity: 'high', available: true })
  }
  if (enc === 'WEP') {
    attacks.push({ id: 'wep', label: 'WEP CRACK', desc: 'IV collision statistical', severity: 'critical', available: true })
  }
  if (enc.includes('WPA')) {
    attacks.push({ id: 'pmkid', label: 'PMKID CAPTURE', desc: 'Hcxdumptool clientless', severity: 'high', available: true })
    attacks.push({ id: 'hs', label: 'HANDSHAKE DEAUTH', desc: '4-way HS + offline crack', severity: 'high', available: true })
    attacks.push({ id: 'twin', label: 'EVIL TWIN', desc: 'Rogue AP + phishing portal', severity: 'medium', available: false })
  }
  if (!n.encryption || n.encryption === 'OPN') {
    attacks.push({ id: 'mitm', label: 'OPEN MiTM', desc: 'ARP spoof + intercept', severity: 'critical', available: true })
  }
  return attacks
}

const SEV: Record<string, string> = {
  critical: '#ff4444', high: '#ff8800', medium: '#ffcc00', low: '#2aff8a',
}

function simulatedClients(bssid: string): string[] {
  const h = bssidHash(bssid)
  const count = (h % 4) + 1
  return Array.from({ length: count }, (_, i) => {
    const v = (h ^ (i * 0x9e3779b9)) >>> 0
    return [0xac, (v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff, i & 0xff]
      .map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase()
  })
}

const PHASES = [
  { id: 0, label: 'SCANNING TARGET',       icon: '◎', color: '#2aff8a', dur: 1800 },
  { id: 1, label: 'DEAUTH FLOOD',          icon: '⚡', color: '#ff8800', dur: 2800 },
  { id: 2, label: 'CLIENTS DISCONNECTED',  icon: '✕', color: '#ff4444', dur: 1400 },
  { id: 3, label: 'AWAITING RECONNECT',    icon: '↺', color: '#ffcc00', dur: 2000 },
  { id: 4, label: 'INTERCEPTING 4-WAY HS', icon: '⬟', color: '#00e5ff', dur: 2600 },
  { id: 5, label: 'HASH CAPTURED',         icon: '✓', color: '#2aff8a', dur: 9999 },
]

// ── NetworkDetailPanel ────────────────────────────────────────────────────────
function NetworkDetailPanel({
  network, onClose, onStartAttack,
}: {
  network: Network
  onClose: () => void
  onStartAttack: (n: Network) => void
}) {
  const { handshakes, credentials, fetchHandshakes, fetchCredentials } = useCredentialsStore()
  const [tab, setTab] = useState<'info' | 'attacks' | 'clients'>('info')

  useEffect(() => { fetchHandshakes(); fetchCredentials() }, [fetchHandshakes, fetchCredentials])

  const hs    = handshakes.filter(h => h.bssid.toUpperCase() === network.bssid.toUpperCase())
  const creds = credentials.filter(c => c.bssid.toUpperCase() === network.bssid.toUpperCase())
  const clients = simulatedClients(network.bssid)
  const attacks = possibleAttacks(network)
  const pct   = signalPct(network.power)
  const sCol  = signalColor(pct)

  const vulns = [
    network.wps_enabled && !network.wps_locked && 'WPS_OPEN',
    network.encryption?.toUpperCase() === 'WEP'  && 'WEP_LEGACY',
    (!network.encryption || network.encryption === 'OPN') && 'NO_ENCRYPTION',
  ].filter(Boolean) as string[]

  return (
    <div className="absolute left-3 top-12 z-20 pointer-events-auto" style={{ width: 264 }}>
      <div className="rounded-lg overflow-hidden" style={{
        background: 'rgba(6,10,14,0.88)', border: '1px solid rgba(42,255,138,0.10)',
        backdropFilter: 'blur(14px)', boxShadow: '0 8px 48px rgba(0,0,0,0.6)',
      }}>
        {/* header */}
        <div className="px-3 pt-3 pb-2" style={{ borderBottom: '1px solid rgba(42,255,138,0.07)' }}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-[#2aff8a] tracking-wide truncate">
                {network.ssid ?? '(hidden network)'}
              </div>
              <div className="text-[9px] text-[#2aff8a]/35 font-mono mt-0.5">{network.bssid}</div>
            </div>
            <button onClick={onClose} className="text-[#2aff8a]/20 hover:text-[#2aff8a]/60 text-xs leading-none shrink-0 mt-0.5 transition-colors">✕</button>
          </div>
          {/* signal */}
          <div className="mt-2">
            <div className="flex justify-between text-[8px] mb-1">
              <span style={{ color: 'rgba(42,255,138,0.30)' }}>SIGNAL</span>
              <span style={{ color: sCol }} className="font-mono tabular-nums">{network.power ?? '?'} dBm</span>
            </div>
            <div className="h-1 rounded bg-[#0d1f0d] overflow-hidden">
              <div className="h-full rounded transition-all" style={{ width: `${pct}%`, background: sCol, boxShadow: `0 0 6px ${sCol}` }} />
            </div>
          </div>
          {/* vuln badges */}
          {vulns.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {vulns.map(v => (
                <span key={v} className="text-[7px] px-1.5 py-0.5 rounded font-bold tracking-wider"
                  style={{ background: 'rgba(255,68,68,0.10)', color: '#ff5555', border: '1px solid rgba(255,68,68,0.18)' }}>
                  {v}
                </span>
              ))}
            </div>
          )}
          {/* hash / cred status */}
          <div className="flex gap-1.5 mt-2">
            {[
              { label: `HASH ${hs.length ? `(${hs.length})` : 'NONE'}`, present: hs.length > 0, c: '#00e5ff' },
              { label: `CRED ${creds.length ? `(${creds.length})` : 'NONE'}`, present: creds.length > 0, c: SG },
            ].map(({ label, present, c }) => (
              <div key={label} className="flex items-center gap-1 px-1.5 py-0.5 rounded" style={{
                background: present ? `${c}0d` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${present ? c + '22' : 'rgba(255,255,255,0.04)'}`,
              }}>
                <span style={{ color: present ? c : 'rgba(255,255,255,0.18)' }} className="text-[8px]">{present ? '◈' : '○'}</span>
                <span style={{ color: present ? c : 'rgba(255,255,255,0.22)' }} className="text-[7px] font-mono">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* tabs */}
        <div className="flex" style={{ borderBottom: '1px solid rgba(42,255,138,0.07)' }}>
          {(['info','attacks','clients'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className="flex-1 py-1.5 text-[8px] tracking-widest font-bold transition-all" style={{
              color: tab === t ? SG : 'rgba(42,255,138,0.28)',
              background: tab === t ? 'rgba(42,255,138,0.06)' : 'transparent',
              borderBottom: tab === t ? `1px solid ${SG}` : '1px solid transparent',
            }}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {/* tab body */}
        <div className="p-3 text-[9px]">
          {tab === 'info' && (
            <div className="space-y-1.5">
              {([
                ['SSID',    network.ssid ?? '(hidden)'],
                ['BSSID',   network.bssid],
                ['CHANNEL', network.channel ?? '?'],
                ['ENCRYPT', encLabel(network.encryption)],
                ['CIPHER',  network.cipher ?? '?'],
                ['AUTH',    network.auth ?? '?'],
                ['WPS',     network.wps_enabled ? (network.wps_locked ? 'LOCKED' : '⚠ OPEN') : 'DISABLED'],
                ['VENDOR',  network.vendor ?? 'UNKNOWN'],
              ] as [string, string|number][]).map(([k, v]) => (
                <div key={k} className="flex items-baseline gap-2">
                  <span className="w-14 shrink-0 tracking-wider" style={{ color: 'rgba(42,255,138,0.25)' }}>{k}</span>
                  <span className="font-mono truncate" style={{ color: k === 'WPS' && String(v).includes('⚠') ? '#ff8800' : 'rgba(42,255,138,0.72)' }}>{String(v)}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'attacks' && (
            <div className="space-y-1.5">
              {attacks.length === 0 && <div className="text-center py-4" style={{ color: 'rgba(42,255,138,0.15)' }}>NO VECTORS IDENTIFIED</div>}
              {attacks.map(a => (
                <div key={a.id} className="rounded px-2 py-1.5" style={{
                  background: a.available ? `${SEV[a.severity]}0a` : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${a.available ? SEV[a.severity] + '20' : 'rgba(255,255,255,0.04)'}`,
                  opacity: a.available ? 1 : 0.4,
                }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold tracking-wider text-[8px]" style={{ color: SEV[a.severity] }}>{a.label}</span>
                    <span className="text-[7px] px-1 rounded" style={{ color: SEV[a.severity], background: `${SEV[a.severity]}15` }}>{a.severity.toUpperCase()}</span>
                  </div>
                  <div className="mt-0.5" style={{ color: 'rgba(42,255,138,0.28)' }}>{a.desc}</div>
                </div>
              ))}
            </div>
          )}

          {tab === 'clients' && (
            <div className="space-y-1.5">
              <div className="tracking-widest mb-2" style={{ color: 'rgba(42,255,138,0.22)' }}>EST. CLIENTS: {clients.length}</div>
              {clients.map((mac, i) => (
                <div key={mac} className="flex items-center gap-2 rounded px-2 py-1" style={{ background: 'rgba(42,255,138,0.03)', border: '1px solid rgba(42,255,138,0.06)' }}>
                  <span style={{ color: 'rgba(42,255,138,0.28)' }} className="text-[8px]">CLI_{i+1}</span>
                  <span className="font-mono text-[8px] truncate" style={{ color: 'rgba(42,255,138,0.55)' }}>{mac}</span>
                  <span className="ml-auto text-[7px]" style={{ color: SG, opacity: 0.5 }}>●</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="px-3 pb-3">
          <button
            onClick={() => onStartAttack(network)}
            className="w-full py-2 rounded font-bold text-[10px] tracking-widest transition-all"
            style={{ background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.22)', color: 'rgba(255,110,110,0.90)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,68,68,0.16)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,68,68,0.45)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,68,68,0.08)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,68,68,0.22)' }}
          >
            ⚡ INITIATE ATTACK
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AttackAnimation ───────────────────────────────────────────────────────────
type AnimScene  = 'capture' | 'transfer' | 'decrypt'
type CrackState = 'idle' | 'cracking' | 'found' | 'failed'

function AttackAnimation({ network, onFinish, onHandoff }: {
  network: Network; onFinish: () => void; onHandoff: (n: Network) => void
}) {
  // ── capture phase state ───────────────────────────────────────────────────
  const [phase, setPhase]         = useState(0)
  const [pkts,  setPkts]          = useState<{ id: number; x: number; y: number; tx: number; ty: number; p: number; type: 'deauth'|'hs' }[]>([])
  const [gone,  setGone]          = useState<number[]>([])
  const pktId   = useRef(0)
  const clients = simulatedClients(network.bssid).slice(0, 4)

  // ── scene / decrypt state ─────────────────────────────────────────────────
  const [scene,         setScene]         = useState<AnimScene>('capture')
  const [xferTick,      setXferTick]      = useState(0)
  const [handshake,     setHandshake]     = useState<import('../../types/credential').Handshake | null>(null)
  const [wordlists,     setWordlists]     = useState<{ name: string; path: string; size_mb: number }[]>([])
  const [wlLoading,     setWlLoading]     = useState(false)
  const [wlTab,         setWlTab]         = useState<'server' | 'custom'>('server')
  const [selectedWl,    setSelectedWl]    = useState<string | null>(null)
  const [customPath,    setCustomPath]    = useState('')
  const [useHashcat,    setUseHashcat]    = useState(false)
  const [crackState,    setCrackState]    = useState<CrackState>('idle')
  const [crackLogs,     setCrackLogs]     = useState<string[]>([])
  const [crackProgress, setCrackProgress] = useState(0)
  const [foundPwd,      setFoundPwd]      = useState<string | null>(null)
  const logsEndRef    = useRef<HTMLDivElement>(null)
  const crackStateRef = useRef<CrackState>('idle')
  crackStateRef.current = crackState

  // ── capture WS state — real backend attack ────────────────────────────────
  const selectedInterface                     = useInterfacesStore(s => s.selected)
  const [wsAttempt,      setWsAttempt]        = useState(1)
  const [wsMaxAttempts,  setWsMaxAttempts]    = useState(5)
  const [wsLogs,         setWsLogs]           = useState<string[]>([])
  const [captureFailed,  setCaptureFailed]    = useState(false)
  const [captureFailMsg, setCaptureFailMsg]   = useState('')
  const captureWsRef                          = useRef<WebSocket | null>(null)
  const wsLogsEndRef                          = useRef<HTMLDivElement>(null)
  const prevAttemptRef                        = useRef(1)

  useEffect(() => {
    if (phase >= PHASES.length - 1) return
    const t = setTimeout(() => setPhase(p => p + 1), PHASES[phase].dur)
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    let iv: ReturnType<typeof setInterval>
    if (phase === 1) {
      let i = 0
      iv = setInterval(() => {
        const cx = 10 + (i % clients.length) * 52
        setPkts(prev => [...prev.slice(-24), { id: pktId.current++, x: 100, y: 135, tx: cx + 10, ty: 72, p: 0, type: 'deauth' }])
        i++
      }, 250)
    }
    if (phase === 4) {
      let i = 0
      iv = setInterval(() => {
        const cx = 10 + (i % clients.length) * 52
        setPkts(prev => [...prev.slice(-24), { id: pktId.current++, x: cx + 10, y: 72, tx: 88, ty: 18, p: 0, type: 'hs' }])
        i++
      }, 350)
    }
    return () => clearInterval(iv)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => {
    const raf = { current: 0 }
    const tick = () => {
      setPkts(prev => prev.map(p => ({ ...p, p: Math.min(1, p.p + 0.04) })).filter(p => p.p < 1))
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  useEffect(() => {
    if (phase === 2) {
      clients.forEach((_, i) => setTimeout(() => setGone(prev => [...prev, i]), i * 300))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // ── connect to real backend capture WS ─────────────────────────────────────
  useEffect(() => {
    if (!selectedInterface || !network.channel) return

    const ws = new WebSocket(wsUrl('/api/attacks/handshake'))
    captureWsRef.current = ws

    ws.onmessage = (msg: MessageEvent) => {
      let ev: { type: string; message: string; attempt?: number; max_retries?: number; data?: Record<string,unknown> }
      try { ev = JSON.parse(msg.data as string) } catch { return }

      switch (ev.type) {
        case 'ready':
          ws.send(JSON.stringify({
            interface:    selectedInterface,
            bssid:        network.bssid,
            channel:      network.channel,
            deauth_count: 64,
            max_retries:  5,
          }))
          break
        case 'step':
          setWsLogs(prev => [...prev.slice(-99), ev.message])
          if (ev.attempt !== undefined) {
            if (ev.attempt !== prevAttemptRef.current) {
              prevAttemptRef.current = ev.attempt
              setWsAttempt(ev.attempt)
              setWsMaxAttempts(ev.max_retries ?? 5)
            }
          }
          break
        case 'output':
        case 'warning':
        case 'progress':
          setWsLogs(prev => [...prev.slice(-99), ev.message])
          break
        case 'handshake':
          setWsLogs(prev => [...prev.slice(-99), `✓ ${ev.message}`])
          setPhase(PHASES.length - 1) // jump to HASH CAPTURED immediately
          break
        case 'error':
          setCaptureFailed(true)
          setCaptureFailMsg(ev.message)
          break
        default: break
      }
    }

    ws.onerror = () => { captureWsRef.current = null }
    return () => { ws.close(); captureWsRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network.bssid, network.channel, selectedInterface])

  // ── reset phase animation when attempt increments ─────────────────────────
  useEffect(() => {
    if (wsAttempt < 2) return
    setPhase(0)
    setGone([])
    setPkts([])
    pktId.current = 0
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsAttempt])

  // ── auto-scroll WS logs ───────────────────────────────────────────────────
  useEffect(() => {
    wsLogsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [wsLogs])

  // ── auto-transition to decrypt after HASH CAPTURED ───────────────────────
  useEffect(() => {
    if (phase !== PHASES.length - 1) return

    setWlLoading(true)
    Promise.all([
      credentialsApi.listHandshakes(),
      credentialsApi.listWordlists(),
    ]).then(([hsList, wlList]) => {
      const hs = hsList
        .filter(h => h.bssid.toUpperCase() === network.bssid.toUpperCase())
        .sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime())[0] ?? null
      setHandshake(hs ?? null)
      setWordlists(wlList)
      setWlLoading(false)
    }).catch(() => setWlLoading(false))

    const tickIv = setInterval(() => setXferTick(t => t + 1), 350)
    const tXfer = setTimeout(() => {
      setScene('transfer')
      const tDecrypt = setTimeout(() => setScene('decrypt'), 1800)
      return () => clearTimeout(tDecrypt)
    }, 2000)

    return () => { clearTimeout(tXfer); clearInterval(tickIv) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // ── auto-scroll crack logs ────────────────────────────────────────────────
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [crackLogs])

  // ── WebSocket crack ───────────────────────────────────────────────────────
  const wordlist = wlTab === 'server' ? (selectedWl ?? '') : customPath.trim()

  const { connect: startCrack, disconnect: stopCrack } = useWebSocket({
    path: '/api/attacks/crack',
    config: { handshake_id: handshake?.id ?? 0, wordlist, use_hashcat: useHashcat },
    onEvent: (event) => {
      if (event.type === 'output' || event.type === 'step') {
        setCrackLogs(prev => [...prev.slice(-149), event.message])
      }
      if (event.type === 'progress' && event.progress !== undefined) {
        setCrackProgress(event.progress)
      }
      if (event.type === 'credential') {
        const pwd = (event.data?.password as string) ?? event.message
        setFoundPwd(pwd)
        setCrackState('found')
      }
      if (event.type === 'done' && crackStateRef.current !== 'found') setCrackState('failed')
      if (event.type === 'error') setCrackState('failed')
    },
  })

  const handleStartCrack = () => {
    setCrackState('cracking')
    setCrackLogs([])
    setCrackProgress(0)
    setFoundPwd(null)
    startCrack()
  }

  const handleRetryCrack = () => {
    stopCrack()
    setCrackState('idle')
    setCrackLogs([])
    setCrackProgress(0)
    setFoundPwd(null)
  }

  const cur = PHASES[phase]
  const clientPositions = clients.map((_, i) => ({ cx: 10 + i * 52, cy: 72 }))
  const dots = '.'.repeat(xferTick % 4)

  // ══════════════════════════════════════════════════════════════════════════
  // SCENE: capture failed (all retries exhausted)
  // ══════════════════════════════════════════════════════════════════════════
  if (captureFailed) {
    return (
      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center px-5"
        style={{ background: 'rgba(3,6,10,0.97)', backdropFilter: 'blur(10px)' }}>
        <button onClick={onFinish} className="absolute top-3 right-4 text-xs transition-colors"
          style={{ color: 'rgba(255,68,68,0.30)' }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,68,68,0.75)')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,68,68,0.30)')}>ESC ✕</button>

        <div className="text-4xl mb-3" style={{ filter: 'drop-shadow(0 0 20px #ff4444)' }}>✗</div>
        <div className="text-[10px] font-bold tracking-[0.3em] mb-2" style={{ color: '#ff4444' }}>
          HANDSHAKE CAPTURE FAILED
        </div>
        <div className="text-[8px] font-mono text-center mb-4 leading-relaxed" style={{ color: 'rgba(255,68,68,0.55)', maxWidth: 280 }}>
          {captureFailMsg}
        </div>

        {/* diagnostic log */}
        {wsLogs.length > 0 && (
          <div className="w-full rounded p-2.5 mb-4 max-h-40 overflow-y-auto font-mono text-[8px] space-y-0.5"
            style={{ background: 'rgba(255,68,68,0.04)', border: '1px solid rgba(255,68,68,0.15)' }}>
            {wsLogs.slice(-20).map((l, i) => (
              <div key={i} style={{ color: l.startsWith('✗') ? '#ff4444' : 'rgba(255,68,68,0.45)' }}>{l}</div>
            ))}
          </div>
        )}

        <div className="text-[8px] font-bold tracking-wider mb-3" style={{ color: 'rgba(255,68,68,0.35)' }}>
          CHECKLIST
        </div>
        <div className="space-y-1.5 mb-5 w-full" style={{ maxWidth: 280 }}>
          {[
            ['airmon-ng start wlanX', 'Interfaz en modo monitor'],
            ['Clientes activos', 'Dispositivos conectados al AP'],
            ['Canal correcto', `CH ${network.channel ?? '?'} — usa -c ${network.channel ?? '?'}`],
            ['Proximidad al AP', 'Acércate para mejor señal'],
          ].map(([cmd, label]) => (
            <div key={cmd} className="flex items-center gap-2 text-[8px]">
              <span style={{ color: 'rgba(255,68,68,0.40)' }}>○</span>
              <span style={{ color: 'rgba(255,68,68,0.60)' }}>{label}</span>
              <span className="ml-auto font-mono" style={{ color: 'rgba(255,68,68,0.28)' }}>{cmd}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-2 w-full" style={{ maxWidth: 280 }}>
          <button onClick={() => { setCaptureFailed(false); setPhase(0); setWsAttempt(1); setWsLogs([]); prevAttemptRef.current = 1 }}
            className="flex-1 py-2 rounded font-bold text-[9px] tracking-widest transition-all"
            style={{ background: 'rgba(42,255,138,0.07)', border: '1px solid rgba(42,255,138,0.20)', color: 'rgba(42,255,138,0.55)' }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(42,255,138,0.14)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(42,255,138,0.07)')}>
            ↺ REINTENTAR
          </button>
          <button onClick={() => { onHandoff(network); onFinish() }}
            className="flex-1 py-2 rounded font-bold text-[9px] tracking-widest transition-all"
            style={{ background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.22)', color: 'rgba(255,110,110,0.80)' }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,68,68,0.16)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,68,68,0.08)')}>
            → CONSOLA
          </button>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCENE: transfer — animated beam from capture to decrypt
  // ══════════════════════════════════════════════════════════════════════════
  if (scene === 'transfer') {
    return (
      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center"
        style={{ background: 'rgba(3,6,10,0.97)', backdropFilter: 'blur(10px)' }}>
        <button onClick={onFinish} className="absolute top-3 right-4 text-xs transition-colors"
          style={{ color: 'rgba(42,255,138,0.22)' }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(42,255,138,0.70)')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(42,255,138,0.22)')}>ESC ✕</button>

        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <div className="text-5xl" style={{ color: SG, filter: `drop-shadow(0 0 28px ${SG})` }}>◈</div>
          <div className="text-[13px] font-bold tracking-[0.35em]" style={{ color: SG }}>HASH CAPTURED</div>
          <div className="text-[9px] font-mono" style={{ color: 'rgba(42,255,138,0.35)' }}>{network.ssid ?? network.bssid}</div>
          {wsAttempt > 1 && (
            <div className="text-[8px] font-mono" style={{ color: 'rgba(42,255,138,0.28)' }}>
              Capturado en intento {wsAttempt}/{wsMaxAttempts}
            </div>
          )}

          <div className="flex items-center gap-2 mt-2">
            <div className="text-[10px] font-mono" style={{ color: 'rgba(42,255,138,0.30)' }}>HASH</div>
            <div className="flex gap-1.5">
              {[0,1,2,3,4,5,6,7].map(i => (
                <div key={i} style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: i === (xferTick % 8) ? '#00e5ff'
                    : i < (xferTick % 8) ? 'rgba(0,229,255,0.22)'
                    : 'rgba(0,229,255,0.06)',
                  boxShadow: i === (xferTick % 8) ? '0 0 10px #00e5ff' : 'none',
                  transition: 'all 0.2s',
                }} />
              ))}
            </div>
            <div className="text-[10px] font-mono" style={{ color: '#00e5ff' }}>DECRYPT</div>
          </div>
          <div className="text-[10px] font-mono tracking-widest mt-1" style={{ color: '#00e5ff' }}>
            ROUTING TO DECRYPT ENGINE{dots}
          </div>

          <div className="mt-3 rounded-lg px-4 py-3 text-left space-y-1" style={{
            background: 'rgba(42,255,138,0.04)', border: '1px solid rgba(42,255,138,0.08)', minWidth: 220,
          }}>
            {PHASES.map(p => (
              <div key={p.id} className="flex items-center gap-2 text-[8px] font-mono">
                <span style={{ color: SG }}>✓</span>
                <span style={{ color: 'rgba(42,255,138,0.55)' }}>{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCENE: decrypt — crack engine
  // ══════════════════════════════════════════════════════════════════════════
  if (scene === 'decrypt') {
    return (
      <div className="absolute inset-0 z-30 flex flex-col"
        style={{ background: 'rgba(3,6,10,0.97)', backdropFilter: 'blur(10px)' }}>
        <button onClick={onFinish} className="absolute top-3 right-4 z-10 text-xs transition-colors"
          style={{ color: 'rgba(42,255,138,0.22)' }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(42,255,138,0.70)')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(42,255,138,0.22)')}>ESC ✕</button>

        <div className="flex flex-col items-center pt-5 pb-3 shrink-0" style={{ borderBottom: '1px solid rgba(42,255,138,0.07)' }}>
          <div className="flex items-center gap-2.5">
            <span className="text-xl" style={{ color: SG, filter: `drop-shadow(0 0 10px ${SG})` }}>◈</span>
            <span className="text-[11px] font-bold tracking-[0.3em]" style={{ color: SG }}>DECRYPT ENGINE</span>
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            {PHASES.map(p => (
              <div key={p.id} className="rounded-full" style={{ width: 14, height: 4, background: SG, boxShadow: `0 0 5px ${SG}` }} />
            ))}
          </div>
          <div className="text-[8px] font-mono mt-1" style={{ color: 'rgba(42,255,138,0.25)' }}>{network.ssid ?? network.bssid}</div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Handshake card */}
          {handshake ? (
            <div className="rounded-lg p-3" style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.18)' }}>
              <div className="flex items-center gap-2 mb-2">
                <span style={{ color: '#00e5ff', fontSize: 12 }}>⬟</span>
                <span className="text-[8px] font-bold tracking-[0.2em]" style={{ color: '#00e5ff' }}>HANDSHAKE ON FILE</span>
                <span className="ml-auto text-[7px] font-mono" style={{ color: 'rgba(0,229,255,0.35)' }}>#{handshake.id}</span>
              </div>
              <div className="space-y-1">
                {([
                  ['BSSID',  network.bssid],
                  ['SSID',   network.ssid ?? '(hidden)'],
                  ['FILE',   handshake.file_path.split('/').pop() ?? ''],
                  ['STATUS', handshake.verified ? '◈ VERIFIED' : '○ UNVERIFIED'],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-[8px]">
                    <span className="w-12 shrink-0 tracking-wider" style={{ color: 'rgba(0,229,255,0.28)' }}>{k}</span>
                    <span className="font-mono truncate" style={{
                      color: k === 'STATUS' ? (handshake.verified ? SG : '#ff8800') : 'rgba(0,229,255,0.65)',
                    }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(255,136,0,0.05)', border: '1px solid rgba(255,136,0,0.18)' }}>
              <div className="text-[9px] font-bold tracking-wider" style={{ color: '#ff8800' }}>
                {wlLoading ? 'BUSCANDO HANDSHAKES…' : 'SIN HANDSHAKE PARA ESTE BSSID'}
              </div>
              <div className="text-[8px] mt-1" style={{ color: 'rgba(255,136,0,0.40)' }}>
                Ejecuta una captura real desde la consola
              </div>
            </div>
          )}

          {/* Dictionary selector */}
          {handshake && crackState === 'idle' && (
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(42,255,138,0.10)' }}>
              <div className="px-3 py-2" style={{ background: 'rgba(42,255,138,0.04)', borderBottom: '1px solid rgba(42,255,138,0.07)' }}>
                <span className="text-[8px] font-bold tracking-[0.22em]" style={{ color: 'rgba(42,255,138,0.60)' }}>CRACK ENGINE // DICCIONARIO</span>
              </div>
              <div className="flex" style={{ borderBottom: '1px solid rgba(42,255,138,0.07)' }}>
                {(['server', 'custom'] as const).map(t => (
                  <button key={t} onClick={() => setWlTab(t)}
                    className="flex-1 py-1.5 text-[8px] tracking-widest font-bold transition-all"
                    style={{
                      color:        wlTab === t ? SG : 'rgba(42,255,138,0.25)',
                      background:   wlTab === t ? 'rgba(42,255,138,0.06)' : 'transparent',
                      borderBottom: wlTab === t ? `1px solid ${SG}` : '1px solid transparent',
                    }}>
                    {t === 'server' ? '📂  SERVIDOR' : '✏  RUTA CUSTOM'}
                  </button>
                ))}
              </div>
              <div className="p-3">
                {wlTab === 'server' && (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {wlLoading && <div className="text-[8px] text-center py-4 animate-pulse" style={{ color: 'rgba(42,255,138,0.30)' }}>ESCANEANDO…</div>}
                    {!wlLoading && wordlists.length === 0 && (
                      <div className="text-[8px] text-center py-4" style={{ color: 'rgba(42,255,138,0.18)' }}>
                        SIN DICCIONARIOS<br/><span style={{ fontSize: 7 }}>Coloca archivos .txt/.lst en el directorio wordlists</span>
                      </div>
                    )}
                    {wordlists.map(wl => (
                      <button key={wl.path} onClick={() => setSelectedWl(wl.path)}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-all"
                        style={{
                          background: selectedWl === wl.path ? 'rgba(42,255,138,0.09)' : 'rgba(42,255,138,0.02)',
                          border: `1px solid ${selectedWl === wl.path ? 'rgba(42,255,138,0.28)' : 'rgba(42,255,138,0.07)'}`,
                        }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span style={{ color: selectedWl === wl.path ? SG : 'rgba(42,255,138,0.22)', fontSize: 9 }}>
                            {selectedWl === wl.path ? '●' : '○'}
                          </span>
                          <span className="text-[8px] font-mono truncate" style={{ color: selectedWl === wl.path ? SG : 'rgba(42,255,138,0.55)' }}>
                            {wl.name}
                          </span>
                        </div>
                        <span className="text-[7px] shrink-0 ml-2" style={{ color: 'rgba(42,255,138,0.28)' }}>{wl.size_mb} MB</span>
                      </button>
                    ))}
                  </div>
                )}
                {wlTab === 'custom' && (
                  <div className="space-y-2">
                    <div className="text-[8px] tracking-wider" style={{ color: 'rgba(42,255,138,0.28)' }}>RUTA EN EL SERVIDOR:</div>
                    <input type="text" value={customPath} onChange={e => setCustomPath(e.target.value)}
                      placeholder="/usr/share/wordlists/rockyou.txt"
                      className="w-full bg-transparent outline-none font-mono text-[9px]"
                      style={{ color: SG, border: '1px solid rgba(42,255,138,0.20)', borderRadius: 4, padding: '6px 10px', background: 'rgba(0,0,0,0.30)' }}
                    />
                  </div>
                )}
                <button onClick={() => setUseHashcat(v => !v)} className="flex items-center gap-2 mt-2.5 pt-2 w-full"
                  style={{ borderTop: '1px solid rgba(42,255,138,0.06)' }}>
                  <span style={{ color: useHashcat ? '#ff8800' : 'rgba(42,255,138,0.22)', fontSize: 10 }}>{useHashcat ? '◈' : '○'}</span>
                  <span className="text-[8px] tracking-wider" style={{ color: useHashcat ? '#ff8800' : 'rgba(42,255,138,0.30)' }}>GPU ACCELERATION (HASHCAT)</span>
                </button>
              </div>
              <div className="px-3 pb-3">
                <button disabled={!wordlist} onClick={handleStartCrack}
                  className="w-full py-2 rounded font-bold text-[9px] tracking-[0.22em] transition-all"
                  style={{
                    background: wordlist ? 'rgba(42,255,138,0.10)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${wordlist ? 'rgba(42,255,138,0.35)' : 'rgba(255,255,255,0.05)'}`,
                    color: wordlist ? SG : 'rgba(42,255,138,0.15)', cursor: wordlist ? 'pointer' : 'not-allowed',
                  }}
                  onMouseEnter={e => { if (wordlist) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(42,255,138,0.18)' }}
                  onMouseLeave={e => { if (wordlist) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(42,255,138,0.10)' }}>
                  {wordlist ? '▶ INICIAR CRACK' : 'SELECCIONA UN DICCIONARIO'}
                </button>
              </div>
            </div>
          )}

          {/* Cracking progress */}
          {crackState === 'cracking' && (
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(0,229,255,0.18)' }}>
              <div className="px-3 py-2 flex items-center gap-2"
                style={{ background: 'rgba(0,229,255,0.05)', borderBottom: '1px solid rgba(0,229,255,0.09)' }}>
                <span className="animate-pulse" style={{ color: '#00e5ff', fontSize: 10 }}>⚙</span>
                <span className="text-[8px] font-bold tracking-[0.2em]" style={{ color: '#00e5ff' }}>CRACKING{dots}</span>
                <span className="ml-auto text-[8px] font-mono" style={{ color: 'rgba(0,229,255,0.40)' }}>{crackProgress}%</span>
              </div>
              <div className="h-0.5" style={{ background: 'rgba(0,229,255,0.08)' }}>
                <div className="h-full transition-all duration-500"
                  style={{ width: `${crackProgress}%`, background: '#00e5ff', boxShadow: '0 0 6px #00e5ff' }} />
              </div>
              <div className="p-2 h-32 overflow-y-auto font-mono text-[8px] space-y-0.5" style={{ background: 'rgba(0,0,0,0.40)' }}>
                {crackLogs.length === 0 && <span className="animate-pulse" style={{ color: 'rgba(0,229,255,0.30)' }}>CONECTANDO…</span>}
                {crackLogs.map((line, i) => <div key={i} style={{ color: 'rgba(0,229,255,0.65)' }}>{line}</div>)}
                <div ref={logsEndRef} />
              </div>
              <div className="px-3 py-2">
                <button onClick={handleRetryCrack} className="text-[8px] tracking-widest transition-all"
                  style={{ color: 'rgba(255,68,68,0.45)' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,68,68,0.85)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,68,68,0.45)')}>✕ ABORTAR</button>
              </div>
            </div>
          )}

          {/* Password found */}
          {crackState === 'found' && foundPwd && (
            <div className="rounded-lg p-4 text-center space-y-2" style={{
              background: 'rgba(42,255,138,0.07)', border: `1px solid ${SG_RGBA}0.35)`, boxShadow: `0 0 32px ${SG_RGBA}0.12)`,
            }}>
              <div className="text-3xl" style={{ filter: `drop-shadow(0 0 16px ${SG})` }}>🏆</div>
              <div className="text-[10px] font-bold tracking-[0.3em]" style={{ color: SG }}>PASSWORD CRACKED</div>
              <div className="font-mono text-[15px] font-bold px-4 py-2.5 rounded select-all"
                style={{ color: '#fff', background: 'rgba(0,0,0,0.45)', border: `1px solid ${SG_RGBA}0.30)`, letterSpacing: '0.06em' }}>
                {foundPwd}
              </div>
              <div className="text-[7px] tracking-widest" style={{ color: 'rgba(42,255,138,0.35)' }}>◈ SAVED TO CREDENTIALS</div>
              <button onClick={handleRetryCrack} className="text-[8px] mt-1 tracking-widest transition-all"
                style={{ color: 'rgba(42,255,138,0.28)' }}
                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(42,255,138,0.70)')}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(42,255,138,0.28)')}>↺ OTRO DICCIONARIO</button>
            </div>
          )}

          {/* Crack failed */}
          {crackState === 'failed' && (
            <div className="rounded-lg p-3 text-center space-y-2" style={{
              background: 'rgba(255,68,68,0.04)', border: '1px solid rgba(255,68,68,0.20)',
            }}>
              <div className="text-[9px] font-bold tracking-[0.2em]" style={{ color: '#ff4444' }}>CONTRASEÑA NO ENCONTRADA</div>
              <div className="text-[8px]" style={{ color: 'rgba(255,68,68,0.40)' }}>Diccionario agotado — prueba con otro.</div>
              <button onClick={handleRetryCrack}
                className="w-full py-1.5 rounded font-bold text-[8px] tracking-widest transition-all mt-1"
                style={{ background: 'rgba(42,255,138,0.07)', border: '1px solid rgba(42,255,138,0.20)', color: 'rgba(42,255,138,0.55)' }}
                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(42,255,138,0.14)')}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(42,255,138,0.07)')}>
                ↺ OTRO DICCIONARIO
              </button>
            </div>
          )}
        </div>

        <div className="mx-4 mb-4 flex gap-2 shrink-0 pt-3" style={{ borderTop: '1px solid rgba(42,255,138,0.07)' }}>
          <button onClick={() => { onHandoff(network); onFinish() }}
            className="flex-1 py-2 rounded font-bold text-[9px] tracking-widest transition-all"
            style={{ background: 'rgba(42,255,138,0.09)', border: `1px solid ${SG}50`, color: SG }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(42,255,138,0.18)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(42,255,138,0.09)')}>
            → CONSOLA COMPLETA
          </button>
          <button onClick={onFinish}
            className="px-4 py-2 rounded text-[9px] tracking-widest transition-all"
            style={{ border: '1px solid rgba(42,255,138,0.12)', color: 'rgba(42,255,138,0.35)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(42,255,138,0.70)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(42,255,138,0.30)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(42,255,138,0.35)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(42,255,138,0.12)' }}>
            CLOSE
          </button>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCENE: capture — live topology animation
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="absolute inset-0 z-30 flex flex-col" style={{ background: 'rgba(3,6,10,0.97)', backdropFilter: 'blur(10px)' }}>

      <button onClick={onFinish} className="absolute top-3 right-4 z-10 text-xs transition-colors" style={{ color: 'rgba(42,255,138,0.22)' }}
        onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(42,255,138,0.70)')}
        onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(42,255,138,0.22)')}>
        ESC ✕
      </button>

      {/* header — attempt counter + phase */}
      <div className="flex flex-col items-center pt-4 pb-2 shrink-0">
        {wsAttempt > 1 && (
          <div className="flex items-center gap-2 mb-2 px-3 py-1 rounded-full"
            style={{ background: 'rgba(255,136,0,0.09)', border: '1px solid rgba(255,136,0,0.22)' }}>
            <span className="text-[8px] font-bold tracking-widest" style={{ color: '#ff8800' }}>
              INTENTO {wsAttempt}/{wsMaxAttempts}
            </span>
            <span className="text-[8px] animate-pulse" style={{ color: '#ff8800' }}>●</span>
          </div>
        )}
        <span className="text-3xl mb-1.5 transition-all" style={{ color: cur.color, filter: `drop-shadow(0 0 14px ${cur.color})` }}>{cur.icon}</span>
        <span className="text-[11px] font-bold tracking-[0.3em]" style={{ color: cur.color }}>{cur.label}</span>
        <span className="text-[9px] font-mono mt-1" style={{ color: 'rgba(42,255,138,0.22)' }}>{network.ssid ?? network.bssid}</span>
      </div>

      {/* progress dots */}
      <div className="flex justify-center gap-1.5 mb-3 shrink-0">
        {PHASES.map((p, i) => (
          <div key={p.id} className="rounded-full transition-all" style={{
            width: i <= phase ? 18 : 6, height: 6,
            background: i < phase ? SG : i === phase ? cur.color : 'rgba(255,255,255,0.07)',
          }} />
        ))}
      </div>

      {/* topology SVG */}
      <div className="flex-1 relative mx-4 overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 220 180" preserveAspectRatio="xMidYMid meet">

          {/* AP icon */}
          <g transform="translate(88,18)">
            <rect x="-18" y="-4" width="36" height="32" rx="4" fill="rgba(42,255,138,0.05)" stroke="rgba(42,255,138,0.12)" strokeWidth="0.6"/>
            <circle cx="0" cy="10" r="6" fill="none" stroke={SG} strokeWidth="1.2" opacity="0.8"/>
            <circle cx="0" cy="10" r="3" fill={SG} opacity="0.7"/>
            <path d="M-10,6 Q-10,-2 0,-2 Q10,-2 10,6" fill="none" stroke={SG} strokeWidth="1" opacity="0.5"/>
            <path d="M-15,4 Q-15,-6 0,-6 Q15,-6 15,4" fill="none" stroke={SG} strokeWidth="0.7" opacity="0.3"/>
            <line x1="0" y1="16" x2="0" y2="28" stroke={SG} strokeWidth="1.5" opacity="0.6"/>
            <text x="0" y="36" textAnchor="middle" fontSize="5" fill="rgba(42,255,138,0.40)" fontFamily="monospace">ACCESS-POINT</text>
            <text x="0" y="42" textAnchor="middle" fontSize="4.5" fill="rgba(42,255,138,0.25)" fontFamily="monospace">{network.ssid?.slice(0,12) ?? network.bssid.slice(-11)}</text>
          </g>

          {/* Client icons */}
          {clientPositions.map(({ cx, cy }, i) => {
            const isGone = gone.includes(i)
            return (
              <g key={i} transform={`translate(${cx},${cy})`} style={{ opacity: isGone ? 0.15 : 1, transition: 'opacity 0.5s' }}>
                <rect x="-14" y="-12" width="28" height="22" rx="3" fill="rgba(42,255,138,0.04)" stroke="rgba(42,255,138,0.09)" strokeWidth="0.6"/>
                <rect x="-8" y="-9" width="16" height="11" rx="1.5" fill="none" stroke={isGone ? '#ff4444' : SG} strokeWidth="1" opacity="0.75"/>
                <rect x="-6" y="-7" width="12" height="7" rx="0.5" fill={isGone ? 'rgba(255,68,68,0.08)' : 'rgba(42,255,138,0.06)'}/>
                <line x1="-4" y1="2" x2="-5" y2="6" stroke={isGone ? '#ff4444' : SG} strokeWidth="1" opacity="0.5"/>
                <line x1="4" y1="2" x2="5" y2="6" stroke={isGone ? '#ff4444' : SG} strokeWidth="1" opacity="0.5"/>
                <line x1="-6" y1="6" x2="6" y2="6" stroke={isGone ? '#ff4444' : SG} strokeWidth="1" opacity="0.5"/>
                <text x="0" y="14" textAnchor="middle" fontSize="4.5" fill={isGone ? 'rgba(255,68,68,0.4)' : 'rgba(42,255,138,0.30)'} fontFamily="monospace">CLI_{i+1}</text>
                {isGone && <text x="0" y="-16" textAnchor="middle" fontSize="10" fill="#ff4444" opacity="0.9">✕</text>}
                <line x1="0" y1="-12" x2={88-cx} y2={18-cy+4}
                  stroke={isGone ? 'rgba(255,68,68,0.12)' : 'rgba(42,255,138,0.10)'} strokeWidth="0.5" strokeDasharray="3,3"/>
              </g>
            )
          })}

          {/* Attacker icon */}
          <g transform="translate(100,140)">
            <rect x="-16" y="-14" width="32" height="26" rx="3" fill="rgba(255,68,68,0.06)" stroke="rgba(255,68,68,0.16)" strokeWidth="0.6"/>
            <polygon points="0,-10 10,8 -10,8" fill="none" stroke="#ff4444" strokeWidth="1.2" opacity="0.85"/>
            <line x1="0" y1="-10" x2="0" y2="-2" stroke="#ff4444" strokeWidth="1.5" opacity="0.7"/>
            <circle cx="0" cy="-12" r="2" fill="#ff4444" opacity="0.7"/>
            <path d="M-8,-18 Q0,-22 8,-18" fill="none" stroke="#ff4444" strokeWidth="0.8" opacity="0.5"/>
            <path d="M-12,-22 Q0,-28 12,-22" fill="none" stroke="#ff4444" strokeWidth="0.6" opacity="0.3"/>
            <text x="0" y="18" textAnchor="middle" fontSize="4.5" fill="rgba(255,68,68,0.45)" fontFamily="monospace">ATTACKER</text>
          </g>

          {phase >= 4 && (
            <line x1="100" y1="126" x2="88" y2="50" stroke="#00e5ff" strokeWidth="1.2" strokeDasharray="5,3" opacity="0.45"/>
          )}

          {pkts.map(pk => {
            const px = pk.x + (pk.tx - pk.x) * pk.p
            const py = pk.y + (pk.ty - pk.y) * pk.p
            const c = pk.type === 'deauth' ? '#ff8800' : '#00e5ff'
            return (
              <g key={pk.id} transform={`translate(${px},${py})`}>
                <circle r="3" fill={c} opacity={0.9 - pk.p * 0.6} style={{ filter: `drop-shadow(0 0 3px ${c})` }}/>
                <text y="1.2" textAnchor="middle" fontSize="4" fill={c} opacity={0.9 - pk.p * 0.6} fontFamily="monospace">
                  {pk.type === 'deauth' ? 'D' : 'H'}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* log — real WS output or simulated phase labels */}
      <div className="mx-4 mb-2 rounded px-2.5 py-2 font-mono text-[8px] leading-relaxed shrink-0" style={{
        background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(42,255,138,0.06)', maxHeight: 68, overflow: 'hidden',
      }}>
        {wsLogs.length > 0 ? (
          <>
            {wsLogs.slice(-4).map((l, i) => (
              <div key={i} style={{ color: l.startsWith('✗') ? '#ff4444' : l.startsWith('✓') ? SG : 'rgba(42,255,138,0.55)' }}>
                {l}
              </div>
            ))}
            <div ref={wsLogsEndRef} />
          </>
        ) : (
          PHASES.slice(0, phase + 1).map((p, i) => (
            <div key={p.id} style={{ color: i === phase ? p.color : 'rgba(42,255,138,0.28)' }}>
              <span style={{ opacity: 0.35 }}>[{String(i).padStart(2,'0')}] </span>
              {p.label}
              {i < phase && <span style={{ color: SG }}> ✓</span>}
              {i === phase && <span className="animate-pulse"> ▮</span>}
            </div>
          ))
        )}
      </div>

      {/* footer: abort (if WS active) or loader (final phase) */}
      {captureWsRef.current && phase < PHASES.length - 1 && (
        <div className="mx-4 mb-3 shrink-0 flex gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded"
            style={{ background: 'rgba(42,255,138,0.04)', border: '1px solid rgba(42,255,138,0.08)' }}>
            <span className="animate-pulse text-[9px]" style={{ color: SG }}>●</span>
            <span className="text-[8px] tracking-wider" style={{ color: 'rgba(42,255,138,0.45)' }}>
              {wsAttempt > 1 ? `INTENTO ${wsAttempt}/${wsMaxAttempts}` : 'ATAQUE EN CURSO'}
            </span>
          </div>
          <button onClick={() => { captureWsRef.current?.close(); captureWsRef.current = null; onFinish() }}
            className="px-3 py-2 rounded text-[8px] tracking-widest transition-all"
            style={{ border: '1px solid rgba(255,68,68,0.22)', color: 'rgba(255,68,68,0.50)' }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,68,68,0.90)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,68,68,0.50)')}>
            ABORT
          </button>
        </div>
      )}
      {phase === PHASES.length - 1 && (
        <div className="mx-4 mb-4 shrink-0">
          <div className="flex items-center justify-center gap-2 py-2 rounded"
            style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.20)' }}>
            <span className="animate-spin text-[9px]" style={{ color: '#00e5ff' }}>⟳</span>
            <span className="text-[8px] tracking-[0.22em] font-bold animate-pulse" style={{ color: '#00e5ff' }}>
              CARGANDO DECRYPT ENGINE…
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── RFNetworkPanel (right side) ───────────────────────────────────────────────
function RFNetworkPanel({ networks, selected, onSelect, search, onSearch, open, onToggle }: {
  networks: Network[]; selected: Network | null; onSelect: (n: Network | null) => void
  search: string; onSearch: (v: string) => void; open: boolean; onToggle: () => void
}) {
  const { handshakes, credentials, fetchHandshakes, fetchCredentials } = useCredentialsStore()
  useEffect(() => { fetchHandshakes(); fetchCredentials() }, [fetchHandshakes, fetchCredentials])

  // quick lookup: bssid → counts
  const hsMap   = new Map<string, number>()
  const credMap = new Map<string, number>()
  handshakes.forEach(h  => { const k = h.bssid.toUpperCase();  hsMap.set(k, (hsMap.get(k)  ?? 0) + 1) })
  credentials.forEach(c => { const k = c.bssid.toUpperCase(); credMap.set(k, (credMap.get(k) ?? 0) + 1) })

  const visible = networks
    .filter(n => !search || (n.ssid ?? n.bssid).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.power ?? -100) - (a.power ?? -100))

  return (
    <div className="absolute top-10 right-3 z-10 pointer-events-auto transition-all duration-200" style={{ width: open ? 308 : 36 }}>
      {/* header */}
      <div className="flex items-center gap-2 px-2.5 py-2 rounded-t" style={{
        background: 'rgba(4,7,11,0.94)',
        border: '1px solid rgba(42,255,138,0.12)',
        backdropFilter: 'blur(22px)',
        boxShadow: '0 4px 32px rgba(0,0,0,0.55)',
      }}>
        <button onClick={onToggle} className="text-[10px] leading-none shrink-0 transition-colors" style={{ color: 'rgba(42,255,138,0.30)' }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(42,255,138,0.75)')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(42,255,138,0.30)')}>
          {open ? '▶' : '◀'}
        </button>
        {open && <>
          <span className="text-[9px] tracking-[0.25em] whitespace-nowrap flex-1 font-bold" style={{ color: 'rgba(42,255,138,0.60)' }}>RF_NETWORKS</span>
          <span className="text-[8px] tabular-nums shrink-0 px-1.5 py-0.5 rounded font-mono" style={{
            color: 'rgba(42,255,138,0.75)',
            background: 'rgba(42,255,138,0.08)',
            border: '1px solid rgba(42,255,138,0.14)',
          }}>{networks.length}</span>
        </>}
      </div>

      {open && <>
        {/* search */}
        <div className="px-2.5 py-2" style={{
          background: 'rgba(4,7,11,0.93)',
          borderLeft: '1px solid rgba(42,255,138,0.12)',
          borderRight: '1px solid rgba(42,255,138,0.12)',
          backdropFilter: 'blur(22px)',
        }}>
          <div className="flex items-center gap-2 rounded-md px-2.5 py-1.5 transition-all" style={{
            border: `1px solid ${search ? 'rgba(42,255,138,0.28)' : 'rgba(42,255,138,0.10)'}`,
            background: 'rgba(0,0,0,0.40)',
            boxShadow: search ? '0 0 10px rgba(42,255,138,0.08), inset 0 0 8px rgba(42,255,138,0.03)' : 'none',
          }}>
            <span className="text-[11px] shrink-0" style={{ color: search ? 'rgba(42,255,138,0.75)' : 'rgba(42,255,138,0.28)' }}>⌕</span>
            <input
              value={search}
              onChange={e => onSearch(e.target.value)}
              placeholder="FILTER NETWORKS…"
              className="w-full bg-transparent text-[10px] text-[#2aff8a] placeholder:text-[#2aff8a]/18 outline-none font-mono tracking-wide"
            />
            {search && (
              <button onClick={() => onSearch('')} className="text-[11px] shrink-0 px-0.5 rounded transition-colors"
                style={{ color: 'rgba(42,255,138,0.45)' }}
                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(42,255,138,0.90)')}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(42,255,138,0.45)')}>×</button>
            )}
          </div>
          {search && (
            <div className="mt-1.5 flex items-center gap-1.5" style={{ fontSize: 8, color: 'rgba(42,255,138,0.38)' }}>
              <span className="tracking-widest">{visible.length} MATCH{visible.length !== 1 ? 'ES' : ''}</span>
              <span style={{ opacity: 0.5 }}>·</span>
              <span style={{ color: 'rgba(42,255,138,0.55)' }}>RADAR FILTERED</span>
            </div>
          )}
        </div>

        {/* list */}
        <div className="overflow-y-auto rounded-b" style={{
          maxHeight: 'calc(100vh - 172px)',
          background: 'rgba(4,7,11,0.92)',
          border: '1px solid rgba(42,255,138,0.12)', borderTop: 'none',
          backdropFilter: 'blur(22px)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.60)',
        }}>
          {visible.length === 0 ? (
            <div className="text-center py-8 tracking-widest" style={{ fontSize: 9, color: 'rgba(42,255,138,0.14)' }}>
              {networks.length === 0 ? 'NO NETWORKS DETECTED' : 'NO MATCH'}
            </div>
          ) : visible.map(n => {
            const pct      = signalPct(n.power)
            const sCol     = signalColor(pct)
            const isS      = selected?.bssid === n.bssid
            const vuln     = isVulnerable(n)
            const bssidUp  = n.bssid.toUpperCase()
            const hsCount  = hsMap.get(bssidUp)   ?? 0
            const credCount = credMap.get(bssidUp) ?? 0
            return (
              <div key={n.bssid} onClick={() => onSelect(isS ? null : n)}
                className="px-3 py-2.5 cursor-pointer transition-all"
                style={{
                  background:   isS ? 'rgba(42,255,138,0.07)' : 'transparent',
                  borderBottom: '1px solid rgba(42,255,138,0.05)',
                  borderLeft:   isS ? `2px solid ${SG}` : '2px solid transparent',
                }}
                onMouseEnter={e => { if (!isS) e.currentTarget.style.background = 'rgba(42,255,138,0.04)' }}
                onMouseLeave={e => { if (!isS) e.currentTarget.style.background = 'transparent' }}
              >
                {/* row 1 – signal dot + SSID + vuln */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sCol, boxShadow: `0 0 6px ${sCol}` }} />
                  <span className="text-[10px] font-mono font-bold truncate flex-1" style={{ color: isS ? SG : 'rgba(42,255,138,0.80)' }}>
                    {n.ssid ?? '(hidden)'}
                  </span>
                  {vuln && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded shrink-0 font-bold"
                      style={{ color: '#ff5555', background: 'rgba(255,68,68,0.10)', border: '1px solid rgba(255,68,68,0.20)' }}>⚠</span>
                  )}
                </div>

                {/* row 2 – signal bar */}
                <div className="h-1 rounded-full overflow-hidden mb-1.5" style={{ background: 'rgba(42,255,138,0.07)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: sCol, boxShadow: `0 0 6px ${sCol}70` }} />
                </div>

                {/* row 3 – meta info */}
                <div className="flex items-center gap-1.5 mb-2" style={{ fontSize: 8, color: 'rgba(42,255,138,0.35)' }}>
                  <span className="font-mono tabular-nums font-semibold" style={{ color: sCol }}>{n.power ?? '?'} dBm</span>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span>CH {n.channel ?? '?'}</span>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span>{encLabel(n.encryption)}</span>
                  {n.wps_enabled && !n.wps_locked && (
                    <span className="ml-auto font-bold tracking-wider" style={{ color: '#ff8800' }}>WPS!</span>
                  )}
                </div>

                {/* row 4 – HS / KEY status badges */}
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded" style={{
                    background: hsCount > 0 ? 'rgba(0,229,255,0.08)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${hsCount > 0 ? 'rgba(0,229,255,0.22)' : 'rgba(255,255,255,0.05)'}`,
                  }}>
                    <span style={{ color: hsCount > 0 ? '#00e5ff' : 'rgba(255,255,255,0.18)', fontSize: 9 }}>
                      {hsCount > 0 ? '◈' : '○'}
                    </span>
                    <span className="font-mono" style={{ fontSize: 7, color: hsCount > 0 ? '#00e5ff' : 'rgba(255,255,255,0.22)' }}>
                      HS{hsCount > 0 ? ` ×${hsCount}` : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded" style={{
                    background: credCount > 0 ? 'rgba(42,255,138,0.09)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${credCount > 0 ? 'rgba(42,255,138,0.22)' : 'rgba(255,255,255,0.05)'}`,
                  }}>
                    <span style={{ color: credCount > 0 ? SG : 'rgba(255,255,255,0.18)', fontSize: 9 }}>
                      {credCount > 0 ? '◈' : '○'}
                    </span>
                    <span className="font-mono" style={{ fontSize: 7, color: credCount > 0 ? SG : 'rgba(255,255,255,0.22)' }}>
                      {credCount > 0 ? `KEY ×${credCount}` : 'NO KEY'}
                    </span>
                  </div>

                  {/* BSSID tail */}
                  <span className="ml-auto font-mono" style={{ fontSize: 7, color: 'rgba(42,255,138,0.18)' }}>
                    {n.bssid.slice(-8)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </>}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function NetworkMap({ networks, scanning, onAttack, onStart, onStop, filter }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const nodesRef    = useRef<MapNode[]>([])
  const frameRef    = useRef(0)
  const pendingRef  = useRef<MapNode[]>([])   // stagger queue
  const lastPopRef  = useRef(0)               // frame of last pop

  const [hovered,    setHovered]    = useState<Network | null>(null)
  const [tooltip,    setTooltip]    = useState({ x: 0, y: 0 })
  const [selected,   setSelected]   = useState<Network | null>(null)
  const [search,     setSearch]     = useState('')
  const [netOpen,    setNetOpen]    = useState(true)
  const [attacking,  setAttacking]  = useState<Network | null>(null)
  const [hasScanned, setHasScanned] = useState(false)
  const lastDimRef   = useRef({ w: 0, h: 0 })  // persist canvas dimensions across effect restarts
  const searchRef    = useRef('')
  useEffect(() => { searchRef.current = search }, [search])

  useEffect(() => { if (scanning) setHasScanned(true) }, [scanning])

  const activeDef   = FILTER_DEFS.find(f => f.key === filter)!
  const matchBssids = new Set(networks.filter(activeDef.match).map(n => n.bssid))
  const hasFilter   = filter !== 'all'

  const placeNode = useCallback((n: Network): MapNode => {
    const canvas = canvasRef.current
    const W = (canvas && canvas.offsetWidth  > 0) ? canvas.offsetWidth  : 900
    const H = (canvas && canvas.offsetHeight > 0) ? canvas.offsetHeight : 600

    const h = bssidHash(n.bssid)
    const cx = W / 2, cy = H / 2

    // Angle based on BSSID hash (consistent position around center)
    const angle = ((h % 3600) / 3600) * Math.PI * 2

    // Distance based on signal strength:
    // Strong signal (-30 dBm) = close to center, Weak signal (-95 dBm) = far from center
    const power = n.power ?? -80
    // Normalize: -30 dBm → 0 (closest), -95 dBm → 1 (farthest)
    const signalNorm = Math.max(0, Math.min(1, (power + 30) / -65))

    // Min radius = 70 (dead zone), Max radius = 90% of half the smaller dimension
    const minRadius = 70
    const maxRadius = Math.min(W, H) * 0.42
    const radius = minRadius + signalNorm * (maxRadius - minRadius)

    // Add small offset based on hash to avoid overlapping networks with same signal
    const offsetAngle = ((h >>> 12) & 0xff) / 255 * 0.3 - 0.15  // ±0.15 radians
    const finalAngle = angle + offsetAngle

    const x = cx + Math.cos(finalAngle) * radius
    const y = cy + Math.sin(finalAngle) * radius

    return {
      network: n,
      x,
      y,
      size: 7 + Math.abs((power + 50) * 0.18),
      pulse: Math.random() * Math.PI * 2,
      enterT: 0,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const W = (canvas && canvas.offsetWidth  > 0) ? canvas.offsetWidth  : 900
    const H = (canvas && canvas.offsetHeight > 0) ? canvas.offsetHeight : 600
    const cx = W / 2, cy = H / 2
    const minRadius = 70
    const maxRadius = Math.min(W, H) * 0.42

    const existingBssids = new Set(nodesRef.current.map(nd => nd.network.bssid))

    // update existing nodes' live data AND reposition based on signal
    nodesRef.current = nodesRef.current.map(nd => {
      const fresh = networks.find(n => n.bssid === nd.network.bssid)
      if (!fresh) return nd

      // Recalculate target position based on current signal
      const h = bssidHash(fresh.bssid)
      const angle = ((h % 3600) / 3600) * Math.PI * 2
      const offsetAngle = ((h >>> 12) & 0xff) / 255 * 0.3 - 0.15
      const finalAngle = angle + offsetAngle

      const power = fresh.power ?? -80
      const signalNorm = Math.max(0, Math.min(1, (power + 30) / -65))
      const targetRadius = minRadius + signalNorm * (maxRadius - minRadius)

      const targetX = cx + Math.cos(finalAngle) * targetRadius
      const targetY = cy + Math.sin(finalAngle) * targetRadius

      // Smooth interpolation towards target (lerp factor 0.08)
      const lerp = 0.08
      const newX = nd.x + (targetX - nd.x) * lerp
      const newY = nd.y + (targetY - nd.y) * lerp

      return { ...nd, network: fresh, x: newX, y: newY }
    })

    // append brand-new nodes — they enter with enterT=0 (animated in draw loop)
    const newNodes = networks
      .filter(n => !existingBssids.has(n.bssid))
      .map(placeNode)

    // push to stagger queue — the draw loop releases them one by one
    if (newNodes.length > 0) pendingRef.current = [...pendingRef.current, ...newNodes]
  }, [networks, placeNode])

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let t = 0
    const draw = () => {
      const W = canvas.width  = canvas.offsetWidth
      const H = canvas.height = canvas.offsetHeight
      // reposition nodes only when canvas dimensions actually change (not on effect restart)
      const { w: lastW, h: lastH } = lastDimRef.current
      if (W > 0 && H > 0 && (W !== lastW || H !== lastH)) {
        lastDimRef.current = { w: W, h: H }
        // Scale existing positions proportionally instead of recalculating
        if (lastW > 0 && lastH > 0) {
          const scaleX = W / lastW
          const scaleY = H / lastH
          nodesRef.current = nodesRef.current.map(nd => ({
            ...nd,
            x: (nd.x - lastW / 2) * scaleX + W / 2,
            y: (nd.y - lastH / 2) * scaleY + H / 2,
          }))
        }
      }
      ctx.clearRect(0,0,W,H)
      ctx.fillStyle = 'rgba(42,255,138,0.05)'
      for (let gx=0;gx<W;gx+=28) for (let gy=0;gy<H;gy+=28) ctx.fillRect(gx,gy,1,1)
      if (scanning) {
        const sw = (t*0.015)%(Math.PI*2)
        ctx.save(); ctx.translate(W/2,H/2)
        ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,Math.max(W,H),sw,sw+0.8)
        ctx.fillStyle='rgba(42,255,138,0.04)'; ctx.fill()
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(sw)*Math.max(W,H),Math.sin(sw)*Math.max(W,H))
        ctx.strokeStyle='rgba(42,255,138,0.32)'; ctx.lineWidth=1; ctx.stroke(); ctx.restore()
      }
      for (let r=60;r<Math.max(W,H)*0.7;r+=70) {
        ctx.beginPath(); ctx.arc(W/2,H/2,r,0,Math.PI*2)
        ctx.strokeStyle='rgba(42,255,138,0.05)'; ctx.lineWidth=1; ctx.stroke()
      }
      ctx.strokeStyle='rgba(42,255,138,0.10)'; ctx.lineWidth=1
      ctx.beginPath(); ctx.moveTo(W/2-12,H/2); ctx.lineTo(W/2+12,H/2); ctx.moveTo(W/2,H/2-12); ctx.lineTo(W/2,H/2+12); ctx.stroke()

      const searchQ = searchRef.current.toLowerCase()
      const fb = new Set(nodesRef.current.filter(nd=>FILTER_DEFS.find(f=>f.key===filter)!.match(nd.network)).map(nd=>nd.network.bssid))
      const fhf = filter!=='all'

      nodesRef.current.forEach(nd => {
        const matchSearch = !searchQ || (nd.network.ssid ?? nd.network.bssid).toLowerCase().includes(searchQ)
        const dim = (fhf && !fb.has(nd.network.bssid)) || !matchSearch
        const isSel = selected?.bssid===nd.network.bssid
        ctx.beginPath(); ctx.moveTo(W/2,H/2); ctx.lineTo(nd.x,nd.y)
        // Lines: brighter only when selected
        ctx.strokeStyle = dim ? 'rgba(45,45,45,0.04)' : isSel ? `${SG_RGBA}0.25)` : `${SG_RGBA}0.04)`
        ctx.lineWidth = isSel ? 1 : 0.5; ctx.stroke()
      })

      nodesRef.current.forEach(nd => {
        // ── advance entry animation ───────────────────────────────────────────
        if (nd.enterT < 1) nd.enterT = Math.min(1, nd.enterT + 0.032)
        const eased = nd.enterT < 1 ? 1 - Math.pow(1 - nd.enterT, 3) : 1  // ease-out-cubic

        const pulse = Math.sin(t*0.04+nd.pulse)*0.5+0.5
        const r     = nd.size * eased
        const matchSearch = !searchQ || (nd.network.ssid ?? nd.network.bssid).toLowerCase().includes(searchQ)
        const dim   = (fhf && !fb.has(nd.network.bssid)) || !matchSearch
        const isSel = selected?.bssid===nd.network.bssid
        const pct   = signalPct(nd.network.power)
        const sCol  = signalColor(pct)

        // ── entry ping ring (subtle, only bright if selected) ──────────────────
        if (nd.enterT < 0.85 && !dim) {
          const pingProgress = nd.enterT / 0.85
          const pingR  = nd.size * (1 + pingProgress * 3)
          const pingA  = (1 - pingProgress) * (isSel ? 0.45 : 0.15)
          ctx.beginPath(); ctx.arc(nd.x, nd.y, pingR, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(42,255,138,${pingA.toFixed(2)})`
          ctx.lineWidth = isSel ? 1.5 : 0.8; ctx.stroke()
        }

        if (dim) {
          ctx.beginPath(); ctx.arc(nd.x,nd.y,r*0.6,0,Math.PI*2)
          ctx.fillStyle=`rgba(42,42,42,${(0.42*eased).toFixed(2)})`; ctx.fill()
          ctx.fillStyle=`rgba(65,65,65,${(0.25*eased).toFixed(2)})`; ctx.font='8px monospace'
          ctx.globalAlpha=eased
          ctx.fillText(nd.network.ssid??nd.network.bssid.slice(-8),nd.x+r+3,nd.y+3)
          ctx.globalAlpha=1; return
        }

        if (isSel) {
          ctx.beginPath(); ctx.arc(nd.x,nd.y,r+14+pulse*8,0,Math.PI*2)
          ctx.strokeStyle=`${SG_RGBA}${(0.09+pulse*0.17).toFixed(2)})`; ctx.lineWidth=1.5; ctx.stroke()
          ctx.beginPath(); ctx.arc(nd.x,nd.y,r+5,0,Math.PI*2)
          ctx.strokeStyle='rgba(42,255,138,0.48)'; ctx.lineWidth=1.5; ctx.stroke()
          ctx.beginPath(); ctx.arc(nd.x,nd.y,r+2,0,Math.PI*2)
          ctx.fillStyle=SG; ctx.shadowColor=SG; ctx.shadowBlur=20; ctx.fill(); ctx.shadowBlur=0
          ctx.globalAlpha=eased
          ctx.fillStyle=SG; ctx.font='bold 9px monospace'
          ctx.fillText(nd.network.ssid??nd.network.bssid,nd.x+r+6,nd.y+4)
          ctx.globalAlpha=1; return
        }

        // normal — subtle, more transparent (only bright when selected)
        const alpha = (pulse*0.06).toFixed(2)
        ctx.beginPath(); ctx.arc(nd.x,nd.y,r+2+pulse*2,0,Math.PI*2)
        ctx.strokeStyle=sCol.replace(/[\d.]+\)$/,`${alpha})`); ctx.lineWidth=0.5; ctx.stroke()
        ctx.beginPath(); ctx.arc(nd.x,nd.y,r,0,Math.PI*2)
        ctx.fillStyle=sCol.replace(/[\d.]+\)$/,'0.28)'); ctx.fill()
        ctx.globalAlpha=eased * 0.5
        ctx.fillStyle=sCol.replace(/[\d.]+\)$/,'0.35)'); ctx.font='8px monospace'
        ctx.fillText(nd.network.ssid??nd.network.bssid.slice(-8),nd.x+r+3,nd.y+3)
        ctx.globalAlpha=1
      })

      // ── stagger-reveal: pop one node from queue per interval ────────────────
      if (pendingRef.current.length > 0) {
        // adaptive: slow for first ~12 (dramatic), faster as count grows
        const placed = nodesRef.current.length
        const interval = placed < 12 ? 18 : placed < 40 ? 10 : placed < 100 ? 6 : 3
        if (t - lastPopRef.current >= interval) {
          nodesRef.current = [...nodesRef.current, pendingRef.current.shift()!]
          lastPopRef.current = t
        }
      }

      t++; frameRef.current=requestAnimationFrame(draw)
    }
    frameRef.current=requestAnimationFrame(draw)
    return ()=>cancelAnimationFrame(frameRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[scanning,filter,selected])

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect=canvasRef.current!.getBoundingClientRect()
    const mx=e.clientX-rect.left,my=e.clientY-rect.top
    let found: Network|null=null
    for (const nd of nodesRef.current) {
      if (hasFilter&&!matchBssids.has(nd.network.bssid)) continue
      const dx=nd.x-mx,dy=nd.y-my
      if (Math.sqrt(dx*dx+dy*dy)<nd.size+8){found=nd.network;break}
    }
    setHovered(found); setTooltip({x:mx+12,y:my-8})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[hasFilter,matchBssids])

  const onClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect=canvasRef.current!.getBoundingClientRect()
    const mx=e.clientX-rect.left,my=e.clientY-rect.top
    for (const nd of nodesRef.current) {
      if (hasFilter&&!matchBssids.has(nd.network.bssid)) continue
      const dx=nd.x-mx,dy=nd.y-my
      if (Math.sqrt(dx*dx+dy*dy)<nd.size+8){setSelected(p=>p?.bssid===nd.network.bssid?null:nd.network);return}
    }
    setSelected(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[hasFilter,matchBssids])

  return (
    <div className="relative w-full h-full overflow-hidden">

      {/* left: network intel */}
      {selected && !attacking && (
        <NetworkDetailPanel network={selected} onClose={()=>setSelected(null)} onStartAttack={n=>setAttacking(n)} />
      )}

      {/* right: RF list */}
      <RFNetworkPanel networks={networks} selected={selected} onSelect={setSelected} search={search} onSearch={setSearch} open={netOpen} onToggle={()=>setNetOpen(o=>!o)} />

      {/* radar canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{cursor:hovered?'pointer':'crosshair', zIndex:0}}
        onMouseMove={onMouseMove} onMouseLeave={()=>setHovered(null)} onClick={onClick} />

      {/* ── scanning sonar overlay ── */}
      {scanning && (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
          {/* sonar pulse rings emanating from center */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative" style={{ width: 64, height: 64 }}>
              {[0, 0.5, 1.0, 1.5].map((delay, i) => (
                <div
                  key={i}
                  className="absolute inset-0 rounded-full animate-ping"
                  style={{
                    border: `1px solid rgba(42,255,138,${0.30 - i * 0.05})`,
                    animationDuration: '2s',
                    animationDelay: `${delay}s`,
                  }}
                />
              ))}
            </div>
          </div>
          {/* counter — below center */}
          <div
            className="absolute left-1/2 -translate-x-1/2 font-mono text-[9px] tracking-[0.22em] whitespace-nowrap"
            style={{ top: 'calc(50% + 50px)' }}
          >
            <span style={{ color: 'rgba(42,255,138,0.65)' }}>
              {(nodesRef.current.length + pendingRef.current.length).toString().padStart(2, '0')}
            </span>
            <span style={{ color: 'rgba(42,255,138,0.28)' }}> SIGNALS ACQUIRED</span>
          </div>
          {/* pending bubble counter */}
          {pendingRef.current.length > 0 && (
            <div
              className="absolute left-1/2 -translate-x-1/2 font-mono text-[8px] tracking-widest whitespace-nowrap animate-pulse"
              style={{ top: 'calc(50% + 64px)', color: 'rgba(42,255,138,0.20)' }}
            >
              +{pendingRef.current.length} RENDERING…
            </div>
          )}
        </div>
      )}

      {/* ── center scan button (before first scan) ── */}
      {!hasScanned && !scanning && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <button
            onClick={onStart}
            disabled={!onStart}
            className="relative flex flex-col items-center gap-5 group outline-none"
          >
            {/* Concentric pulsing rings */}
            <div className="relative w-32 h-32 flex items-center justify-center">
              <div
                className="absolute inset-0 rounded-full animate-ping"
                style={{ border: '1px solid rgba(42,255,138,0.16)', animationDuration: '2.4s' }}
              />
              <div
                className="absolute w-24 h-24 rounded-full animate-ping"
                style={{ border: '1px solid rgba(42,255,138,0.13)', animationDuration: '2.4s', animationDelay: '0.6s' }}
              />
              <div
                className="absolute w-16 h-16 rounded-full animate-ping"
                style={{ border: '1px solid rgba(42,255,138,0.20)', animationDuration: '2.4s', animationDelay: '1.2s' }}
              />
              {/* Core button */}
              <div
                className="relative w-14 h-14 rounded-full flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
                style={{
                  background: 'rgba(42,255,138,0.08)',
                  border: '1.5px solid rgba(42,255,138,0.55)',
                  boxShadow: '0 0 32px rgba(42,255,138,0.24), inset 0 0 14px rgba(42,255,138,0.06)',
                }}
              >
                <span
                  className="text-2xl leading-none"
                  style={{ color: '#2aff8a', filter: 'drop-shadow(0 0 10px #2aff8a)' }}
                >
                  ◎
                </span>
              </div>
            </div>
            {/* Label */}
            <div className="flex flex-col items-center gap-1">
              <span
                className="text-[11px] font-bold tracking-[0.35em] transition-all duration-200 group-hover:tracking-[0.45em]"
                style={{ color: '#2aff8a', textShadow: '0 0 18px rgba(42,255,138,0.40)' }}
              >
                INITIATE SCAN
              </span>
              <span
                className="text-[8px] tracking-[0.2em]"
                style={{ color: 'rgba(42,255,138,0.25)' }}
              >
                CLICK TO BEGIN
              </span>
            </div>
          </button>
        </div>
      )}

      {/* ── center rescan / stop button (after first scan) ── */}
      {(hasScanned || scanning) && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <button
            onClick={scanning ? onStop : onStart}
            title={scanning ? 'Stop Scan' : 'Rescan'}
            className="relative flex items-center justify-center group outline-none pointer-events-auto"
          >
            <div className="relative w-16 h-16 flex items-center justify-center">
              {/* outer ping ring */}
              <div
                className="absolute inset-0 rounded-full animate-ping"
                style={{
                  border: `1px solid ${scanning ? 'rgba(255,68,68,0.18)' : 'rgba(42,255,138,0.16)'}`,
                  animationDuration: '2.4s',
                }}
              />
              {/* mid ping ring */}
              <div
                className="absolute w-12 h-12 rounded-full animate-ping"
                style={{
                  border: `1px solid ${scanning ? 'rgba(255,68,68,0.13)' : 'rgba(42,255,138,0.13)'}`,
                  animationDuration: '2.4s',
                  animationDelay: '0.8s',
                }}
              />
              {/* core */}
              <div
                className="relative w-9 h-9 rounded-full flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
                style={{
                  background: scanning ? 'rgba(255,68,68,0.10)' : 'rgba(42,255,138,0.08)',
                  border: `1.5px solid ${scanning ? 'rgba(255,68,68,0.55)' : 'rgba(42,255,138,0.55)'}`,
                  boxShadow: scanning
                    ? '0 0 24px rgba(255,68,68,0.22), inset 0 0 12px rgba(255,68,68,0.06)'
                    : '0 0 24px rgba(42,255,138,0.22), inset 0 0 12px rgba(42,255,138,0.06)',
                }}
              >
                <span
                  className={`text-base leading-none ${scanning ? 'animate-pulse' : ''}`}
                  style={{
                    color: scanning ? '#ff6b6b' : '#2aff8a',
                    filter: `drop-shadow(0 0 8px ${scanning ? '#ff6b6b' : '#2aff8a'})`,
                  }}
                >
                  {scanning ? '■' : '↺'}
                </span>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* hover tooltip */}
      {hovered && !selected && (
        <div className="absolute pointer-events-none z-20 rounded px-2.5 py-2 text-[10px] min-w-[150px]"
          style={{ left:tooltip.x, top:tooltip.y, background:'rgba(4,8,12,0.90)', border:'1px solid rgba(42,255,138,0.10)', backdropFilter:'blur(8px)' }}>
          <div className="font-bold" style={{color:'rgba(42,255,138,0.88)'}}>{hovered.ssid??'(hidden)'}</div>
          <div className="mt-0.5 font-mono" style={{fontSize:9,color:'rgba(42,255,138,0.32)'}}>{hovered.bssid}</div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5" style={{fontSize:9,color:'rgba(42,255,138,0.42)'}}>
            <span>CH {hovered.channel??'?'}</span>
            <span>{encLabel(hovered.encryption)}</span>
            <span>{hovered.power??'?'} dBm</span>
            {hovered.wps_enabled&&<span style={{color:'rgba(255,136,0,0.75)'}}>WPS</span>}
          </div>
        </div>
      )}

      {/* attack animation */}
      {attacking && (
        <AttackAnimation network={attacking} onFinish={()=>{setAttacking(null);setSelected(null)}} onHandoff={n=>{onAttack(n)}} />
      )}
    </div>
  )
}
