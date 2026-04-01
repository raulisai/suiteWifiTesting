import { useState, useRef, useEffect, useCallback } from 'react'
import type { Network } from '../types/network'
import { useWebSocket } from '../hooks/useWebSocket'
import { useTerminalStore } from '../store/terminal'
import { useInterfacesStore } from '../store/interfaces'
import type { WSEvent } from '../types/attack'
import { AttackStepDiagram } from './AttackStepDiagram'
import type { AttackStep } from './AttackStepDiagram'
import { CrackSection } from './CrackSection'

/* ─────────────────────────────────────────────────────────────────── */
/* Types                                                                */
/* ─────────────────────────────────────────────────────────────────── */

interface AttackPanelProps {
  network: Network
  /** @deprecated — la interfaz se lee del store global. Se mantiene por compatibilidad. */
  interface_?: string
  onClose: () => void
}

type AttackMode = 'handshake' | 'wps_pixie' | 'wps_brute' | 'pmkid'
type PanelPhase = 'configure' | 'running' | 'done'

interface CapturedHandshake {
  id: number
  bssid: string
  file: string
}

/* ─────────────────────────────────────────────────────────────────── */
/* Step definitions per attack type                                    */
/* ─────────────────────────────────────────────────────────────────── */

const STEPS: Record<AttackMode, AttackStep[]> = {
  handshake: [
    { id: 'init',    label: 'Init',      icon: '⚙' },
    { id: 'capture', label: 'Captura',   icon: '📡' },
    { id: 'deauth',  label: 'Deauth',    icon: '⚡' },
    { id: 'waiting', label: 'Esperando', icon: '⏳' },
    { id: 'found',   label: 'Capturado', icon: '🤝' },
  ],
  wps_pixie: [
    { id: 'init',    label: 'Init',       icon: '⚙' },
    { id: 'attack',  label: 'Pixie Dust', icon: '✨' },
    { id: 'result',  label: 'Resultado',  icon: '🔑' },
  ],
  wps_brute: [
    { id: 'init',    label: 'Init',        icon: '⚙' },
    { id: 'attack',  label: 'Brute Force', icon: '🔨' },
    { id: 'result',  label: 'Resultado',   icon: '🔑' },
  ],
  pmkid: [
    { id: 'init',    label: 'Init',       icon: '⚙' },
    { id: 'capture', label: 'PMKID Cap',  icon: '📡' },
    { id: 'done',    label: 'Capturado',  icon: '✓'  },
  ],
}

/* Map incoming WSEvent to a step index (returns null if no change) */
function eventToStepIndex(mode: AttackMode, event: WSEvent): number | null {
  const msg = event.message?.toLowerCase() ?? ''

  if (mode === 'handshake') {
    if (event.type === 'start') return 1
    if (event.type === 'step' && msg.includes('deauth')) return 2
    if (event.type === 'step' && msg.includes('esperando')) return 3
    if (event.type === 'handshake') return 4
  }

  if (mode === 'wps_pixie' || mode === 'wps_brute') {
    if (event.type === 'start') return 1
    if (event.type === 'done' || event.type === 'credential') return 2
  }

  if (mode === 'pmkid') {
    if (event.type === 'start') return 1
    if (event.type === 'done') return 2
  }

  return null
}

/* ─────────────────────────────────────────────────────────────────── */
/* Attack mode metadata                                                 */
/* ─────────────────────────────────────────────────────────────────── */

const MODE_META: Record<AttackMode, { label: string; desc: string; color: string }> = {
  handshake: { label: 'WPA Handshake',        desc: 'Captura el handshake WPA/WPA2',       color: 'brand'  },
  wps_pixie: { label: 'WPS Pixie Dust',       desc: 'Explota la debilidad del nonce WPS',  color: 'yellow' },
  wps_brute: { label: 'WPS Brute Force',      desc: 'Fuerza bruta del PIN WPS',            color: 'orange' },
  pmkid:     { label: 'PMKID (sin clientes)', desc: 'Captura PMKID sin clientes',          color: 'purple' },
}

const COLOR_ACTIVE: Record<string, string> = {
  brand:  'bg-brand-600  border-brand-500  text-white',
  yellow: 'bg-yellow-700 border-yellow-600 text-white',
  orange: 'bg-orange-700 border-orange-600 text-white',
  purple: 'bg-purple-700 border-purple-600 text-white',
}

