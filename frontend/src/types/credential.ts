export interface Credential {
  id: number
  network_id: number
  bssid: string
  ssid: string | null
  password: string
  wps_pin: string | null
  attack_type: string
  cracked_by: string
  found_at: string
}

export interface Handshake {
  id: number
  network_id: number
  bssid: string
  ssid: string | null
  file_path: string
  file_type: 'cap' | 'pcapng' | 'hc22000'
  verified: boolean
  captured_at: string
}
