import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { Calendar, RefreshCw, Clock, Users, Map, LogOut, Settings, Timer } from 'lucide-react'
import { useState, useEffect } from 'react'
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
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!profile) return
    loadPendingCount()

    // Realtime listener for changes
    const channel = supabase
      .channel('sidebar-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_changes' }, () => {
        loadPendingCount()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile])

  async function loadPendingCount() {
    if (!profile) return
    
    // Attempt to find associated employee(s) by name or email
    // This is a heuristic until we have a direct link in the DB
    const { data: emps } = await supabase
      .from('employees')
      .select('id')
      .ilike('name', `%${profile.name}%`)
    
    if (emps && emps.length > 0) {
      const { count } = await supabase
        .from('schedule_changes')
        .select('*', { count: 'exact', head: true })
        .eq('ciencia_funcionario', false)
        .in('employee_id', emps.map(e => e.id))
      
      setPendingCount(count || 0)
    } else {
      setPendingCount(0)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate({ to: '/auth/login' })
  }

  const isRegional = profile?.role === 'regional' || profile?.role === 'diretoria'
  const items = isRegional ? [...navItems, ...regionalItems] : navItems

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
        {items.map(({ href, label, icon: Icon }) => {
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
              <div className="relative">
                <Icon size={16} className="flex-shrink-0" />
                {label === 'Alterações' && pendingCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold w-3.5 h-3.5 flex items-center justify-center rounded-full ring-1 ring-gray-900">
                    {pendingCount}
                  </span>
                )}
              </div>
              {!collapsed && (
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <span className="truncate">{label}</span>
                  {label === 'Alterações' && pendingCount > 0 && !collapsed && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {pendingCount}
                    </span>
                  )}
                </div>
              )}
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

