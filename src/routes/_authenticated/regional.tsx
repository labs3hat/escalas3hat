import { createFileRoute, redirect } from '@tanstack/react-router'
import RegionalClient from '@/components/regional/RegionalClient'
import { useAppContext } from '@/routes/_authenticated/route'

export const Route = createFileRoute('/_authenticated/regional')({
  component: RegionalPage,
})

function RegionalPage() {
  const { profile, stores } = useAppContext()
  if (!profile || !['regional', 'diretoria', 'rh'].includes(profile.role)) {
    throw redirect({ to: '/escalas' })
  }
  return <RegionalClient stores={stores} />
}
