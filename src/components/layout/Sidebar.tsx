import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { Calendar, RefreshCw, Clock, Users, Map, LogOut, Settings, Timer } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import type { Profile } from '@/types'

const navItems = [
  { href: '/escalas',     label: 'Escalas',               icon: Calendar },
  { href: '/cadastros',   label: 'Funcionários',          icon: Users },
  { href: '/turnos',      label: 'Turnos padrão',         icon: Timer },
  { href: '/config-loja', label: 'Configurações da loja', icon: Settings },
  { href: '/alteracoes',  label: 'Alterações',            icon: RefreshCw },
  { href: '/horas',       label: 'Horas',                 icon: Clock },
] as const

const regionalItems = [
  { href: '/regional', label: 'Visão Regional', icon: Map },
] as const

interface Props {
  profile: Profile | null
  collapsed: boolean
}

export default function Sidebar({ profile, collapsed }: Props) {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate({ to: '/auth/login' })
  }

  const isRegional = profile?.role === 'regional' || profile?.role === 'diretoria'
  const items = isRegional ? [...navItems, ...regionalItems] : navItems

  return (
    <aside
      className={`bg-white border-r border-gray-200 flex flex-col flex-shrink-0 h-full transition-[width] duration-200 ${
        collapsed ? 'w-14' : 'w-52'
      }`}
    >
      {/* Brand */}
      <div className="px-3 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xs">3</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 leading-tight truncate">
                3HAT Escalas
              </div>
              <div className="text-[10px] text-gray-400 truncate uppercase tracking-wide">
                Chiquinho Sorvetes
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              to={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 ${collapsed ? 'justify-center px-0' : 'px-4'} py-2.5 text-sm transition-colors border-l-2 ${
                active
                  ? 'bg-brand-50 text-brand-700 border-brand-500 font-medium'
                  : 'text-gray-500 border-transparent hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              <Icon size={16} className="flex-shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200">
        {!collapsed && (
          <>
            <div className="text-xs text-gray-500 mb-0.5 truncate px-1">{profile?.email}</div>
            <div className="text-[10px] text-gray-400 mb-2 px-1 uppercase tracking-wide">
              {profile?.role ?? '—'}
            </div>
          </>
        )}
        <button
          onClick={handleLogout}
          title="Sair"
          className={`flex items-center gap-2 text-xs text-gray-500 hover:text-red-500 ${collapsed ? 'justify-center w-full' : 'px-1'} py-1 transition-colors w-full`}
        >
          <LogOut size={14} />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  )
}
