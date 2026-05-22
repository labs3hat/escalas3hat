import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import CadastrosClient from '@/components/cadastros/CadastrosClient'
import type { AppContext } from '@/routes/_authenticated'

export const Route = createFileRoute('/_authenticated/cadastros')({
  component: CadastrosPage,
})

function CadastrosPage() {
  const { profile, stores } = useRouteContext({ from: '/_authenticated' }) as unknown as AppContext
  return <CadastrosClient profile={profile} initialStores={stores} />
}
