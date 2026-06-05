import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import StandaloneStorePage from '@/components/cadastros/StandaloneStorePage'
import ConfigLojaTab from '@/components/cadastros/ConfigLojaTab'
import type { Profile, Store } from '@/types'

export const Route = createFileRoute('/_authenticated/config-loja')({
  component: ConfigLojaPage,
})

function ConfigLojaPage() {
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: prof } = await supabase
      .from('profiles').select('*').eq('id', user.id).single()
    const isAdmin = prof && ['regional', 'diretoria', 'rh'].includes((prof as unknown as Profile).role)
    let query = supabase.from('stores').select('*').eq('active', true).order('display_order', { ascending: true })
    if (!isAdmin) {
      query = query.in('id', (prof as unknown as Profile)?.store_ids ?? [])
    }
    const { data: storesData } = await query
    setStores((storesData ?? []) as unknown as Store[])
    setLoading(false)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full text-sm text-gray-400">Carregando...</div>
  }

  return (
    <StandaloneStorePage title="Configurações da loja" subtitle="Horários, dias de lavagem e estoque" stores={stores}>
      {(store) => <ConfigLojaTab store={store} onSync={load} />}
    </StandaloneStorePage>
  )
}
