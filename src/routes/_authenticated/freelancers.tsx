import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/_authenticated/freelancers')({
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

  return (
    <div className="flex items-center justify-center h-full text-sm text-gray-400">
      Redirecionando...
    </div>
  )
}
