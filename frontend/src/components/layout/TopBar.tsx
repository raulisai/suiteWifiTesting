import { useEffect, useState } from 'react'
import { environmentApi, type EnvironmentSummary } from '../../api/environment'
import { InterfaceSelector } from '../InterfaceSelector'

export function TopBar() {
  const [summary, setSummary] = useState<EnvironmentSummary | null>(null)

  useEffect(() => {
    environmentApi.getSummary().then(setSummary).catch(() => {})
    const id = setInterval(() => {
      environmentApi.getSummary().then(setSummary).catch(() => {})
    }, 30_000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="flex items-center justify-between px-4 md:px-6 min-h-12 py-1.5 bg-dark-800 border-b border-dark-600 shrink-0 flex-wrap gap-y-1.5 gap-x-3">
      <span className="text-sm text-gray-500 font-mono whitespace-nowrap">WiFi Pentesting Suite</span>

      <div className="flex items-center gap-2 md:gap-4 text-xs font-mono flex-wrap">
        <InterfaceSelector compact />
        {summary ? (
          <>
            <span
              className={`px-2 py-0.5 rounded border text-xs font-bold whitespace-nowrap ${
                summary.ready
                  ? 'border-brand-500 text-brand-500'
                  : 'border-yellow-500 text-yellow-400'
              }`}
            >
              {summary.ready ? 'LISTO' : 'PARCIAL'}
            </span>
            <span className="text-gray-500 hidden sm:inline whitespace-nowrap">
              {summary.essential_installed}/{summary.essential_total} esen.
            </span>
            <span className="text-gray-500 hidden lg:inline whitespace-nowrap">
              {summary.optional_installed}/{summary.optional_total} opc.
            </span>
          </>
        ) : (
          <span className="text-gray-600 animate-pulse">Verificando...</span>
        )}
      </div>
    </header>
  )
}
