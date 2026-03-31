import type { KineticView } from '../../pages/KineticTerminal'

interface Props {
  view: KineticView
  setView: (v: KineticView) => void
}

// ── Icons ──────────────────────────────────────────────────────────────────
const IconMap = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
    <circle cx="12" cy="12" r="3" />
    <circle cx="12" cy="12" r="8" strokeDasharray="2 2" />
    <circle cx="12" cy="12" r="11" strokeDasharray="4 2" />
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
const IconCampaign = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
    <path d="M12 2C8 2 4 5 4 9c0 5.25 8 13 8 13s8-7.75 8-13c0-4-4-7-8-7z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
)
const IconReports = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <line x1="9" y1="8"  x2="15" y2="8"  />
    <line x1="9" y1="12" x2="15" y2="12" />
    <line x1="9" y1="16" x2="12" y2="16" />
  </svg>
)

// ── Sidebar ────────────────────────────────────────────────────────────────
type NavItem = { key: KineticView; title: string; Icon: () => JSX.Element }

const NAV_ITEMS: NavItem[] = [
  { key: 'map',         title: 'Network Map',   Icon: IconMap },
  { key: 'console',     title: 'Attack Console', Icon: IconConsole },
  { key: 'campaigns',   title: 'Campaigns',      Icon: IconCampaign },
  { key: 'credentials', title: 'Credentials',    Icon: IconShield },
  { key: 'reports',     title: 'Reports',        Icon: IconReports },
]

export function KineticSidebar({ view, setView }: Props) {
  return (
    <aside className="flex flex-col items-center w-14 bg-[#080c10] border-r border-[#1a2f1a] py-4 gap-1 shrink-0 z-10">
      {/* Logo */}
      <div className="mb-5">
        <div className="w-8 h-8 rounded border border-[#2aff8a]/40 flex items-center justify-center"
          style={{ boxShadow: '0 0 10px rgba(42,255,138,0.12)' }}
        >
          <span className="text-[#2aff8a] text-xs font-bold">W</span>
        </div>
      </div>

      <div className="w-8 border-t border-[#1a2f1a] mb-2" />

      {NAV_ITEMS.map(({ key, title, Icon }) => (
        <button
          key={key}
          onClick={() => setView(key)}
          title={title}
          className={`p-2 rounded transition-all ${
            view === key
              ? 'text-[#2aff8a] bg-[#2aff8a]/15 border border-[#2aff8a]/30'
              : 'text-[#2aff8a]/35 hover:text-[#2aff8a] hover:bg-[#2aff8a]/10 border border-transparent'
          }`}
        >
          <Icon />
        </button>
      ))}
    </aside>
  )
}
