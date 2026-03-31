export type AttackType = 'wpa_handshake' | 'wps_pixie' | 'wps_bruteforce' | 'pmkid' | 'crack'

export interface AttackStatus {
  id: string
  attack_type: AttackType
  status: 'running' | 'stopped' | 'done' | 'failed'
  started_at: string
  bssid: string | null
  result: Record<string, unknown> | null
}

export interface HandshakeAttackRequest {
  interface: string
  bssid: string
  channel: number
  client_mac?: string
  deauth_count?: number
  capture_timeout?: number
}

export interface WpsAttackRequest {
  interface: string
  bssid: string
  channel: number
  mode?: 'pixie' | 'bruteforce'
  timeout?: number
}

export interface PmkidAttackRequest {
  interface: string
  bssid?: string
  timeout?: number
}

export interface CrackRequest {
  handshake_id: number
  wordlist?: string
  use_hashcat?: boolean
  mask?: string
}

// WebSocket event types (server → client)
export type WSEventType =
  | 'ready'
  | 'start'
  | 'output'
  | 'step'
  | 'network_found'
  | 'handshake'
  | 'credential'
  | 'progress'
  | 'done'
  | 'error'
  | 'warning'

export interface WSEvent {
  type: WSEventType
  message: string
  data?: Record<string, unknown>
  progress?: number
  tool?: string
}
