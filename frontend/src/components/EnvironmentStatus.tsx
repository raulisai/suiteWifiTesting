import { useEffect, useState } from 'react'
import { environmentApi, type ToolInfo } from '../api/environment'

export function EnvironmentStatus() {
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    environmentApi.checkAll().then((t) => { setTools(t); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="text-gray-500 text-sm animate-pulse">Verificando herramientas...</div>
  }

  const essential = tools.filter((t) => t.category === 'essential')
  const optional  = tools.filter((t) => t.category === 'optional')
  const system    = tools.filter((t) => t.category === 'system')

  return (
    <div className="space-y-4">
      {[
        { label: 'Esenciales', items: essential },
        { label: 'Opcionales', items: optional },
        { label: 'Sistema',    items: system },
      ].map(({ label, items }) => (
        <div key={label}>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{label}</h3>
          <div className="grid grid-cols-2 gap-1">
            {items.map((t) => (
              <div
                key={t.binary}
                className="flex items-center justify-between px-2 py-1 rounded bg-dark-700 text-xs"
              >
                <span className="font-mono text-gray-300">{t.binary}</span>
                <span
                  className={`font-bold ${
                    t.status === 'installed' ? 'text-brand-500' : 'text-red-400'
                  }`}
                >
                  {t.status === 'installed' ? '✓' : '✗'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
