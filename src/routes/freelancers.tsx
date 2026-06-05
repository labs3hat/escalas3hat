import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/freelancers' as any)({
  component: FreelancersRedirect,
})

function FreelancersRedirect() {
  const navigate = useNavigate()

  useEffect(() => {
    navigate({ 
      to: '/escalas', 
      search: { tab: 'freelancers' }, 
      replace: true 
    })
  }, [navigate])

  return null
}