const COLOR_INACTIVE: Record<string, string> = {
  brand:  'bg-dark-700 border-dark-500 text-gray-400 hover:border-brand-600  hover:text-brand-300',
  yellow: 'bg-dark-700 border-dark-500 text-gray-400 hover:border-yellow-600 hover:text-yellow-300',
  orange: 'bg-dark-700 border-dark-500 text-gray-400 hover:border-orange-600 hover:text-orange-300',
  purple: 'bg-dark-700 border-dark-500 text-gray-400 hover:border-purple-600 hover:text-purple-300',
}

/* ─────────────────────────────────────────────────────────────────── */
/* Log line                                                             */
/* ─────────────────────────────────────────────────────────────────── */

interface LogLine {
  id: number
  time: string
  type: WSEvent['type']
  message: string
}

let logCounter = 0

/* ─────────────────────────────────────────────────────────────────── */
/* Main component                                                       */
/* ─────────────────────────────────────────────────────────────────── */

export function AttackPanel({ network, onClose }: AttackPanelProps) {
  const [mode, setMode]                 = useState<AttackMode>('handshake')
  const [phase, setPhase]               = useState<PanelPhase>('configure')
  const [currentStep, setCurrentStep]   = useState(-1)
  const [stepStatus, setStepStatus]     = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [logs, setLogs]                 = useState<LogLine[]>([])
  const [progress, setProgress]         = useState(0)
  const [handshake, setHandshake]       = useState<CapturedHandshake | null>(null)
  const [showCrack, setShowCrack]       = useState(false)
  const [foundPassword, setFoundPassword] = useState<string | null>(null)
  const [endMessage, setEndMessage]     = useState('')
  const [credentialFound, setCredentialFound] = useState<string | null>(null)

  const logsEndRef = useRef<HTMLDivElement>(null)
  const appendLine = useTerminalStore((s) => s.appendLine)
  const interface_ = useInterfacesStore((s) => s.selected)

  /* Auto-scroll logs */
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  /* ── Reset when mode changes (configure phase only) ── */
  const handleModeChange = (newMode: AttackMode) => {
    if (phase !== 'configure') return
    setMode(newMode)
    setCurrentStep(-1)
    setStepStatus('idle')
    setLogs([])
    setHandshake(null)
    setShowCrack(false)
    setFoundPassword(null)
    setCredentialFound(null)
    setProgress(0)
    setEndMessage('')
  }

  /* ── WebSocket event handler ── */
  const handleEvent = useCallback((event: WSEvent) => {
    appendLine(event)

    setLogs((prev) => [
      ...prev.slice(-299),
      {
        id: ++logCounter,
        time: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        type: event.type,
        message: event.message,
      },
    ])

    setMode((currentMode) => {
      const idx = eventToStepIndex(currentMode, event)
      if (idx !== null) setCurrentStep(idx)
      return currentMode
    })

    if (event.progress !== undefined) setProgress(event.progress)

    if (event.type === 'handshake' && event.data) {
      setHandshake({
        id:    event.data.handshake_id as number,
        bssid: event.data.bssid as string,
        file:  event.data.file as string,
      })
      setStepStatus('done')
    }

    if (event.type === 'credential' && event.data) {
      const pwd = (event.data.password as string) ?? event.message
      setCredentialFound(pwd)
      setStepStatus('done')
    }

    if (event.type === 'done') {
      setPhase('done')
      setEndMessage(event.message ?? 'Completado.')
      setStepStatus((s) => s === 'done' ? 'done' : 'done')
    }
    if (event.type === 'error') {
      setPhase('done')
      setEndMessage(event.message ?? 'Error desconocido.')
      setStepStatus('error')
    }
  }, [appendLine])

  /* ── WebSocket ── */
  const configMap: Record<AttackMode, { path: string; config: Record<string, unknown> }> = {
    handshake: {
      path: '/api/attacks/handshake',
      config: { interface: interface_, bssid: network.bssid, channel: network.channel ?? 6, deauth_count: 10, capture_timeout: 300 },
    },
    wps_pixie: {
      path: '/api/attacks/wps',
      config: { interface: interface_, bssid: network.bssid, channel: network.channel ?? 6, mode: 'pixie' },
    },
    wps_brute: {
      path: '/api/attacks/wps',
      config: { interface: interface_, bssid: network.bssid, channel: network.channel ?? 6, mode: 'bruteforce' },
    },
    pmkid: {
      path: '/api/attacks/pmkid',
      config: { interface: interface_, bssid: network.bssid, timeout: 120 },
    },
  }

  const { path, config } = configMap[mode]
  const { status: wsStatus, connect, disconnect } = useWebSocket({ path, config, onEvent: handleEvent })

  /* ── Handlers ── */
  const handleStart = () => {
    setPhase('running')
    setCurrentStep(0)
    setStepStatus('running')
    setLogs([])
    setProgress(0)
    setHandshake(null)
    setShowCrack(false)
    setFoundPassword(null)
    setCredentialFound(null)
    setEndMessage('')
    connect()
  }

  const handleRetry = () => {
    disconnect()
    setPhase('configure')
    setCurrentStep(-1)
    setStepStatus('idle')
    setLogs([])
    setProgress(0)
    setHandshake(null)
    setShowCrack(false)
    setFoundPassword(null)
    setCredentialFound(null)
    setEndMessage('')
  }

  const handleStop = () => {
    disconnect()
    setPhase('done')
    setStepStatus('error')
    setEndMessage('Ataque detenido manualmente.')
  }

  /* ── Log line color ── */
  const lineColor = (type: WSEvent['type']) => {
    switch (type) {
      case 'error':      return 'text-red-400'
      case 'warning':    return 'text-yellow-400'
      case 'handshake':  return 'text-green-300 font-semibold'
      case 'credential': return 'text-green-300 font-semibold'
      case 'step':       return 'text-brand-300'
      case 'done':       return 'text-green-400 font-semibold'
      case 'progress':   return 'text-gray-600'
      default:           return 'text-gray-300'
    }
  }

  /* ─────────────────────────────────────────────────────────────── */
  /* Render                                                           */
  /* ─────────────────────────────────────────────────────────────── */
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden shadow-xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600 bg-dark-750">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
          <div>
            <div className="text-sm font-bold text-gray-100 leading-none">{network.ssid ?? 'Red oculta'}</div>
            <div className="text-[11px] text-gray-500 font-mono mt-0.5">{network.bssid} · CH {network.channel ?? '?'} · {network.encryption ?? '?'}</div>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-300 text-lg leading-none">✕</button>
      </div>

      <div className="p-4 space-y-4">

        {/* ── Attack mode selector ── */}
        {phase === 'configure' && (
          <div className="space-y-2">
            <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Tipo de ataque</div>
            <div className="grid grid-cols-2 gap-2">
              {(['handshake', 'wps_pixie', 'wps_brute', 'pmkid'] as AttackMode[]).map((id) => {
                const meta     = MODE_META[id]
                const isSelected = mode === id
                const disabled = (id === 'wps_pixie' || id === 'wps_brute') && (!network.wps_enabled || network.wps_locked)
                return (
                  <button
                    key={id}
                    disabled={disabled}
                    onClick={() => handleModeChange(id)}
                    className={`px-3 py-2.5 rounded-lg text-left border transition-all ${
                      disabled
                        ? 'bg-dark-700 border-dark-600 text-gray-600 cursor-not-allowed opacity-50'
                        : isSelected
                        ? COLOR_ACTIVE[meta.color]
                        : COLOR_INACTIVE[meta.color]
                    }`}
                  >
                    <div className="text-xs font-bold leading-none">{meta.label}</div>
                    <div className={`text-[10px] mt-1 leading-tight ${isSelected ? 'text-white/70' : 'text-gray-600'}`}>{meta.desc}</div>
                    {disabled && <div className="text-[10px] text-red-600 mt-0.5">WPS desactivado o bloqueado</div>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Selected mode label (running / done phase) ── */}
        {phase !== 'configure' && (
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${COLOR_ACTIVE[MODE_META[mode].color]}`}>
              {MODE_META[mode].label}
            </span>
            <span className="text-xs text-gray-500">{network.ssid ?? network.bssid}</span>
          </div>
        )}

        {/* ── Step diagram (running / done phases) ── */}
        {phase !== 'configure' && (
          <AttackStepDiagram
            steps={STEPS[mode]}
            currentIndex={currentStep}
            status={stepStatus}
          />
        )}

        {/* ── Progress bar ── */}
        {phase === 'running' && progress > 0 && (
          <div className="h-1 bg-dark-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* ── Live log ── */}
        {(phase === 'running' || (phase === 'done' && logs.length > 0)) && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-gray-600 uppercase tracking-widest">Salida en tiempo real</span>
              {phase === 'running' && (
                <span className="text-[10px] font-mono text-brand-500 animate-pulse">● LIVE</span>
              )}
            </div>
            <div className="bg-black rounded-lg p-2.5 h-44 overflow-y-auto font-mono text-[11px] space-y-0.5">
              {logs.length === 0 && <span className="text-gray-600 animate-pulse">Conectando…</span>}
              {logs.map((line) => (
                <div key={line.id} className="flex gap-2 leading-snug">
                  <span className="text-gray-700 shrink-0">{line.time}</span>
                  <span className={lineColor(line.type)}>{line.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* ── Handshake captured card ── */}
        {handshake && (
          <div className="bg-green-950 border border-green-700 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-base">🤝</span>
              <span className="text-green-300 font-bold text-sm">Handshake capturado</span>
              <span className="ml-auto text-xs font-mono text-green-700">ID #{handshake.id}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="text-gray-500">BSSID <span className="text-green-300 font-mono">{handshake.bssid}</span></div>
              <div className="text-gray-500">SSID <span className="text-gray-200">{network.ssid ?? '—'}</span></div>
              <div className="col-span-2 text-gray-500 break-all">Archivo <span className="text-gray-400 font-mono text-[10px]">{handshake.file}</span></div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[10px] text-green-600">✓ Guardado en Credenciales</span>
              {!showCrack && (
                <button
                  onClick={() => setShowCrack(true)}
                  className="ml-auto px-3 py-1 rounded bg-brand-700 hover:bg-brand-600 text-white text-xs font-bold"
                >
                  🔓 Crackear contraseña
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── WPS credential card ── */}
        {credentialFound && (
          <div className="bg-green-950 border border-green-700 rounded-lg p-3 space-y-2 text-center">
            <div className="text-xl">🏆</div>
            <div className="text-green-300 font-bold text-sm">¡Credencial WPS encontrada!</div>
            <div className="font-mono text-lg text-green-100 bg-black/40 px-4 py-2 rounded select-all">{credentialFound}</div>
            <div className="text-[10px] text-green-600">✓ Guardado automáticamente en Credenciales</div>
          </div>
        )}

        {/* ── End message ── */}
        {phase === 'done' && endMessage && !handshake && !credentialFound && (
          <div className={`rounded-lg px-3 py-2 text-xs ${
            stepStatus === 'error'
              ? 'bg-red-950 border border-red-800 text-red-300'
              : 'bg-dark-700 border border-dark-500 text-gray-300'
          }`}>
            {stepStatus === 'error' ? '✕ ' : '✓ '}{endMessage}
          </div>
        )}

        {/* ── Crack section ── */}
        {showCrack && handshake && (
          <CrackSection
            handshakeId={handshake.id}
            bssid={handshake.bssid}
            ssid={network.ssid}
            filePath={handshake.file}
            onPasswordFound={(pwd) => setFoundPassword(pwd)}
          />
        )}

        {/* ── Cracked password banner ── */}
        {foundPassword && (
          <div className="bg-brand-950 border border-brand-700 rounded-lg px-4 py-2 text-center">
            <div className="text-xs text-brand-400">Contraseña crackeada</div>
            <div className="font-mono text-base text-brand-100 select-all mt-0.5">{foundPassword}</div>
          </div>
        )}

        {/* ── Action buttons ── */}
        <div className="flex items-center justify-between pt-1 border-t border-dark-600">
          <span className={`text-[11px] font-mono uppercase ${
            wsStatus === 'running'    ? 'text-brand-400 animate-pulse' :
            wsStatus === 'done'       ? 'text-green-400' :
            wsStatus === 'error'      ? 'text-red-400' :
            wsStatus === 'connecting' || wsStatus === 'ready' ? 'text-yellow-400 animate-pulse' :
            'text-gray-600'
          }`}>
            {wsStatus}
          </span>

          <div className="flex gap-2">
            {phase === 'done' && (
              <button
                onClick={handleRetry}
                className="px-3 py-1.5 rounded bg-dark-600 hover:bg-dark-500 text-gray-200 text-xs font-bold border border-dark-400"
              >
                🔄 Reintentar
              </button>
            )}

            {phase === 'configure' && (
              <button
                onClick={handleStart}
                disabled={!interface_}
                className="px-5 py-1.5 rounded bg-brand-600 hover:bg-brand-500 disabled:bg-dark-600 disabled:text-gray-600 text-white text-xs font-bold transition-colors"
              >
                {interface_ ? '▶ Iniciar ataque' : 'Sin interfaz seleccionada'}
              </button>
            )}

            {phase === 'running' && (
              <button
                onClick={handleStop}
                className="px-4 py-1.5 rounded bg-red-800 hover:bg-red-700 text-white text-xs font-bold"
              >
                ✕ Detener
              </button>
            )}
          </div>
        </div>

      </div>{/* end p-4 */}
    </div>
  )
}
