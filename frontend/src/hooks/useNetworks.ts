import { useEffect } from 'react'
import { useNetworksStore } from '../store/networks'

export function useNetworks() {
  const { networks, loading, error, fetchNetworks, deleteNetwork } = useNetworksStore()

  useEffect(() => {
    fetchNetworks()
  }, [fetchNetworks])

  return { networks, loading, error, deleteNetwork, refetch: fetchNetworks }
}
