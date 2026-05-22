import { createFileRoute } from '@tanstack/react-router'
import CadastrosClient from '@/components/cadastros/CadastrosClient'
import { useAppContext } from '@/routes/_authenticated'

export const Route = createFileRoute('/_authenticated/cadastros')({
  component: CadastrosPage,
})

function CadastrosPage() {
  const { profile, stores } = useAppContext()
  return <CadastrosClient profile={profile} initialStores={stores} />
}
