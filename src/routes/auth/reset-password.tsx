import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'

export const Route = createFileRoute('/auth/reset-password')({
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Check if we have a session (returned from the reset link)
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== 'PASSWORD_RECOVERY') {
        // If it's not a recovery event and no session, redirect to login
        if (!session) navigate({ to: '/auth/login' })
      }
    })
  }, [navigate])

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!password) return
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Senha atualizada com sucesso!')
      navigate({ to: '/escalas' })
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-500 rounded-2xl mb-4">
            <span className="text-white font-bold text-2xl">3H</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">3HAT Escalas</h1>
          <p className="text-gray-500 text-sm mt-1">Definir nova senha</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Nova Senha</h2>
          <p className="text-gray-500 text-sm mb-5">Digite sua nova senha de acesso.</p>
          <form onSubmit={handleUpdatePassword} className="flex flex-col gap-3">
            <input
              type="password"
              placeholder="Nova Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              required
              minLength={6}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-60 mt-2"
            >
              {loading ? 'Atualizando...' : 'Atualizar Senha'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
