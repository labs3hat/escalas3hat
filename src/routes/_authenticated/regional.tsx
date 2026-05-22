import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import RegionalClient from '@/components/regional/RegionalClient'
import type { Profile, Store } from '@/types'

export const Route = createFileRoute('/_authenticated/regional')({
  component: RegionalPage,
})

function RegionalPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: prof } = await supabase
      .from('profiles').select('*').eq('id', user.id).single()
    const p = prof as unknown as Profile | null
    setProfile(p)

    if (!p || !['regional', 'diretoria', 'rh'].includes(p.role)) {
      throw redirect({ to: '/escalas' })
    }

    const { data: storesData } = await supabase
      .from('stores').select('*').eq('active', true).order('display_order', { ascending: true })
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

  if (!profile || !['regional', 'diretoria', 'rh'].includes(profile.role)) {
    return null
  }

  return <RegionalClient stores={stores} />
}
