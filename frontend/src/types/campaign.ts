export type CampaignStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed'
export type TargetStatus = 'pending' | 'attacking' | 'cracking' | 'done' | 'failed'

export interface CampaignTarget {
  id: number
  network_id: number
  attack_types: string[]
  status: TargetStatus
  started_at: string | null
  ended_at: string | null
}

export interface Campaign {
  id: number
  name: string
  description: string | null
  status: CampaignStatus
  interface: string
  wordlist: string | null
  created_at: string
  started_at: string | null
  ended_at: string | null
  targets: CampaignTarget[]
}

export interface CampaignCreate {
  name: string
  description?: string
  interface: string
  wordlist?: string
  targets: { network_id: number; attack_types: string[] }[]
}
