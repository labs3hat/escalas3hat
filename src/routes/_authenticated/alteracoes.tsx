import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import AlteracoesClient from '@/components/alteracoes/AlteracoesClient'
import type { AppContext } from '@/routes/_authenticated'

export const Route = createFileRoute('/_authenticated/alteracoes')({
  component: AlteracoesPage,
})

function AlteracoesPage() {
  const { profile, stores } = useRouteContext({ from: '/_authenticated' }) as unknown as AppContext
  return <AlteracoesClient profile={profile} initialStores={stores} />
}
