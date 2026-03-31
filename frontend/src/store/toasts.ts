import { create } from 'zustand'

export type ToastVariant = 'error' | 'success' | 'warning' | 'info'

export interface Toast {
  id: number
  variant: ToastVariant
  title: string
  message?: string
  /** Auto-dismiss delay in ms. 0 = sticky (manual dismiss only). */
  duration: number
}

interface ToastState {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'>) => number
  dismiss: (id: number) => void
  clear: () => void
}

const MAX_TOASTS = 6
let _counter = 0

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (toast) => {
    const id = ++_counter
    const current = get().toasts
    // Drop oldest if exceeding limit
    const trimmed =
      current.length >= MAX_TOASTS ? current.slice(current.length - MAX_TOASTS + 1) : current
    set({ toasts: [...trimmed, { ...toast, id }] })
    return id
  },

  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  clear: () => set({ toasts: [] }),
}))

// ── Convenience helpers (callable outside React components) ────────────────
export const toast = {
  error: (title: string, message?: string) =>
    useToastStore.getState().push({ variant: 'error', title, message, duration: 12_000 }),

  success: (title: string, message?: string) =>
    useToastStore.getState().push({ variant: 'success', title, message, duration: 5_000 }),

  warning: (title: string, message?: string) =>
    useToastStore.getState().push({ variant: 'warning', title, message, duration: 8_000 }),

  info: (title: string, message?: string) =>
    useToastStore.getState().push({ variant: 'info', title, message, duration: 5_000 }),
}
