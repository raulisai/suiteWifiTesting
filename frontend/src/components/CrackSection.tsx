import { useState, useEffect, useRef, useCallback } from 'react'
import { credentialsApi } from '../api/credentials'
import { useWebSocket } from '../hooks/useWebSocket'
import { useTerminalStore } from '../store/terminal'
import type { WSEvent } from '../types/attack'

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */
interface WordlistEntry {
  name: string
  path: string
  size_mb: number
}

interface CrackSectionProps {
  handshakeId: number
  bssid: string
  ssid: string | null
  filePath: string
  onPasswordFound?: (password: string) => void
}

type CrackPhase = 'select' | 'cracking' | 'found' | 'failed'

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */
export function CrackSection({ handshakeId, bssid, ssid, filePath, onPasswordFound }: CrackSectionProps) {
  const [phase, setPhase] = useState<CrackPhase>('select')
  const [tab, setTab] = useState<'server' | 'custom'>('server')
  const [wordlists, setWordlists] = useState<WordlistEntry[]>([])
  const [loadingWl, setLoadingWl] = useState(false)
  const [selectedWl, setSelectedWl] = useState<string | null>(null)
  const [customPath, setCustomPath] = useState('')
  const [useHashcat, setUseHashcat] = useState(false)
  const [progress, setProgress] = useState(0)
  const [foundPassword, setFoundPassword] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const logsEndRef = useRef<HTMLDivElement>(null)
  const appendLine = useTerminalStore((s) => s.appendLine)

  /* effective wordlist path */
  const wordlist = tab === 'server' ? (selectedWl ?? '') : customPath.trim()

  /* ── fetch server wordlists ── */
  useEffect(() => {
    setLoadingWl(true)
    credentialsApi.listWordlists()
      .then(setWordlists)
      .catch(() => setWordlists([]))
      .finally(() => setLoadingWl(false))
  }, [])

  /* ── scroll logs to bottom ── */
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  /* ── WebSocket crack ── */
  const handleEvent = useCallback((event: WSEvent) => {
    appendLine(event)

    if (event.type === 'output' || event.type === 'step') {
      setLogs((prev) => [...prev.slice(-199), event.message])
    }
    if (event.type === 'progress' && event.progress !== undefined) {
      setProgress(event.progress)
    }
    if (event.type === 'credential') {
      const pwd = (event.data?.password as string) ?? event.message
      setFoundPassword(pwd)
      setPhase('found')
      onPasswordFound?.(pwd)
    }
    if (event.type === 'done') {
      if (phase !== 'found') setPhase('failed')
    }
    if (event.type === 'error') {
      setPhase('failed')
    }
  }, [appendLine, onPasswordFound, phase])

  const { status: wsStatus, connect, disconnect } = useWebSocket({
    path: '/api/attacks/crack',
    config: { handshake_id: handshakeId, wordlist, use_hashcat: useHashcat },
    onEvent: handleEvent,
  })

  const handleStartCrack = () => {
    setPhase('cracking')
    setLogs([])
    setProgress(0)
    setFoundPassword(null)
    connect()
  }

  const handleRetry = () => {
    disconnect()
    setPhase('select')
    setProgress(0)
    setLogs([])
    setFoundPassword(null)
  }

  /* ── Render ── */
  return (
    <div className="border border-dark-500 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-dark-700 px-4 py-2 flex items-center gap-2 border-b border-dark-600">
        <span className="text-brand-400 text-sm">🔓</span>
        <span className="text-sm font-semibold text-gray-200">Cracking de contraseña</span>
        <span className="ml-auto text-xs font-mono text-gray-500 truncate max-w-[12rem]">{filePath.split('/').pop()}</span>
      </div>

      {/* Handshake meta */}
      <div className="bg-dark-750 px-4 py-2 flex gap-4 text-xs border-b border-dark-600">
        <span className="text-gray-500">BSSID <span className="text-brand-300 font-mono">{bssid}</span></span>
        <span className="text-gray-500">SSID <span className="text-gray-200">{ssid ?? '—'}</span></span>
        <span className="text-gray-500">ID <span className="text-gray-400 font-mono">#{handshakeId}</span></span>
      </div>

      {/* Phase: select wordlist */}
      {phase === 'select' && (
        <div className="p-4 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 border-b border-dark-600">
            {(['server', 'custom'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs font-mono font-bold transition-colors border-b-2 -mb-px ${
                  tab === t
                    ? 'border-brand-500 text-brand-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {t === 'server' ? '📂 Diccionarios del servidor' : '✏️  Ruta personalizada'}
              </button>
            ))}
          </div>

          {/* Server wordlists */}
          {tab === 'server' && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {loadingWl && (
                <div className="text-xs text-gray-500 text-center py-4 animate-pulse">Cargando diccionarios…</div>
              )}
              {!loadingWl && wordlists.length === 0 && (
                <div className="text-xs text-gray-600 text-center py-4">
                  No se encontraron diccionarios en el servidor.<br/>
                  <span className="text-gray-500">Coloca archivos .txt/.lst en la carpeta wordlists.</span>
                </div>
              )}
              {wordlists.map((wl) => (
                <button
                  key={wl.path}
                  onClick={() => setSelectedWl(wl.path)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs font-mono transition-colors ${
                    selectedWl === wl.path
                      ? 'bg-brand-800 border border-brand-600 text-brand-200'
                      : 'bg-dark-700 border border-dark-600 text-gray-300 hover:border-dark-400'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-gray-500">{selectedWl === wl.path ? '●' : '○'}</span>
                    <span className="truncate max-w-[16rem]">{wl.name}</span>
                  </span>
                  <span className="text-gray-500 shrink-0 ml-2">{wl.size_mb} MB</span>
                </button>
              ))}
            </div>
          )}

          {/* Custom path */}
          {tab === 'custom' && (
            <div className="space-y-2">
              <label className="text-xs text-gray-400">Ruta del diccionario en el servidor:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  placeholder="/usr/share/wordlists/rockyou.txt"
                  className="flex-1 bg-dark-700 border border-dark-500 rounded px-3 py-1.5 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500"
                />
              </div>
              <p className="text-xs text-gray-600">Introduce la ruta absoluta de un archivo de contraseñas en el sistema del servidor.</p>
            </div>
          )}

          {/* Options */}
          <div className="flex items-center gap-3 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useHashcat}
                onChange={(e) => setUseHashcat(e.target.checked)}
                className="accent-brand-500"
              />
              <span className="text-xs text-gray-400">Usar Hashcat (GPU)</span>
            </label>
          </div>

          {/* Start button */}
          <button
            disabled={!wordlist}
            onClick={handleStartCrack}
            className="w-full py-2 rounded bg-brand-700 hover:bg-brand-600 disabled:bg-dark-600 disabled:text-gray-600 text-white text-sm font-bold transition-colors"
          >
            {wordlist ? '🚀 Iniciar cracking' : 'Selecciona un diccionario'}
          </button>
        </div>
      )}

      {/* Phase: cracking */}
      {phase === 'cracking' && (
        <div className="p-4 space-y-3">
          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span className="animate-pulse text-brand-400">⚙ Crackeando…</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 bg-dark-600 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Log */}
          <div className="bg-black rounded p-2 h-32 overflow-y-auto font-mono text-[11px] text-green-400 space-y-0.5">
            {logs.length === 0 && <span className="text-gray-600">Esperando salida…</span>}
            {logs.map((line, i) => (
              <div key={i} className="leading-snug">{line}</div>
            ))}
            <div ref={logsEndRef} />
          </div>

          {/* Stop */}
          <button
            onClick={handleRetry}
            className="px-4 py-1.5 rounded bg-red-800 hover:bg-red-700 text-white text-xs font-bold"
          >
            ✕ Detener
          </button>
        </div>
      )}

      {/* Phase: found */}
      {phase === 'found' && foundPassword && (
        <div className="p-4 space-y-3">
          <div className="bg-green-950 border border-green-700 rounded-lg p-4 text-center space-y-2">
            <div className="text-2xl">🏆</div>
            <div className="text-green-300 font-bold text-sm">¡Contraseña encontrada!</div>
            <div className="font-mono text-lg text-green-100 bg-black/40 px-4 py-2 rounded select-all">
              {foundPassword}
            </div>
            <div className="text-xs text-green-600">Guardada automáticamente en Credenciales</div>
          </div>
          <button
            onClick={handleRetry}
            className="w-full py-1.5 rounded bg-dark-600 hover:bg-dark-500 text-gray-300 text-xs"
          >
            Intentar con otro diccionario
          </button>
        </div>
      )}

      {/* Phase: failed */}
      {phase === 'failed' && (
        <div className="p-4 space-y-3">
          <div className="bg-red-950 border border-red-800 rounded-lg p-3 text-center space-y-1">
            <div className="text-red-400 font-bold text-sm">Contraseña no encontrada</div>
            <div className="text-xs text-red-600">
              {wsStatus === 'error'
                ? 'Error al conectar con el servicio de cracking.'
                : 'El diccionario seleccionado no contiene la contraseña.'}
            </div>
          </div>
          {/* Last logs */}
          {logs.length > 0 && (
            <div className="bg-black rounded p-2 h-24 overflow-y-auto font-mono text-[11px] text-red-400 space-y-0.5">
              {logs.slice(-20).map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}
          <button
            onClick={handleRetry}
            className="w-full py-2 rounded bg-brand-700 hover:bg-brand-600 text-white text-xs font-bold"
          >
            🔄 Intentar con otro diccionario
          </button>
        </div>
      )}
    </div>
  )
}
