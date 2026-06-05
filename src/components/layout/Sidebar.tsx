import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { Calendar, RefreshCw, Clock, Users, Map, LogOut, Settings, ShieldCheck, UserPlus } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import type { Profile } from '@/types'

const navItems = [
  { href: '/escalas',     label: 'Escalas',               icon: Calendar },
  { href: '/escalas?tab=freelancers', label: 'Freelancers',          icon: UserPlus },
  { href: '/cadastros',   label: 'Funcionários',          icon: Users },
  { href: '/config-loja', label: 'Configurações da loja', icon: Settings },
  { href: '/usuarios',    label: 'Usuários',              icon: ShieldCheck },
  { href: '/alteracoes',  label: 'Alterações',            icon: RefreshCw },
  { href: '/horas',       label: 'Horas',                 icon: Clock },
] as const

const regionalItems = [
  { href: '/visao-regional', label: 'Visão Regional', icon: Map },
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

  const isAdmin = profile?.role === 'regional' || profile?.role === 'diretoria' || profile?.role === 'rh'
  const items = isAdmin ? navItems : navItems.filter(i => !['/usuarios', '/config-loja'].includes(i.href))
  const finalItems = isAdmin ? [...items, ...regionalItems] : items

  return (
    <aside
      className={`bg-gray-900 text-gray-200 border-r border-gray-800 flex flex-col flex-shrink-0 h-full transition-[width] duration-200 ${
        collapsed ? 'w-14' : 'w-52'
      }`}
    >
      {/* Brand */}
      <div className="px-3 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xs">3</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white leading-tight truncate">
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
        {finalItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              to={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 ${collapsed ? 'justify-center px-0' : 'px-4'} py-2.5 text-sm transition-colors border-l-2 ${
                active
                  ? 'bg-gray-800 text-white border-brand-400 font-medium'
                  : 'text-gray-400 border-transparent hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Icon size={16} className="flex-shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-gray-800">
        {!collapsed && (
          <>
            <div className="text-xs text-gray-300 mb-0.5 truncate px-1">{profile?.email}</div>
            <div className="text-[10px] text-gray-500 mb-2 px-1 uppercase tracking-wide">
              {profile?.role ?? '—'}
            </div>
          </>
        )}
        <button
          onClick={handleLogout}
          title="Sair"
          className={`flex items-center gap-2 text-xs text-gray-400 hover:text-red-400 ${collapsed ? 'justify-center w-full' : 'px-1'} py-1 transition-colors w-full`}
        >
          <LogOut size={14} />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  )
}
