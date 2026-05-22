import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import EscalasClient from '@/components/escalas/EscalasClient'
import type { AppContext } from '@/routes/_authenticated'

export const Route = createFileRoute('/_authenticated/escalas')({
  component: EscalasPage,
})

function EscalasPage() {
  const { profile, stores } = useRouteContext({ from: '/_authenticated' }) as unknown as AppContext
  return <EscalasClient profile={profile} initialStores={stores} />
}
