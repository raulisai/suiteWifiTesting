import { useEffect, useState, useRef, useCallback } from 'react'
import { useInterfacesStore } from '../../store/interfaces'
import { environmentApi, type ToolInfo } from '../../api/environment'
import type { KineticAlert } from '../../pages/KineticTerminal'

interface Props {
  scanning: boolean
  scanCount: number
  packetRate: number
  alerts: KineticAlert[]
  onDismissAlert: (id: number) => void
}

// ── Blink indicator ───────────────────────────────────────────────────────────
function Blink({ active }: { active: boolean }) {
  const [on, setOn] = useState(true)
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setOn(o => !o), 600)
    return () => clearInterval(t)
  }, [active])
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full mr-2 ${
        active && on ? 'bg-[#2aff8a] shadow-[0_0_6px_#2aff8a]' : 'bg-[#2aff8a]/20'
      }`}
    />
  )
}

// ── Tools dropdown ────────────────────────────────────────────────────────────
function ToolsDropdown() {
  const [open, setOpen]             = useState(false)
  const [tools, setTools]           = useState<ToolInfo[]>([])
  const [loading, setLoading]       = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const fetchTools = useCallback(() => {
    setLoading(true)
    environmentApi.checkAll().then(setTools).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (open && !tools.length) fetchTools()
  }, [open, tools.length, fetchTools])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const installOne = async (binary: string) => {
    setInstalling(binary)
    try {
      await environmentApi.installOne(binary)
      await fetchTools()
    } catch { /* noop */ } finally { setInstalling(null) }
  }

  const installAllMissing = async () => {
    setInstalling('__all__')
    try {
      await environmentApi.install(undefined, true)
      await fetchTools()
    } catch { /* noop */ } finally { setInstalling(null) }
  }

  const essential = tools.filter(t => t.category === 'essential')
  const ok        = essential.filter(t => t.status === 'installed').length
  const total     = essential.length
  const hasMissing = tools.some(t => t.status !== 'installed')

  const statusColor =
    !total         ? 'rgba(42,255,138,0.35)'
    : ok === total ? '#2aff8a'
    : ok > total/2 ? '#ffaa00'
    : '#ff4444'

  return (
    <div className="relative" ref={dropRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded border transition-all text-[9px] font-bold tracking-widest"
        style={{
          borderColor: open ? 'rgba(42,255,138,0.35)' : 'rgba(42,255,138,0.15)',
          background:  open ? 'rgba(42,255,138,0.06)' : 'transparent',
          color:       statusColor,
        }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(42,255,138,0.30)' }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(42,255,138,0.15)' }}
      >
        TOOLS
        {total > 0 && (
          <span className="tabular-nums" style={{ color: 'rgba(42,255,138,0.40)' }}>
            {ok}/{total}
          </span>
        )}
        <span className="text-[#2aff8a]/25 text-[8px]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 z-50 w-64 rounded border"
          style={{
            background:     'rgba(6,10,14,0.97)',
            borderColor:    'rgba(42,255,138,0.12)',
            backdropFilter: 'blur(12px)',
            boxShadow:      '0 12px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(42,255,138,0.04)',
          }}
        >
          {/* header */}
          <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'rgba(42,255,138,0.08)' }}>
            <span className="text-[9px] text-[#2aff8a]/45 tracking-widest">TOOL_STATUS</span>
            <button
              onClick={fetchTools}
              disabled={loading}
              className="text-[#2aff8a]/25 hover:text-[#2aff8a]/70 disabled:opacity-30 transition-colors text-sm leading-none"
              title="Refresh"
            >↻</button>
          </div>

          {/* list */}
          <div className="p-2 max-h-60 overflow-y-auto">
            {loading && !tools.length ? (
              <div className="text-[9px] text-[#2aff8a]/20 text-center py-6 tracking-widest animate-pulse">SCANNING DEPS…</div>
            ) : (
              <div className="space-y-0.5">
                {tools.map(t => (
                  <div
                    key={t.binary}
                    className="flex items-center gap-2 px-1.5 py-1 rounded transition-colors"
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(42,255,138,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{
                        background: t.status === 'installed' ? '#2aff8a' : '#ff4444',
                        boxShadow:  t.status === 'installed' ? '0 0 4px rgba(42,255,138,0.5)' : 'none',
                      }}
                    />
                    <span className="text-[9px] text-[#2aff8a]/55 font-mono flex-1 truncate">{t.binary}</span>
                    <span className="text-[8px] text-[#2aff8a]/22 tabular-nums shrink-0">{t.version ?? '—'}</span>
                    {t.status !== 'installed' && (
                      <button
                        onClick={() => installOne(t.binary)}
                        disabled={installing !== null}
                        className="text-[8px] px-1.5 py-0.5 rounded border transition-colors disabled:opacity-30"
                        style={{ borderColor: 'rgba(42,255,138,0.18)', color: 'rgba(42,255,138,0.45)' }}
                        onMouseEnter={e => {
                          if (!installing) (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(42,255,138,0.45)'
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(42,255,138,0.18)'
                        }}
                      >
                        {installing === t.binary ? '…' : 'GET'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* install all */}
          {hasMissing && (
            <div className="px-3 py-2 border-t" style={{ borderColor: 'rgba(42,255,138,0.08)' }}>
              <button
                onClick={installAllMissing}
                disabled={installing !== null}
                className="w-full text-[9px] py-1 rounded border transition-all disabled:opacity-40 tracking-widest"
                style={{ borderColor: 'rgba(42,255,138,0.18)', color: 'rgba(42,255,138,0.50)' }}
                onMouseEnter={e => {
                  if (!installing) {
                    (e.currentTarget as HTMLButtonElement).style.color       = 'rgba(42,255,138,0.85)'
                    ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(42,255,138,0.45)'
                    ;(e.currentTarget as HTMLButtonElement).style.background  = 'rgba(42,255,138,0.05)'
                  }
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.color       = 'rgba(42,255,138,0.50)'
                  ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(42,255,138,0.18)'
                  ;(e.currentTarget as HTMLButtonElement).style.background  = 'transparent'
                }}
              >
                {installing === '__all__' ? 'INSTALLING…' : 'INSTALL ALL MISSING'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Alert type accent colors ──────────────────────────────────────────────────
const ALERT_COLORS: Record<KineticAlert['type'], string> = {
  brute:     '#ff4444',
  new:       '#2aff8a',
  pmkid:     '#ffaa00',
  handshake: '#00e5ff',
  crack:     '#ff4444',
  info:      'rgba(42,255,138,0.5)',
}

// ── Mac-style collapsible alert bubbles ───────────────────────────────────────
function AlertBubbles({
  alerts,
  onDismiss,
}: {
  alerts: KineticAlert[]
  onDismiss: (id: number) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  if (alerts.length === 0) return null

  const recent = alerts.slice(0, 4)

  return (
    <div className="flex items-center gap-1.5 overflow-hidden">
      {/* toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-1 px-2 py-0.5 rounded-full border shrink-0 transition-all"
        style={{
          borderColor: collapsed ? 'rgba(42,255,138,0.25)' : 'rgba(42,255,138,0.12)',
          background:  collapsed ? 'rgba(42,255,138,0.06)' : 'transparent',
          color:       'rgba(42,255,138,0.40)',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(42,255,138,0.35)'
          ;(e.currentTarget as HTMLButtonElement).style.color       = 'rgba(42,255,138,0.70)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = collapsed ? 'rgba(42,255,138,0.25)' : 'rgba(42,255,138,0.12)'
          ;(e.currentTarget as HTMLButtonElement).style.color       = 'rgba(42,255,138,0.40)'
        }}
        title={collapsed ? 'Expand alerts' : 'Collapse alerts'}
      >
        <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: '#2aff8a' }} />
        <span className="text-[8px] font-mono tracking-wider">
          {collapsed ? `${alerts.length} EVT` : '◀'}
        </span>
      </button>

      {/* bubbles */}
      {!collapsed && recent.map(a => {
        const c = ALERT_COLORS[a.type]
        return (
          <div
            key={a.id}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full border shrink-0"
            style={{ borderColor: `${c}20`, background: `${c}0a` }}
          >
            <span
              className="w-1 h-1 rounded-full shrink-0"
              style={{ background: c, boxShadow: `0 0 4px ${c}88` }}
            />
            <span
              className="text-[8px] font-mono truncate max-w-[72px]"
              style={{ color: `${c}cc` }}
            >
              {a.label}
            </span>
            <button
              onClick={() => onDismiss(a.id)}
              className="text-[8px] leading-none ml-0.5 shrink-0 opacity-30 hover:opacity-80 transition-opacity"
              style={{ color: c }}
            >×</button>
          </div>
        )
      })}

      {!collapsed && alerts.length > 4 && (
        <span className="text-[8px] text-[#2aff8a]/20 shrink-0 tabular-nums">
          +{alerts.length - 4}
        </span>
      )}
    </div>
  )
}

// ── Main header ───────────────────────────────────────────────────────────────
export function KineticHeader({ scanning, scanCount, packetRate, alerts, onDismissAlert }: Props) {
  const { interfaces, selected, loading, fetch, select } = useInterfacesStore()
  const [ts, setTs] = useState(() => new Date().toLocaleTimeString('en-US', { hour12: false }))

  useEffect(() => {
    const t = setInterval(() => setTs(new Date().toLocaleTimeString('en-US', { hour12: false })), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-[#1a2f1a] bg-[#080c10] shrink-0 min-w-0">
      {/* Left: title + scan status */}
      <div className="flex items-center gap-4 shrink-0">
        <span className="text-[#2aff8a] font-bold text-sm tracking-[0.3em]">NetworkMap_H4ck</span>

        <div className="flex items-center text-[10px] gap-1">
          <Blink active={scanning} />
          <span className={scanning ? 'text-[#2aff8a]' : 'text-[#2aff8a]/40'}>
            {scanning ? 'SCANNING_ACTIVE' : 'STANDBY'}
          </span>
        </div>

        {scanning && (
          <span className="text-[10px] text-[#2aff8a]/60 border border-[#2aff8a]/18 rounded px-2 py-0.5">
            {scanCount.toLocaleString()} AP
          </span>
        )}

        {scanning && packetRate > 0 && (
          <span className="text-[10px] text-[#2aff8a]/45">
            {(packetRate / 1000).toFixed(1)}K pkt/s
          </span>
        )}
      </div>

      {/* Centre: Mac-style alert bubbles */}
      <div className="flex-1 flex justify-center px-4 min-w-0 overflow-hidden">
        <AlertBubbles alerts={alerts} onDismiss={onDismissAlert} />
      </div>

      {/* Right: tools + iface + clock */}
      <div className="flex items-center gap-3 text-[10px] shrink-0">

        <ToolsDropdown />

        <span className="text-[#2aff8a]/10">│</span>

        <div className="flex items-center gap-1.5">
          <span className="text-[#2aff8a]/40">IFACE:</span>

          {loading ? (
            <span className="text-[#2aff8a]/25 animate-pulse text-[9px] tracking-widest">DETECTING…</span>
          ) : interfaces.length === 0 ? (
            <span className="text-[#ff4444]/60 text-[9px] tracking-widest">NO INTERFACE</span>
          ) : (
            <select
              value={selected}
              onChange={(e) => select(e.target.value)}
              disabled={scanning}
              className="bg-[#0d1f0d] border border-[#2aff8a]/20 rounded px-2 py-0.5 text-[#2aff8a] font-mono text-[10px] focus:outline-none focus:border-[#2aff8a]/50 disabled:opacity-50 cursor-pointer"
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
            disabled={loading || scanning}
            title="Refresh interfaces"
            className="text-[#2aff8a]/25 hover:text-[#2aff8a] disabled:opacity-30 transition-colors text-sm leading-none"
          >↻</button>

          {selected && (() => {
            const iface = interfaces.find((i) => i.name === selected)
            if (!iface?.type) return null
            const mon = iface.type === 'monitor'
            return (
              <span
                className="text-[8px] px-1 rounded border tracking-wide"
                style={{
                  color:       mon ? 'rgba(42,255,138,0.7)' : 'rgba(255,170,0,0.7)',
                  borderColor: mon ? 'rgba(42,255,138,0.25)' : 'rgba(255,170,0,0.25)',
                }}
              >
                {iface.type.toUpperCase()}
              </span>
            )
          })()}
        </div>

        <span className="text-[#2aff8a]/30 tabular-nums">{ts}</span>
      </div>
    </header>
  )
}
