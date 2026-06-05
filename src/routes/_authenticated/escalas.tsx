import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, Suspense } from 'react'
import { supabase } from '@/integrations/supabase/client'
import EscalasClient from '@/components/escalas/EscalasClient'
import type { Profile, Store } from '@/types'
import { z } from 'zod'
import { ErrorBoundary } from 'react-error-boundary'

const searchSchema = z.object({
  storeId: z.string().optional().catch(undefined),
  week: z.string().optional().catch(undefined),
  tab: z.enum(['grade', 'resumo', 'freelancers']).optional().catch('grade' as const),
})

function RouteError({ error }: { error: Error }) {
  console.error("Critical error in /escalas route:", error);
  return (
    <div className="flex flex-col items-center justify-center h-full p-4 text-center">
      <h2 className="text-lg font-semibold text-gray-900">Erro ao carregar a página</h2>
      <p className="text-sm text-gray-500 mt-1">
        {error.message || "Ocorreu um problema ao processar os parâmetros da escala."}
      </p>
      <button 
        onClick={() => {
          window.location.href = '/escalas';
        }}
        className="mt-4 px-4 py-2 bg-brand-500 text-white rounded-md text-sm font-medium hover:bg-brand-600 transition-colors"
      >
        Tentar novamente
      </button>
    </div>
  );
}

export const Route = createFileRoute('/_authenticated/escalas')({
  validateSearch: (search: Record<string, unknown>) => {
    try {
      return searchSchema.parse(search);
    } catch (e) {
      console.warn("Invalid search params in /escalas:", e);
      return { tab: 'grade' as const };
    }
  },
  component: () => (
    <ErrorBoundary FallbackComponent={RouteError}>
      <EscalasPage />
    </ErrorBoundary>
  ),
  errorComponent: ({ error }) => <RouteError error={error as Error} />
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
