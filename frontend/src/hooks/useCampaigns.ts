import { useEffect } from 'react'
import { useCampaignsStore } from '../store/campaigns'

export function useCampaigns() {
  const { campaigns, loading, error, fetchCampaigns, createCampaign, deleteCampaign, stopCampaign } =
    useCampaignsStore()

  useEffect(() => {
    fetchCampaigns()
  }, [fetchCampaigns])

  return { campaigns, loading, error, createCampaign, deleteCampaign, stopCampaign, refetch: fetchCampaigns }
}
