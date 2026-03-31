import { useEffect } from 'react'
import { useInterfacesStore } from '../store/interfaces'

/**
 * Auto-fetches interfaces on mount and exposes the store.
 * Use `selected` as the interface name for all scan/attack calls.
 */
export function useInterfaces() {
  const store = useInterfacesStore()

  useEffect(() => {
    store.fetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return store
}
