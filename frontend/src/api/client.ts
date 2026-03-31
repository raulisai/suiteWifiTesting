import axios from 'axios'
import { toast } from '../store/toasts'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const WS_BASE = BASE_URL.replace(/^http/, 'ws')

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
      // Network error (backend no disponible, CORS, etc.)
      toast.error('Sin conexión con el servidor', detail)
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
