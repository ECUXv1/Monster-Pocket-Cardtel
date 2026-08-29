import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Layers, PlusCircle, Settings } from 'lucide-react'

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/inventory', label: 'Inventory', icon: Layers },
  { to: '/add', label: 'Add item', icon: PlusCircle },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Nav() {
  return (
    <>
      {/* Side rail — wide screens & touchscreen dashboards (Tesla, tablets landscape) */}
      <nav className="hidden md:flex flex-col w-24 lg:w-56 shrink-0 border-r border-line bg-surface/60 backdrop-blur px-2 lg:px-4 py-6 gap-2">
        <div className="flex items-center gap-2.5 px-2 mb-6">
          <img src="/icons/icon-192.png" alt="" className="h-9 w-9 rounded-lg shrink-0 shadow-[0_0_16px_-2px_rgba(255,214,10,0.5)]" />
          <span className="hidden lg:block font-display text-sm leading-tight text-cream">
            MPC <span className="text-gold">HQ</span>
          </span>
        </div>
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-3 lg:py-3.5 text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-purple text-white shadow-[0_0_20px_-4px_rgba(123,47,247,0.8)]'
                  : 'text-cream/60 hover:text-cream hover:bg-surface-2'
              }`
            }
          >
            <Icon size={22} className="shrink-0" />
            <span className="hidden lg:block">{label}</span>
          </NavLink>
        ))}

        <div className="hidden lg:block mt-auto pt-6 text-center">
          <p className="font-display text-[9px] tracking-[0.15em] text-gold/60 leading-relaxed">
            RIP · TRADE
            <br />
            GRADE · REPEAT
          </p>
        </div>
      </nav>

      {/* Bottom bar — portrait phones */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-semibold ${
                  isActive ? 'text-gold' : 'text-cream/50'
                }`
              }
            >
              <Icon size={22} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}
