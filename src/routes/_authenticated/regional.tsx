import { createFileRoute, redirect, useRouteContext } from '@tanstack/react-router'
import RegionalClient from '@/components/regional/RegionalClient'
import type { AppContext } from '@/routes/_authenticated'

export const Route = createFileRoute('/_authenticated/regional')({
  component: RegionalPage,
})

function RegionalPage() {
  const { profile, stores } = useRouteContext({ from: '/_authenticated' }) as unknown as AppContext
  if (!profile || !['regional', 'diretoria', 'rh'].includes(profile.role)) {
    throw redirect({ to: '/escalas' })
  }
  return <RegionalClient stores={stores} />
}
