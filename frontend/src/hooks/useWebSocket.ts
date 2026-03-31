import { useCallback, useEffect, useRef, useState } from 'react'
import type { WSEvent } from '../types/attack'
import { wsUrl } from '../api/client'

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
          // Send config immediately
          ws.send(JSON.stringify(config))
          break
        case 'start':
          setStatus('running')
          break
        case 'done':
          setStatus('done')
          break
        case 'error':
          setStatus('error')
          break
        default:
          break
      }

      onEvent?.(event)
    }

    ws.onerror = () => {
      setStatus('error')
    }

    ws.onclose = () => {
      setStatus('closed')
      wsRef.current = null
    }
  }, [path, config, onEvent])

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
