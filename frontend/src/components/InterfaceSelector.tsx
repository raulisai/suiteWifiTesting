import { useInterfacesStore } from '../store/interfaces'

// ── Type badge ────────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string | null }) {
  if (!type) return null

  const isMonitor = type === 'monitor'
  const isAP      = type === 'AP'
  const color = isMonitor
    ? 'bg-brand-900 border-brand-500 text-brand-500'
    : isAP
    ? 'bg-yellow-900/40 border-yellow-500 text-yellow-400'
    : 'bg-dark-600 border-dark-500 text-gray-500'

  return (
    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide ${color}`}>
      {type}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface InterfaceSelectorProps {
  /** Extra CSS classes for the wrapper div */
  className?: string
  /** Label shown above the selector (default: "Interfaz") */
  label?: string
  /** If true, renders a compact inline version for topbar usage */
  compact?: boolean
}

export function InterfaceSelector({ className = '', label = 'Interfaz', compact = false }: InterfaceSelectorProps) {
  const { interfaces, selected, loading, error, fetch, select } = useInterfacesStore()

  if (compact) {
    // ── Topbar inline variant ──────────────────────────────────────────────
    return (
      <div className={`flex items-center gap-1.5 font-mono text-xs ${className}`}>
        <span className="text-gray-500">IFACE</span>

        {loading ? (
          <span className="text-gray-600 animate-pulse">…</span>
        ) : error || interfaces.length === 0 ? (
          <span className="text-red-500 text-[10px]">sin ifaz</span>
        ) : (
          <select
            value={selected}
            onChange={(e) => select(e.target.value)}
            className="bg-transparent border border-dark-500 rounded px-1 py-0.5 text-gray-200 text-xs focus:outline-none focus:border-brand-500 cursor-pointer"
          >
            {interfaces.map((i) => (
              <option key={i.name} value={i.name}>
                {i.name}{i.type ? ` [${i.type}]` : ''}
              </option>
            ))}
          </select>
        )}

        <button
          onClick={fetch}
          disabled={loading}
          title="Refrescar interfaces"
          className="text-gray-600 hover:text-brand-500 disabled:opacity-40 transition-colors text-sm leading-none"
        >
          ↻
        </button>
      </div>
    )
  }

  // ── Full panel variant (Networks page) ─────────────────────────────────────
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">{label}</label>
        <button
          onClick={fetch}
          disabled={loading}
          title="Refrescar interfaces"
          className="text-gray-600 hover:text-brand-500 disabled:opacity-40 transition-colors text-xs leading-none"
        >
          {loading ? (
            <span className="animate-spin inline-block">↻</span>
          ) : (
            '↻'
          )}
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-[10px]">{error}</p>
      )}

      {interfaces.length === 0 && !loading ? (
        <div className="flex items-center gap-2">
          <span className="text-yellow-500 text-xs font-mono">sin interfaces</span>
          <button
            onClick={fetch}
            className="text-xs text-brand-500 hover:underline"
          >
            reintentar
          </button>
        </div>
      ) : (
        <div className="relative">
          <select
            value={selected}
            onChange={(e) => select(e.target.value)}
            disabled={loading}
            className="appearance-none bg-dark-700 border border-dark-500 rounded px-3 py-1.5 pr-8
                       text-xs font-mono text-gray-200 w-52
                       focus:outline-none focus:border-brand-500
                       disabled:opacity-50 cursor-pointer"
          >
            {interfaces.map((i) => (
              <option key={i.name} value={i.name}>
                {i.name}{i.type ? ` [${i.type}]` : ''}
                {i.channel != null ? ` CH${i.channel}` : ''}
              </option>
            ))}
          </select>
          {/* Custom chevron */}
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-[10px]">
            ▾
          </span>
        </div>
      )}

      {/* Detail row for selected interface */}
      {selected && (() => {
        const iface = interfaces.find((i) => i.name === selected)
        if (!iface) return null
        return (
          <div className="flex items-center gap-2 mt-0.5">
            <TypeBadge type={iface.type} />
            {iface.addr && (
              <span className="text-gray-600 text-[10px] font-mono">{iface.addr}</span>
            )}
            {iface.txpower != null && (
              <span className="text-gray-600 text-[10px]">{iface.txpower} dBm</span>
            )}
            {iface.type !== 'monitor' && (
              <span className="text-yellow-500 text-[10px]">⚠ necesita modo monitor</span>
            )}
          </div>
        )
      })()}
    </div>
  )
}
