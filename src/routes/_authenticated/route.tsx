import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { createContext, useContext, useEffect, useState } from 'react'
import { PanelLeft } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import Sidebar from '@/components/layout/Sidebar'
import type { Profile, Store } from '@/types'

export interface AppContext {
  profile: Profile | null
  stores: Store[]
  reloadStores: () => Promise<void>
}

const AppCtx = createContext<AppContext>({
  profile: null,
  stores: [],
  reloadStores: async () => {},
})

export function useAppContext() {
  return useContext(AppCtx)
}

export const Route = createFileRoute('/_authenticated')({
  ssr: false,
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      navigate({ to: '/auth/login' })
      return null
    }
    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    setProfile(prof as unknown as Profile | null)
    return prof as unknown as Profile | null
  }

  async function loadStores(prof: Profile | null) {
    if (!prof) {
      setStores([])
      return
    }
    const isAdmin = ['regional', 'diretoria', 'rh'].includes(prof.role)
    console.log('Loading stores for profile:', prof.email, 'Role:', prof.role, 'isAdmin:', isAdmin)
    let query = supabase.from('stores').select('*').eq('active', true).order('display_order', { ascending: true })

    if (!isAdmin) {
      query = query.in('id', prof.store_ids ?? [])
    }
    const { data } = await query
    setStores((data ?? []) as unknown as Store[])
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      const prof = await loadProfile()
      if (!active) return
      await loadStores(prof)
      if (active) setLoading(false)
    })()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e: unknown, session: unknown) => {
      if (!session) navigate({ to: '/auth/login' })
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-400">
        Carregando...
      </div>
    )
  }

  const ctx: AppContext = {
    profile,
    stores,
    reloadStores: () => loadStores(profile),
  }

  return (
    <AppCtx.Provider value={ctx}>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar profile={profile} collapsed={sidebarCollapsed} />
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <header className="h-12 bg-white border-b border-gray-200 flex items-center px-3 gap-2 flex-shrink-0">
            <button
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="w-8 h-8 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 flex items-center justify-center"
              aria-label="Alternar menu"
            >
              <PanelLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-gray-800">3HAT Escalas</span>
          </header>
          <main className="flex-1 min-h-0 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </AppCtx.Provider>
  )
}
