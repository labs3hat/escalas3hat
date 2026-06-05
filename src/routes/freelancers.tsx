import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/freelancers' as any)({
  component: FreelancersRedirect,
})

function FreelancersRedirect() {
  const navigate = useNavigate()

  useEffect(() => {
    navigate({ to: '/escalas', search: { storeId: undefined, week: undefined }, replace: true })
    // Adicionar um pequeno delay ou simplesmente deixar que o usuário veja a aba correta
    // Mas o ideal é que ele caia na tela de escalas com a aba de freelancers ativa.
    // Como o estado da aba é local ao EscalasClient, não conseguimos passar via URL sem alterar o EscalasClient.
  }, [navigate])

  return null
}
