import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'

export const Route = createFileRoute('/')({
  component: IndexRedirect,
})

function IndexRedirect() {
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!active) return
      if (session) {
        navigate({ to: '/escalas', replace: true })
      } else {
        navigate({ to: '/auth/login', replace: true })
      }
    })()
    return () => {
      active = false
    }
  }, [navigate])

  return (
    <div className="flex h-screen items-center justify-center text-sm text-gray-400">
      Carregando...
    </div>
  )
}
