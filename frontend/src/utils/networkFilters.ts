import type { Network } from '../types/network'

// ── Filter Types ─────────────────────────────────────────────────────────────
export type MapFilter = 'all' | 'wpa' | 'wps' | 'open' | 'wep'

export interface FilterDef {
  key: MapFilter
  label: string
  sublabel?: string
  color: string
  match: (n: Network) => boolean
}

// ── Filter Definitions ───────────────────────────────────────────────────────
export const FILTER_DEFS: FilterDef[] = [
  {
    key: 'all',
    label: 'ALL',
    sublabel: 'Access Points',
    color: '#2aff8a',
    match: () => true,
  },
  {
    key: 'wpa',
    label: 'WPA/WPA2',
    sublabel: 'Handshake · PMKID',
    color: '#ffaa00',
    match: (n) => Boolean(n.encryption?.toUpperCase().includes('WPA')),
  },
  {
    key: 'wps',
    label: 'WPS',
    sublabel: 'Pixie Dust · Brute',
    color: '#ff6b35',
    match: (n) => !!(n.wps_enabled && !n.wps_locked),
  },
  {
    key: 'open',
    label: 'OPEN',
    sublabel: 'Sin cifrado',
    color: '#ff4444',
    match: (n) => !n.encryption || n.encryption === 'OPN',
  },
  {
    key: 'wep',
    label: 'WEP',
    sublabel: 'Cifrado roto',
    color: '#cc2222',
    match: (n) => n.encryption?.toUpperCase() === 'WEP',
  },
]

// ── Vulnerability Detection ──────────────────────────────────────────────────
export function isVulnerable(n: Network): boolean {
  return (
    (n.wps_enabled && !n.wps_locked) ||
    !n.encryption ||
    n.encryption === 'OPN' ||
    n.encryption?.toUpperCase() === 'WEP'
  )
}

// ── Encryption Color ─────────────────────────────────────────────────────────
export function getEncryptionColor(n: Network): string {
  if (!n.encryption || n.encryption === 'OPN') return '#ff4444'
  if (n.encryption?.toUpperCase() === 'WEP') return '#cc2222'
  if (n.encryption?.toUpperCase().includes('WPA')) return '#ffaa00'
  return '#2aff8a'
}

// ── Encryption Label ─────────────────────────────────────────────────────────
export function encLabel(enc: string | null): string {
  return enc || 'OPEN'
}

// ── Signal Utilities ─────────────────────────────────────────────────────────
export function signalPct(power: number | null | undefined): number {
  return Math.max(0, Math.min(100, Math.round((((power ?? -95) + 95) / 60) * 100)))
}

export function signalColor(pct: number): string {
  if (pct >= 70) return 'rgba(42,255,138,0.95)'
  if (pct >= 50) return 'rgba(42,255,138,0.72)'
  if (pct >= 30) return 'rgba(42,255,138,0.48)'
  if (pct >= 15) return 'rgba(42,255,138,0.30)'
  return 'rgba(42,255,138,0.16)'
}

// ── Network Counting ─────────────────────────────────────────────────────────
export function countByType(networks: Network[]) {
  return {
    total: networks.length,
    wpa: networks.filter((n) => n.encryption?.includes('WPA')).length,
    wps: networks.filter((n) => n.wps_enabled && !n.wps_locked).length,
    open: networks.filter((n) => !n.encryption || n.encryption === 'OPN').length,
    wep: networks.filter((n) => n.encryption === 'WEP').length,
    vulnerable: networks.filter(isVulnerable).length,
  }
}
