import { useCallback, useEffect, useRef, useState } from 'react'
import type { WSEvent } from '../types/attack'
import { wsUrl } from '../api/client'
import { toast } from '../store/toasts'

type WSStatus = 'idle' | 'connecting' | 'ready' | 'running' | 'done' | 'error' | 'closed'

interface UseWebSocketOptions {
  path: string
  config: Record<string, unknown>
  onEvent?: (event: WSEvent) => void
  autoConnect?: boolean
}

interface UseWebSocketReturn {
  status: WSStatus
  connect: () => void
  disconnect: () => void
}

/**
 * Generic WebSocket hook that implements the standard ready→config→events protocol.
 *
 * Usage:
 *   const { status, connect, disconnect } = useWebSocket({
 *     path: '/api/attacks/handshake',
 *     config: { interface: 'wlan0mon', bssid: '...', channel: 6 },
 *     onEvent: (e) => terminalStore.appendLine(e),
 *   })
 */
export function useWebSocket({
  path,
  config,
  onEvent,
  autoConnect = false,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [status, setStatus] = useState<WSStatus>('idle')
  const wsRef = useRef<WebSocket | null>(null)

  // Keep refs so the stable `connect` callback always sees the latest values
  // without those values appearing in its dependency array.
  // If config/onEvent were deps, a new object literal on every render would
  // recreate `connect`, triggering the useEffect cleanup which calls
  // disconnect() and closes a WebSocket that is still in CONNECTING state —
  // causing the browser to fire onerror (code 1006) and the error toast.
  const configRef = useRef(config)
  configRef.current = config
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) return

    setStatus('connecting')
    const ws = new WebSocket(wsUrl(path))
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('connecting') // waiting for "ready" event from server
    }

    ws.onmessage = (msg) => {
      let event: WSEvent
      try {
        event = JSON.parse(msg.data) as WSEvent
      } catch {
        return
      }

      switch (event.type) {
        case 'ready':
          setStatus('ready')
          // Use ref so we always send the latest config without needing it
          // as a useCallback dependency.
          ws.send(JSON.stringify(configRef.current))
          break
        case 'start':
          setStatus('running')
          break
        case 'done':
          setStatus('done')
          toast.success('Completado', event.message || 'Operación finalizada.')
          break
        case 'error':
          setStatus('error')
          toast.error('Error', event.message || 'Ocurrió un error en la operación.')
          break
        case 'warning':
          toast.warning('Advertencia', event.message)
          break
        default:
          break
      }

      onEventRef.current?.(event)
    }

    ws.onerror = () => {
      setStatus('error')
      toast.error(
        'WebSocket sin conexión',
        `No se pudo conectar a ${path}. Si el backend está caído, inicialo con:\n` +
          'cd backend && sudo uvicorn main:app --host 0.0.0.0 --port 8000 --reload',
      )
    }

    ws.onclose = () => {
      setStatus('closed')
      wsRef.current = null
    }
  }, [path])  // Only `path` as dep — config/onEvent are accessed via refs

  const disconnect = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
    setStatus('idle')
  }, [])

  useEffect(() => {
    if (autoConnect) connect()
    return () => disconnect()
  }, [autoConnect, connect, disconnect])

  return { status, connect, disconnect }
}
