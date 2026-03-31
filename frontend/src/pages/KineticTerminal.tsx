import { useState, useEffect, useRef, useCallback } from 'react'
import { KineticSidebar }     from '../components/kinetic/KineticSidebar'
import { KineticHeader }      from '../components/kinetic/KineticHeader'
import { NetworkMap }         from '../components/kinetic/NetworkMap'
import { AlertFeed }          from '../components/kinetic/AlertFeed'
import { StatsBar }           from '../components/kinetic/StatsBar'
import { AttackConsole }      from '../components/kinetic/AttackConsole'
import { KineticInfoPanel }   from '../components/kinetic/KineticInfoPanel'
import { KineticCampaigns }   from '../components/kinetic/KineticCampaigns'
import { KineticCredentials } from '../components/kinetic/KineticCredentials'
import { KineticReports }     from '../components/kinetic/KineticReports'
import { useNetworksStore }   from '../store/networks'
import { useInterfaces }      from '../hooks/useInterfaces'
import { useInterfacesStore } from '../store/interfaces'
import type { Network }       from '../types/network'
import { wsUrl }              from '../api/client'
import type { WSEvent }       from '../types/attack'

export interface KineticAlert {
  id: number
  type: 'brute' | 'new' | 'pmkid' | 'handshake' | 'crack' | 'info'
  label: string
  value: string
  ts: number
}

export type KineticView = 'map' | 'console' | 'campaigns' | 'credentials' | 'reports'

export function KineticTerminal() {
  const { networks, addNetwork } = useNetworksStore()

  /* ── auto-fetch interfaces on mount ── */
  useInterfaces()
  const iface = useInterfacesStore((s) => s.selected)

  /* ── live scan state ── */
  const [scanning, setScanning]       = useState(false)
  const [packetRate, setPacketRate]   = useState(0)
  const [scanCount, setScanCount]     = useState(34221)
  const [alerts, setAlerts]           = useState<KineticAlert[]>([])
  const [view, setView]               = useState<KineticView>('map')
  const [scanLines, setScanLines]     = useState<string[]>([])
  const [attackLines, setAttackLines] = useState<string[]>([])
  const [attackTarget, setAttackTarget] = useState<Network | null>(null)
  const alertId = useRef(0)
  const wsRef   = useRef<WebSocket | null>(null)

  /* ── fake packet-rate ticker when scanning ── */
  useEffect(() => {
    if (!scanning) { setPacketRate(0); return }
    const t = setInterval(() => {
      setPacketRate(Math.round(1000 + Math.random() * 4000))
      setScanCount(c => c + Math.floor(Math.random() * 120))
    }, 800)
    return () => clearInterval(t)
  }, [scanning])

  /* ── push alert helper ── */
  const pushAlert = useCallback((type: KineticAlert['type'], label: string, value: string) => {
    const a: KineticAlert = { id: alertId.current++, type, label, value, ts: Date.now() }
    setAlerts(prev => [a, ...prev].slice(0, 40))
  }, [])

  /* ── start scan via WS ── */
  const startScan = useCallback(() => {
    if (wsRef.current) return
    setScanning(true)
    setScanLines([])

    const ws = new WebSocket(wsUrl('/api/networks/scan/stream'))
    wsRef.current = ws

    ws.onmessage = (msg) => {
      let ev: WSEvent
      try { ev = JSON.parse(msg.data) } catch { return }

      if (ev.type === 'ready') {
        ws.send(JSON.stringify({ interface: iface, duration: 60 }))
        return
      }

      if (ev.message) {
        setScanLines(prev => [...prev.slice(-200), ev.message!])
      }

      if (ev.type === 'data' && ev.data) {
        const d = ev.data as Record<string, unknown>
        if (d.bssid) {
          addNetwork(d as unknown as Network)
          pushAlert('new', 'NEW NETWORK', `${d.ssid ?? d.bssid}`)
        }
      }

      if (ev.type === 'done' || ev.type === 'error') {
        setScanning(false)
        wsRef.current = null
      }
    }

    ws.onerror  = () => { setScanning(false); wsRef.current = null }
    ws.onclose  = () => { setScanning(false); wsRef.current = null }
  }, [iface, addNetwork, pushAlert])

  const stopScan = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
    setScanning(false)
  }, [])

  /* ── derive stats ── */
  const apCount   = networks.length
  const clientCount = networks.reduce((s, n) => s + (n.wps_enabled ? 1 : 0) * 8 + 3, 0)
  const vulnCount  = networks.filter(n =>
    n.wps_enabled && !n.wps_locked || n.encryption === 'WEP'
  ).length

  return (
    <div className="flex h-screen bg-[#080c10] text-[#a8f0c6] font-mono overflow-hidden">

      {/* Left sidebar */}
      <KineticSidebar view={view} setView={setView} />

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Header */}
        <KineticHeader
          scanning={scanning}
          scanCount={scanCount}
          packetRate={packetRate}
        />

        {/* Collapsible Intel Panel */}
        <KineticInfoPanel networks={networks} />

        {/* Body */}
        <div className="flex flex-1 min-h-0">

          {/* Central panel */}
          <div className="flex-1 relative min-w-0">
            {view === 'map' ? (
              <NetworkMap
                networks={networks}
                scanning={scanning}
                onAttack={(n) => {
                  setAttackTarget(n)
                  pushAlert('handshake', 'TARGETING', n.ssid ?? n.bssid)
                  setView('console')
                }}
              />
            ) : view === 'console' ? (
              <AttackConsole
                networks={networks}
                initialTarget={attackTarget}
                scanLines={scanLines}
                attackLines={attackLines}
                setAttackLines={setAttackLines}
                pushAlert={pushAlert}
              />
            ) : view === 'campaigns' ? (
              <KineticCampaigns />
            ) : view === 'credentials' ? (
              <KineticCredentials />
            ) : (
              <KineticReports />
            )}
          </div>

          {/* Right alert feed — only visible for map/console */}
          {(view === 'map' || view === 'console') && (
            <AlertFeed alerts={alerts} />
          )}
        </div>

        {/* Bottom stats + CTA */}
        <StatsBar
          apCount={apCount}
          clientCount={clientCount}
          vulnCount={vulnCount}
          scanning={scanning}
          onStart={startScan}
          onStop={stopScan}
        />
      </div>
    </div>
  )
}
