import { createFileRoute } from '@tanstack/react-router'
import EscalasClient from '@/components/escalas/EscalasClient'
import { useAppContext } from '@/routes/_authenticated/route'

export const Route = createFileRoute('/_authenticated/escalas')({
  component: EscalasPage,
})

function EscalasPage() {
  const { profile, stores } = useAppContext()
  return <EscalasClient profile={profile} initialStores={stores} />
}
