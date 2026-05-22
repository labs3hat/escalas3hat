import { createFileRoute } from '@tanstack/react-router'
import AlteracoesClient from '@/components/alteracoes/AlteracoesClient'
import { useAppContext } from '@/routes/_authenticated'

export const Route = createFileRoute('/_authenticated/alteracoes')({
  component: AlteracoesPage,
})

function AlteracoesPage() {
  const { profile, stores } = useAppContext()
  return <AlteracoesClient profile={profile} initialStores={stores} />
}
