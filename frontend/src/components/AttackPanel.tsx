import { useState } from 'react'
import type { Network } from '../types/network'
import { useWebSocket } from '../hooks/useWebSocket'
import { useTerminalStore } from '../store/terminal'
import { useInterfacesStore } from '../store/interfaces'
import type { WSEvent } from '../types/attack'

interface AttackPanelProps {
  network: Network
  /** @deprecated — la interfaz se lee del store global. Se mantiene por compatibilidad. */
  interface_?: string
  onClose: () => void
}

type AttackMode = 'handshake' | 'wps_pixie' | 'wps_brute' | 'pmkid'

export function AttackPanel({ network, onClose }: AttackPanelProps) {
  const [mode, setMode] = useState<AttackMode>('handshake')
  const appendLine = useTerminalStore((s) => s.appendLine)
  const interface_ = useInterfacesStore((s) => s.selected)

  const configMap: Record<AttackMode, { path: string; config: Record<string, unknown> }> = {
    handshake: {
      path: '/api/attacks/handshake',
      config: {
        interface: interface_,
        bssid: network.bssid,
        channel: network.channel ?? 6,
        deauth_count: 10,
        capture_timeout: 300,
      },
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

  const handleEvent = (event: WSEvent) => appendLine(event)

  const { status, connect, disconnect } = useWebSocket({ path, config, onEvent: handleEvent })

  const isRunning = status === 'connecting' || status === 'ready' || status === 'running'

  const attacks: { id: AttackMode; label: string; disabled?: boolean }[] = [
    { id: 'handshake', label: 'WPA Handshake' },
    { id: 'wps_pixie', label: 'WPS Pixie Dust', disabled: !network.wps_enabled || network.wps_locked },
    { id: 'wps_brute', label: 'WPS Brute Force', disabled: !network.wps_enabled || network.wps_locked },
    { id: 'pmkid',     label: 'PMKID (sin clientes)' },
  ]

  return (
    <div className="bg-dark-800 border border-dark-600 rounded p-4 space-y-4">
      {/* Target info */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-gray-100">{network.ssid ?? 'Red oculta'}</div>
          <div className="text-xs text-gray-500 font-mono">{network.bssid} · CH {network.channel ?? '?'}</div>
        </div>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-300 text-lg">✕</button>
      </div>

      {/* Attack selector */}
      <div className="flex flex-wrap gap-2">
        {attacks.map(({ id, label, disabled }) => (
          <button
            key={id}
            disabled={disabled || isRunning}
            onClick={() => setMode(id)}
            className={`px-3 py-1 rounded text-xs font-mono font-bold transition-colors ${
              mode === id
                ? 'bg-brand-600 text-white'
                : disabled
                ? 'bg-dark-700 text-gray-600 cursor-not-allowed'
                : 'bg-dark-700 text-gray-300 hover:bg-dark-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Status + controls */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-mono ${
          status === 'running'  ? 'text-brand-500 animate-pulse' :
          status === 'done'     ? 'text-brand-500' :
          status === 'error'    ? 'text-red-400' :
          'text-gray-500'
        }`}>
          {status.toUpperCase()}
        </span>

        <div className="flex gap-2">
          {!isRunning ? (
            <button
              onClick={connect}
              className="px-4 py-1.5 rounded bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-colors"
            >
              INICIAR
            </button>
          ) : (
            <button
              onClick={disconnect}
              className="px-4 py-1.5 rounded bg-red-800 hover:bg-red-700 text-white text-xs font-bold transition-colors"
            >
              DETENER
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
