import { NavLink } from 'react-router-dom'

const nav = [
  { to: '/',            label: 'Dashboard',    icon: '⬡' },
  { to: '/networks',    label: 'Redes',         icon: '⊹' },
  { to: '/terminal',   label: 'Terminal',      icon: '❯' },
  { to: '/campaigns',  label: 'Campañas',      icon: '◈' },
  { to: '/credentials',label: 'Credenciales',  icon: '◉' },
  { to: '/reports',    label: 'Reportes',      icon: '▣' },
]

export function Sidebar() {
  return (
    <aside className="flex flex-col w-56 min-h-screen bg-dark-800 border-r border-dark-600 py-6 shrink-0">
      {/* Logo */}
      <div className="px-5 mb-8">
        <span className="text-brand-500 font-bold text-lg tracking-widest">WIFI//SUITE</span>
      </div>

      {/* Nav links */}
      <nav className="flex flex-col gap-1 px-3 flex-1">
        {nav.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                isActive
                  ? 'bg-brand-500/10 text-brand-500 font-medium'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-dark-600'
              }`
            }
          >
            <span className="text-base w-5 text-center">{icon}</span>
            {label}
          </NavLink>
        ))}

        {/* Kinetic Terminal — special highlight */}
        <div className="mt-3 pt-3 border-t border-dark-600">
          <NavLink
            to="/kinetic"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors font-medium ${
                isActive
                  ? 'bg-[#2aff8a]/15 text-[#2aff8a] border border-[#2aff8a]/30'
                  : 'text-[#2aff8a]/60 hover:text-[#2aff8a] hover:bg-[#2aff8a]/10 border border-transparent'
              }`
            }
          >
            <span className="text-base w-5 text-center">⌖</span>
            Kinetic UI
          </NavLink>
        </div>
      </nav>

      {/* Version footer */}
      <div className="px-5 mt-4">
        <span className="text-xs text-gray-600">v1.0.0 — Kali Linux</span>
      </div>
    </aside>
  )
}
