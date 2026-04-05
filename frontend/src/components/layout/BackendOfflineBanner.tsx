import { useState } from 'react'
import type { BackendStatus } from '../../hooks/useBackendStatus'

const START_CMD = 'cd backend && sudo uvicorn main:app --host 0.0.0.0 --port 8000 --reload'

interface Props {
  status: BackendStatus
}

export function BackendOfflineBanner({ status }: Props) {
  const [copied, setCopied] = useState(false)

  if (status === 'online' || status === 'checking') return null

  function handleCopy() {
    navigator.clipboard.writeText(START_CMD).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2_000)
    })
  }

  return (
    <div
      role="alert"
      className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 bg-red-950 border-b border-red-700 text-sm font-mono"
    >
      {/* Icon + title */}
      <span className="text-red-400 font-bold shrink-0">✖ Backend offline</span>

      <span className="text-red-300 grow">
        No se puede conectar a{' '}
        <code className="text-red-200 bg-red-900/60 px-1 rounded">:8000</code>
        {' '}— todas las llamadas a la API y WebSockets fallarán.
      </span>

      {/* Action section */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-gray-400 hidden md:inline">Iniciá el backend:</span>
        <code className="bg-dark-700 border border-dark-500 text-green-400 px-2 py-0.5 rounded text-xs truncate max-w-xs">
          {START_CMD}
        </code>
        <button
          onClick={handleCopy}
          className="shrink-0 px-2 py-0.5 rounded border border-dark-500 bg-dark-700 hover:bg-dark-600 text-gray-300 text-xs transition-colors"
          title="Copiar comando"
        >
          {copied ? '✔ Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  )
}
