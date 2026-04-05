import { create } from 'zustand'

export type BackendStatus = 'checking' | 'online' | 'offline'

interface BackendStatusState {
  status: BackendStatus
  setStatus: (s: BackendStatus) => void
}

export const useBackendStatusStore = create<BackendStatusState>((set) => ({
  status: 'checking',
  setStatus: (status) => set({ status }),
}))

/** Read-only helper usable outside React components (e.g. in Zustand stores). */
export function getBackendStatus(): BackendStatus {
  return useBackendStatusStore.getState().status
}
