import type { KineticView } from '../../pages/KineticTerminal'
import { NavLink } from 'react-router-dom'

interface Props {
  view: KineticView
  setView: (v: KineticView) => void
}

const IconMap = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
    <circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" strokeDasharray="2 2" /><circle cx="12" cy="12" r="11" strokeDasharray="4 2" />
  </svg>
)
const IconConsole = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
    <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
  </svg>
)
const IconShield = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
    <path d="M12 2 L20 6 V12 C20 17 12 22 12 22 C12 22 4 17 4 12 V6 Z" />
    <path d="M9 12 l2 2 4-4" />
  </svg>
)
const IconSnowflake = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
    <line x1="12" y1="2" x2="12" y2="22" /><line x1="2" y1="12" x2="22" y2="12" />
    <line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" />
    <circle cx="12" cy="12" r="2" />
  </svg>
)
const IconHome = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
    <path d="M3 12L12 3l9 9" /><path d="M9 21V12h6v9" /><rect x="3" y="12" width="18" height="9" rx="1" fill="none" />
  </svg>
)
const IconSettings = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
)

export function KineticSidebar({ view, setView }: Props) {
  return (
    <aside className="flex flex-col items-center w-14 bg-[#080c10] border-r border-[#1a2f1a] py-4 gap-2 shrink-0 z-10">
      {/* Logo */}
      <div className="mb-4">
        <div className="w-8 h-8 rounded border border-[#2aff8a]/40 flex items-center justify-center">
          <span className="text-[#2aff8a] text-xs font-bold">W</span>
        </div>
      </div>

      {/* Nav to main app */}
      <NavLink
        to="/"
        title="Dashboard"
        className="p-2 rounded text-[#2aff8a]/40 hover:text-[#2aff8a] hover:bg-[#2aff8a]/10 transition-colors"
      >
        <IconHome />
      </NavLink>

      <div className="w-8 border-t border-[#1a2f1a] my-1" />

      {/* Map view */}
      <button
        onClick={() => setView('map')}
        title="Network Map"
        className={`p-2 rounded transition-colors ${
          view === 'map'
            ? 'text-[#2aff8a] bg-[#2aff8a]/15 border border-[#2aff8a]/30'
            : 'text-[#2aff8a]/40 hover:text-[#2aff8a] hover:bg-[#2aff8a]/10'
        }`}
      >
        <IconMap />
      </button>

      {/* Console view */}
      <button
        onClick={() => setView('console')}
        title="Attack Console"
        className={`p-2 rounded transition-colors ${
          view === 'console'
            ? 'text-[#2aff8a] bg-[#2aff8a]/15 border border-[#2aff8a]/30'
            : 'text-[#2aff8a]/40 hover:text-[#2aff8a] hover:bg-[#2aff8a]/10'
        }`}
      >
        <IconConsole />
      </button>

      {/* Shield */}
      <NavLink
        to="/credentials"
        title="Credenciales"
        className="p-2 rounded text-[#2aff8a]/40 hover:text-[#2aff8a] hover:bg-[#2aff8a]/10 transition-colors"
      >
        <IconShield />
      </NavLink>

      {/* Snowflake → Campaigns */}
      <NavLink
        to="/campaigns"
        title="Campañas"
        className="p-2 rounded text-[#2aff8a]/40 hover:text-[#2aff8a] hover:bg-[#2aff8a]/10 transition-colors"
      >
        <IconSnowflake />
      </NavLink>

      <div className="flex-1" />

      {/* Settings */}
      <NavLink
        to="/reports"
        title="Reportes"
        className="p-2 rounded text-[#2aff8a]/40 hover:text-[#2aff8a] hover:bg-[#2aff8a]/10 transition-colors"
      >
        <IconSettings />
      </NavLink>
    </aside>
  )
}
