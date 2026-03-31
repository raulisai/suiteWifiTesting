import { useState } from 'react'
import { LiveTerminal } from '../components/LiveTerminal'
import { useWebSocket } from '../hooks/useWebSocket'
import { useTerminalStore } from '../store/terminal'
import type { WSEvent } from '../types/attack'

type QuickAction = {
  label: string
  path: string
  buildConfig: (iface: string) => Record<string, unknown>
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Escanear redes',
    path: '/api/networks/scan/stream',
    buildConfig: (iface) => ({ interface: iface, duration: 30 }),
  },
]

export function Terminal() {
  const appendLine = useTerminalStore((s) => s.appendLine)
  const [iface, setIface] = useState('wlan0mon')
  const [selected, setSelected] = useState<QuickAction>(QUICK_ACTIONS[0])

  const handleEvent = (event: WSEvent) => appendLine(event)

  const { status, connect, disconnect } = useWebSocket({
    path: selected.path,
    config: selected.buildConfig(iface),
    onEvent: handleEvent,
  })

  const isRunning = ['connecting', 'ready', 'running'].includes(status)

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] p-6 gap-4">
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-xl font-bold text-gray-100">Terminal Live</h1>
        <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
          status === 'running'  ? 'border-brand-500 text-brand-500 animate-pulse' :
          status === 'done'     ? 'border-brand-500 text-brand-500' :
          status === 'error'    ? 'border-red-500 text-red-400' :
          'border-dark-500 text-gray-500'
        }`}>{status}</span>
      </div>

      {/* Controls bar */}
      <div className="flex flex-wrap gap-3 items-end shrink-0 bg-dark-800 border border-dark-600 rounded p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Interfaz</label>
          <input
            className="bg-dark-700 border border-dark-500 rounded px-2 py-1 text-xs font-mono text-gray-200 w-32 focus:outline-none focus:border-brand-500"
            value={iface}
            onChange={(e) => setIface(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Acción rápida</label>
          <select
            className="bg-dark-700 border border-dark-500 rounded px-2 py-1 text-xs font-mono text-gray-200 focus:outline-none focus:border-brand-500"
            value={selected.label}
            onChange={(e) => setSelected(QUICK_ACTIONS.find((a) => a.label === e.target.value)!)}
          >
            {QUICK_ACTIONS.map((a) => (
              <option key={a.label}>{a.label}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 ml-auto">
          {!isRunning ? (
            <button
              onClick={connect}
              className="px-5 py-1.5 rounded bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-colors"
            >
              EJECUTAR
            </button>
          ) : (
            <button
              onClick={disconnect}
              className="px-5 py-1.5 rounded bg-red-800 hover:bg-red-700 text-white text-xs font-bold transition-colors"
            >
              DETENER
            </button>
          )}
        </div>
      </div>

      {/* Live terminal fills remaining space */}
      <div className="flex-1 min-h-0">
        <LiveTerminal />
      </div>
    </div>
  )
}
