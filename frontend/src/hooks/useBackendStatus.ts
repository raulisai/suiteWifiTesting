import { useEffect, useRef } from 'react'
import { BASE_URL } from '../api/client'
import { toast } from '../store/toasts'
import { useBackendStatusStore, type BackendStatus } from '../store/backendStatus'
import { useInterfacesStore } from '../store/interfaces'
import { useCredentialsStore } from '../store/credentials'

const HEALTH_URL = BASE_URL + '/api/environment/summary'
const POLL_INTERVAL_MS = 5_000
const REQUEST_TIMEOUT_MS = 3_000

// Re-export so callers don't need two imports
export type { BackendStatus }

/**
 * Polls the backend health endpoint every 5 s.
 * Writes the result to the shared backendStatus Zustand store.
 * Triggers a data refetch any time the backend transitions from offline → online.
 */
export function useBackendStatus(): BackendStatus {
  const setStatus = useBackendStatusStore((s) => s.setStatus)
  const prevStatus = useRef<BackendStatus>('checking')

  useEffect(() => {
    let cancelled = false

    async function check() {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      try {
        const res = await fetch(HEALTH_URL, { signal: controller.signal })
        clearTimeout(timer)
        if (cancelled) return

        const next: BackendStatus = res.ok ? 'online' : 'offline'

        if (prevStatus.current !== 'online' && next === 'online') {
          // Coming back online — notify user and refresh all stale data
          toast.success('Backend conectado', 'El servidor está disponible.')
          useInterfacesStore.getState().fetch()
          useCredentialsStore.getState().fetchCredentials()
          useCredentialsStore.getState().fetchHandshakes()
        }

        prevStatus.current = next
        setStatus(next)
      } catch {
        clearTimeout(timer)
        if (cancelled) return
        prevStatus.current = 'offline'
        setStatus('offline')
      }
    }

    check()
    const id = setInterval(check, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [setStatus])

  return useBackendStatusStore((s) => s.status)
}

