import { useEffect, useRef, useState } from 'react'
import { environmentApi, type WifiInterface } from '../api/environment'

type BusyMap = Record<string, boolean>

interface LogEntry {
  ts: string
  iface: string
  action: 'start' | 'stop'
  ok: boolean
  message: string
  output: string
  expanded: boolean
}

function timestamp() {
  return new Date().toLocaleTimeString('es', { hour12: false })
}

export function InterfacesPanel() {
  const [interfaces, setInterfaces] = useState<WifiInterface[]>([])
  const [busy, setBusy] = useState<BusyMap>({})
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const logEndRef = useRef<HTMLDivElement>(null)

  const refresh = () => {
    environmentApi.getInterfaces()
      .then((ifaces) => { setInterfaces(ifaces); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { refresh() }, [])

  // Auto-scroll log to bottom when new entries appear
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const isMonitor = (iface: WifiInterface) =>
    iface.type?.toLowerCase() === 'monitor' || iface.name.endsWith('mon')

  const addLog = (entry: Omit<LogEntry, 'expanded'>) =>
    setLogs((prev) => [...prev, { ...entry, expanded: !entry.ok }])

  const toggleLog = (idx: number) =>
    setLogs((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, expanded: !e.expanded } : e))
    )

  const handleToggle = async (iface: WifiInterface) => {
    const key = iface.name
    const action = isMonitor(iface) ? 'stop' : 'start'
    setBusy((b) => ({ ...b, [key]: true }))

    try {
      const res = action === 'start'
        ? await environmentApi.startMonitor(iface.name)
        : await environmentApi.stopMonitor(iface.name)

      addLog({
        ts: timestamp(),
        iface: iface.name,
        action,
        ok: res.success,
        message: res.message,
        output: res.output,
      })

      // Wait for kernel to finish creating/removing the interface
      await new Promise((r) => setTimeout(r, 1200))
      refresh()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      const message = typeof detail === 'object'
        ? detail.message
        : (detail ?? err?.message ?? 'Error desconocido')
      const output = typeof detail === 'object' ? (detail.output ?? '') : ''

      addLog({
        ts: timestamp(),
        iface: iface.name,
        action,
        ok: false,
        message,
        output,
      })
    } finally {
      setBusy((b) => ({ ...b, [key]: false }))
    }
  }

  return (
    <div className="space-y-3">

      {/* ── Interface list ── */}
      {loading ? (
        <div className="text-gray-500 text-sm animate-pulse">Detectando interfaces...</div>
      ) : interfaces.length === 0 ? (
        <div className="text-gray-500 text-sm">No se detectaron interfaces WiFi.</div>
      ) : (
        <div className="space-y-2">
          {interfaces.map((iface) => {
            const monitor = isMonitor(iface)
            const isBusy = !!busy[iface.name]

            return (
              <div
                key={iface.name}
                className="flex items-center justify-between bg-dark-700 border border-dark-600 rounded px-3 py-2"
              >
                {/* Left: info */}
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                      monitor
                        ? 'bg-[#2aff8a] shadow-[0_0_6px_#2aff8a]'
                        : 'bg-gray-600'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-gray-100 font-bold">
                        {iface.name}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${
                          monitor
                            ? 'bg-[#2aff8a]/15 text-[#2aff8a] border border-[#2aff8a]/30'
                            : 'bg-gray-700 text-gray-400 border border-gray-600'
                        }`}
                      >
                        {monitor ? 'monitor' : (iface.type ?? 'managed')}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-500 font-mono mt-0.5 space-x-2">
                      {iface.addr && <span>{iface.addr}</span>}
                      {iface.phy  && <span>{iface.phy}</span>}
                      {iface.channel != null && <span>ch {iface.channel}</span>}
                    </div>
                  </div>
                </div>

                {/* Right: toggle button */}
                <button
                  onClick={() => handleToggle(iface)}
                  disabled={isBusy}
                  className={`ml-3 shrink-0 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded border transition-all ${
                    isBusy
                      ? 'opacity-40 cursor-not-allowed border-gray-600 text-gray-500'
                      : monitor
                      ? 'border-red-500/60 text-red-400 hover:bg-red-500/10 hover:border-red-400'
                      : 'border-[#2aff8a]/60 text-[#2aff8a] hover:bg-[#2aff8a]/10 hover:border-[#2aff8a]'
                  }`}
                >
                  {isBusy ? (
                    <span className="animate-pulse">···</span>
                  ) : monitor ? (
                    'Desactivar'
                  ) : (
                    'Monitor'
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Refresh ── */}
      <button
        onClick={refresh}
        className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors uppercase tracking-wider"
      >
        ↻ Actualizar
      </button>

      {/* ── Log panel ── */}
      {logs.length > 0 && (
        <div className="mt-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
              Logs airmon-ng
            </span>
            <button
              onClick={() => setLogs([])}
              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors uppercase tracking-wider"
            >
              Limpiar
            </button>
          </div>

          <div className="bg-[#060a0d] border border-dark-600 rounded max-h-52 overflow-y-auto font-mono text-[11px]">
            {logs.map((entry, idx) => (
              <div
                key={idx}
                className={`border-b border-dark-700 last:border-0 ${
                  entry.ok ? '' : 'bg-red-950/20'
                }`}
              >
                {/* Summary row */}
                <button
                  onClick={() => toggleLog(idx)}
                  className="w-full text-left flex items-start gap-2 px-3 py-1.5 hover:bg-white/5 transition-colors"
                >
                  <span className={`shrink-0 mt-px ${entry.ok ? 'text-[#2aff8a]' : 'text-red-400'}`}>
                    {entry.ok ? '✓' : '✗'}
                  </span>
                  <span className="text-gray-500 shrink-0">{entry.ts}</span>
                  <span className="text-gray-400 shrink-0">
                    [{entry.iface}]
                  </span>
                  <span className={`flex-1 ${entry.ok ? 'text-gray-300' : 'text-red-300'}`}>
                    {entry.message}
                  </span>
                  {entry.output && (
                    <span className="text-gray-600 shrink-0">
                      {entry.expanded ? '▲' : '▼'}
                    </span>
                  )}
                </button>

                {/* Raw output (collapsible) */}
                {entry.expanded && entry.output && (
                  <pre className="px-4 pb-2 pt-0 text-gray-500 whitespace-pre-wrap break-all leading-relaxed">
                    {entry.output}
                  </pre>
                )}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  )
}
