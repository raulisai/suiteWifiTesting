import { create } from 'zustand'
import type { WSEvent } from '../types/attack'

export interface TerminalLine {
  id: number
  timestamp: string
  event: WSEvent
}

interface TerminalState {
  lines: TerminalLine[]
  maxLines: number
  appendLine: (event: WSEvent) => void
  clear: () => void
}

let lineCounter = 0

export const useTerminalStore = create<TerminalState>((set, get) => ({
  lines: [],
  maxLines: 1000,

  appendLine: (event) => {
    const line: TerminalLine = {
      id: ++lineCounter,
      timestamp: new Date().toLocaleTimeString(),
      event,
    }
    const current = get().lines
    const trimmed =
      current.length >= get().maxLines
        ? current.slice(current.length - get().maxLines + 1)
        : current
    set({ lines: [...trimmed, line] })
  },

  clear: () => set({ lines: [] }),
}))
