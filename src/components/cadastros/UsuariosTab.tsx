import { useState, useEffect } from 'react'
import { Plus, Trash2, Mail, Shield, Store, Loader2, RefreshCw, Key, AlertTriangle } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import type { Profile, UserRole, Store as StoreType } from '@/types'

const ROLE_LABELS: Record<UserRole, string> = {
  gerente: 'Gerente',
  regional: 'Regional',
  diretoria: 'Diretoria',
  rh: 'RH'
}

export default function UsuariosTab() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [stores, setStores] = useState<StoreType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [pRes, sRes] = await Promise.all([
      supabase.from('profiles').select('*').order('name', { ascending: true }),
      supabase.from('stores').select('*').eq('active', true).order('name')
    ])
    setProfiles((pRes.data as Profile[]) ?? [])
    setStores((sRes.data as StoreType[]) ?? [])
    setLoading(false)
  }

  async function handleCreateUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const email = fd.get('email') as string
    const name = fd.get('name') as string
    const role = fd.get('role') as UserRole
    const password = fd.get('password') as string
    const selectedStores = stores.filter(s => fd.get(`store_${s.id}`) === 'on').map(s => s.id)

    setSaving(true)
    try {
      const { data, error } = await supabase.functions.invoke('manage-user-auth', {
        body: {
          action: 'createUser',
          email,
          password,
          name,
          role,
          store_ids: selectedStores
        }
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      toast.success(`Usuário ${email} cadastrado com sucesso! A senha definida foi: ${password}`)
      load()
      setShowForm(false)
    } catch (error: any) {
      toast.error(`Erro ao cadastrar: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleResetPassword(userId: string, email: string) {
    const newPassword = prompt(`Digite a nova senha para ${email}:`, '3hat2026')
    if (!newPassword) return

    setSaving(true)
    try {
      const { data, error } = await supabase.functions.invoke('manage-user-auth', {
        body: {
          action: 'updatePassword',
          userId,
          password: newPassword
        }
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      toast.success(`Senha de ${email} alterada para: ${newPassword}`)
    } catch (error: any) {
      toast.error(`Erro ao resetar senha: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-5 flex justify-center h-64 items-center"><Loader2 className="animate-spin text-brand-500" /></div>

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Usuários do Sistema</h2>
          <p className="text-xs text-gray-500 mt-0.5">Gerencie quem pode acessar o painel administrativo.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => load()}
            className="p-2 text-gray-400 hover:text-brand-600 transition-colors"
            title="Recarregar"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 text-sm bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg font-medium"
          >
            <Plus size={14} /> Novo usuário
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Cadastrar Novo Usuário</h3>
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Nome Completo</label>
              <input name="name" required placeholder="Ex: João Silva"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">E-mail</label>
              <input name="email" type="email" required placeholder="joao@exemplo.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Senha Inicial</label>
              <input name="password" required defaultValue="3hat2026"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Função</label>
              <select name="role" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-400">
                <option value="gerente">Gerente (Acesso por loja)</option>
                <option value="regional">Regional (Todas as lojas)</option>
                <option value="rh">RH (Todas as lojas)</option>
                <option value="diretoria">Diretoria (Todas as lojas)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-500 mb-1 block">Lojas vinculadas (apenas para Gerentes)</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border border-gray-200 rounded-lg p-3 bg-white max-h-40 overflow-y-auto">
                {stores.map(s => (
                  <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 p-1 rounded">
                    <input type="checkbox" name={`store_${s.id}`} className="rounded border-gray-300 text-brand-500 focus:ring-brand-500" />
                    <span className="truncate" title={s.name}>{s.code} - {s.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2 mt-2">
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Cadastrar e Enviar Convite
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Nome / E-mail</th>
              <th className="text-left px-4 py-3 font-semibold">Função</th>
              <th className="text-left px-4 py-3 font-semibold">Lojas</th>
              <th className="text-right px-4 py-3 font-semibold w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {profiles.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            ) : profiles.map(p => (
              <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{p.name}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <Mail size={12} /> {p.email}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700 border border-gray-200">
                    <Shield size={10} />
                    {ROLE_LABELS[p.role] || p.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {p.role === 'diretoria' || p.role === 'regional' || p.role === 'rh' ? (
                      <span className="text-[10px] text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded border border-brand-100 font-medium">
                        Todas as lojas
                      </span>
                    ) : (
                      p.store_ids?.map(sid => {
                        const s = stores.find(st => st.id === sid)
                        return s ? (
                          <span key={sid} className="text-[10px] text-gray-600 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200 font-medium">
                            {s.code}
                          </span>
                        ) : null
                      })
                    )}
                    {(!p.store_ids || p.store_ids.length === 0) && p.role === 'gerente' && (
                      <span className="text-[10px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 font-medium">
                        Nenhuma loja
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <button 
                    onClick={() => handleResetPassword(p.id, p.email)}
                    disabled={saving}
                    className="p-1.5 text-gray-400 hover:text-amber-600 transition-colors"
                    title="Alterar Senha Manualmente"
                  >
                    <Key size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-gray-400">
        Total de usuários: {profiles.length}
      </div>

      <div className="mt-6 p-4 bg-amber-50 border border-amber-100 rounded-xl">
        <div className="flex gap-3">
          <AlertTriangle className="text-amber-600 flex-shrink-0" size={18} />
          <div>
            <h4 className="text-sm font-semibold text-amber-900">Como cadastrar novos acessos?</h4>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
              Por segurança, novos usuários devem ser cadastrados via convite ou registro. 
              Como você é o administrador, você pode me pedir para criar um convite ou eu posso 
              configurar uma tela de cadastro administrativo para você.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

