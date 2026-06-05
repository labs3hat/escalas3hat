import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import EscalasClient from '@/components/escalas/EscalasClient'
import type { Profile, Store } from '@/types'
import { z } from 'zod'

const searchSchema = z.object({
  storeId: z.string().optional(),
  week: z.string().optional(),
  tab: z.enum(['grade', 'resumo', 'freelancers']).optional(),
})

export const Route = createFileRoute('/_authenticated/escalas')({
  validateSearch: (search) => {
    try {
      return searchSchema.parse(search);
    } catch (e) {
      console.warn("Invalid search params in /escalas:", e);
      return {};
    }
  },
  component: EscalasPage,
})

function EscalasPage() {
  const search = Route.useSearch();
  const { storeId, week, tab } = search || {};
  const [profile, setProfile] = useState<Profile | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    setProfile(prof as unknown as Profile | null)

    const isAdmin = prof && ['regional', 'diretoria', 'rh'].includes((prof as any).role)
    let query = supabase.from('stores').select('*').eq('active', true).order('display_order', { ascending: true })
    if (!isAdmin) {
      query = query.in('id', (prof as any)?.store_ids ?? [])
    }
    const { data: storesData } = await query
    setStores((storesData ?? []) as unknown as Store[])
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        Carregando...
      </div>
    )
  }

  return (
    <EscalasClient 
      profile={profile} 
      initialStores={stores} 
      initialStoreId={storeId} 
      initialWeek={week} 
      initialTab={tab} 
    />
  )
}
