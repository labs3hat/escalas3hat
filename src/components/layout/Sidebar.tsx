import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { Calendar, RefreshCw, Clock, Users, Map, LogOut } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import type { Profile } from '@/types'

const navItems = [
  { href: '/escalas',    label: 'Escalas',    icon: Calendar },
  { href: '/alteracoes', label: 'Alterações', icon: RefreshCw },
  { href: '/horas',      label: 'Horas',      icon: Clock },
  { href: '/cadastros',  label: 'Cadastros',  icon: Users },
] as const

const regionalItems = [
  { href: '/regional', label: 'Regional', icon: Map },
] as const

export default function Sidebar({ profile }: { profile: Profile | null }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate({ to: '/auth/login' })
  }

  const isRegional = profile?.role === 'regional' || profile?.role === 'diretoria'
  const items = isRegional ? [...navItems, ...regionalItems] : navItems

  return (
    <aside className="w-44 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 h-full">
      <div className="px-4 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xs">3H</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900 leading-tight">3HAT Escalas</div>
            <div className="text-xs text-gray-400 truncate max-w-[100px]">
              {profile?.name?.split(' ')[0] ?? '—'}
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-2">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              to={href}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors border-l-2 ${
                active
                  ? 'bg-brand-50 text-brand-700 border-brand-500 font-medium'
                  : 'text-gray-500 border-transparent hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-gray-200">
        <div className="text-xs text-gray-400 mb-1 truncate px-1">{profile?.email}</div>
        <div className="text-xs text-gray-300 mb-2 px-1 capitalize">{profile?.role ?? '—'}</div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-red-500 px-1 py-1 transition-colors w-full"
        >
          <LogOut size={13} />
          Sair
        </button>
      </div>
    </aside>
  )
}
