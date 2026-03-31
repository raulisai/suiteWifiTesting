export interface Network {
  id: number
  bssid: string
  ssid: string | null
  channel: number | null
  frequency: string | null
  power: number | null
  encryption: string | null
  cipher: string | null
  auth: string | null
  wps_enabled: boolean
  wps_locked: boolean
  vendor: string | null
  first_seen: string
  last_seen: string
}

export interface NetworkScanRequest {
  interface: string
  duration: number
}
