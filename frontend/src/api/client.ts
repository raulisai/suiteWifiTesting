import axios from 'axios'
import { toast } from '../store/toasts'

export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const WS_BASE = BASE_URL.replace(/^http/, 'ws')

// Suppress duplicate "no connection" toasts that flood when backend is down
// and many parallel requests fail at once.
const NETWORK_ERROR_COOLDOWN_MS = 8_000
let _lastNetworkErrorTs = 0

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT from localStorage on every request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Redirect to login on 401 + global error toasts
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const status: number | undefined = err.response?.status

    if (status === 401) {
      localStorage.removeItem('access_token')
    }

    // Build a human-readable message
    const detail: string =
      err.response?.data?.detail ??
      err.response?.data?.message ??
      err.message ??
      'Error desconocido'

    if (!status) {
      // Network error — backend is likely down. Throttle toasts so dozens of
      // parallel failed requests don't stack up into a toast storm.
      const now = Date.now()
      if (now - _lastNetworkErrorTs > NETWORK_ERROR_COOLDOWN_MS) {
        _lastNetworkErrorTs = now
        toast.error(
          'Sin conexión con el servidor',
          `No se puede alcanzar ${BASE_URL}. Verificá que el backend esté corriendo:\n` +
            'cd backend && sudo uvicorn main:app --host 0.0.0.0 --port 8000 --reload',
        )
      }
    } else if (status >= 500) {
      toast.error(`Error del servidor (${status})`, detail)
    } else if (status >= 400 && status !== 404) {
      // 404s are common (resource not found) and usually handled inline
      toast.warning(`Error ${status}`, detail)
    }

    return Promise.reject(err)
  }
)

export function wsUrl(path: string): string {
  return `${WS_BASE}${path}`
}
