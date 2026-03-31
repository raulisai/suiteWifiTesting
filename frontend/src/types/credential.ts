export interface Credential {
  id: number
  network_id: number
  bssid: string
  ssid: string | null
  wps_pin: string | null
  attack_type: string
  cracked_by: string
  found_at: string
}
