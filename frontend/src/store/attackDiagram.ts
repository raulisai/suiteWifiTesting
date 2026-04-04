import { create } from 'zustand'
import type { Network } from '../types/network'

// Client discovered during scan
export interface DiagramClient {
  mac: string
  bssid: string
  power: number | null
  packets: number
  probes: string[]
  lastSeen: string
  isTarget: boolean
  isDeauthing: boolean
}

// Animated packet for deauth visualization
export interface DeauthPacket {
  id: number
  targetMac: string | null // null = broadcast
  progress: number // 0-1
  type: 'deauth' | 'handshake'
}

// Attack configuration
export interface AttackConfig {
  deauthCount: number       // 16, 32, 64, 128
  maxRetries: number        // 1, 3, 5, 10
  deauthInterval: number    // seconds between bursts
}

// Log entry
export interface LogEntry {
  id: number
  timestamp: string
  type: 'info' | 'step' | 'output' | 'warning' | 'error' | 'success'
  message: string
  tool?: string
}

export type AttackPhase = 'idle' | 'scanning' | 'attacking' | 'captured' | 'failed'

interface AttackDiagramState {
  // Target AP
  targetAP: Network | null
  setTargetAP: (ap: Network | null) => void

  // Discovered clients
  clients: DiagramClient[]
  addClient: (client: Omit<DiagramClient, 'isTarget' | 'isDeauthing'>) => void
  updateClient: (mac: string, updates: Partial<DiagramClient>) => void
  setClientDeauthing: (mac: string, deauthing: boolean) => void
  clearClients: () => void

  // Attack state
  attackPhase: AttackPhase
  setAttackPhase: (phase: AttackPhase) => void

  // Selected target (null = broadcast deauth to all)
  targetClient: string | null
  setTargetClient: (mac: string | null) => void

  // Configuration
  config: AttackConfig
  updateConfig: (updates: Partial<AttackConfig>) => void

  // Logs
  logs: LogEntry[]
  addLog: (type: LogEntry['type'], message: string, tool?: string) => void
  clearLogs: () => void

  // Animation state
  packets: DeauthPacket[]
  addPacket: (targetMac: string | null, type: DeauthPacket['type']) => void
  updatePackets: () => void
  clearPackets: () => void

  // WebSocket connection state
  wsConnected: boolean
  setWsConnected: (connected: boolean) => void

  // Handshake result
  handshakeId: number | null
  setHandshakeId: (id: number | null) => void

  // Reset all state
  reset: () => void
}

let packetIdCounter = 0
let logIdCounter = 0

const initialConfig: AttackConfig = {
  deauthCount: 64,
  maxRetries: 5,
  deauthInterval: 20,
}

export const useAttackDiagramStore = create<AttackDiagramState>((set) => ({
  // Target AP
  targetAP: null,
  setTargetAP: (ap) => set({ targetAP: ap }),

  // Clients
  clients: [],
  addClient: (client) => set((state) => {
    // Don't add duplicate
    if (state.clients.some(c => c.mac === client.mac)) {
      return state
    }
    return {
      clients: [...state.clients, { ...client, isTarget: false, isDeauthing: false }]
    }
  }),
  updateClient: (mac, updates) => set((state) => ({
    clients: state.clients.map(c =>
      c.mac === mac ? { ...c, ...updates } : c
    )
  })),
  setClientDeauthing: (mac, deauthing) => set((state) => ({
    clients: state.clients.map(c =>
      c.mac === mac ? { ...c, isDeauthing: deauthing } : c
    )
  })),
  clearClients: () => set({ clients: [] }),

  // Attack phase
  attackPhase: 'idle',
  setAttackPhase: (phase) => set({ attackPhase: phase }),

  // Target client for deauth
  targetClient: null,
  setTargetClient: (mac) => set((state) => ({
    targetClient: mac,
    clients: state.clients.map(c => ({
      ...c,
      isTarget: c.mac === mac
    }))
  })),

  // Config
  config: initialConfig,
  updateConfig: (updates) => set((state) => ({
    config: { ...state.config, ...updates }
  })),

  // Logs
  logs: [],
  addLog: (type, message, tool) => set((state) => ({
    logs: [
      ...state.logs.slice(-200), // Keep last 200 entries
      {
        id: ++logIdCounter,
        timestamp: new Date().toLocaleTimeString(),
        type,
        message,
        tool
      }
    ]
  })),
  clearLogs: () => set({ logs: [] }),

  // Packets
  packets: [],
  addPacket: (targetMac, type) => set((state) => ({
    packets: [
      ...state.packets.slice(-50), // Max 50 packets
      {
        id: ++packetIdCounter,
        targetMac,
        progress: 0,
        type
      }
    ]
  })),
  updatePackets: () => set((state) => ({
    packets: state.packets
      .map(p => ({ ...p, progress: Math.min(1, p.progress + 0.04) }))
      .filter(p => p.progress < 1)
  })),
  clearPackets: () => set({ packets: [] }),

  // WebSocket
  wsConnected: false,
  setWsConnected: (connected) => set({ wsConnected: connected }),

  // Handshake
  handshakeId: null,
  setHandshakeId: (id) => set({ handshakeId: id }),

  // Reset
  reset: () => set({
    targetAP: null,
    clients: [],
    attackPhase: 'idle',
    targetClient: null,
    config: initialConfig,
    logs: [],
    packets: [],
    wsConnected: false,
    handshakeId: null
  })
}))
