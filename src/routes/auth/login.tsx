import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'

export const Route = createFileRoute('/auth/login')({
  component: LoginPage,
})

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    if (data?.session) {
      navigate({ to: '/escalas' })
    }
  }

  async function handleResetPassword() {
    if (!email) {
      toast.error('Por favor, digite seu e-mail para recuperar a senha.')
      return
    }
    setLoading(true)
    
    // O Supabase enviará o e-mail de recuperação. O link no e-mail levará o usuário
    // para a página de reset de senha. Forçamos o redirecionamento absoluto.
    const resetUrl = `${window.location.origin}/auth/reset-password`;
    console.log('Solicitando reset de senha com redirectTo:', resetUrl);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: resetUrl,
    })
    
    setLoading(false)
    if (error) {
      toast.error(error.message === 'Email not confirmed' 
        ? 'E-mail ainda não confirmado. Verifique sua caixa de entrada para o link de confirmação inicial.' 
        : error.message)
    } else {
      toast.success('E-mail de recuperação enviado! Verifique sua caixa de entrada.')
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
          <p className="text-gray-500 text-sm mt-1">Gestão de escalas operacionais</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Entrar</h2>
          <p className="text-gray-500 text-sm mb-5">Digite seu e-mail e senha para acessar.</p>
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              required
            />
            <input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              required
            />
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={loading}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium text-right mb-1"
            >
              Esqueceu a senha?
            </button>
            <button
              type="submit"

              disabled={loading}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-60"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
