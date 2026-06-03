import { useState, useEffect } from 'react'
import { Plus, Trash2, Mail, Shield, Store, Loader2, RefreshCw } from 'lucide-react'
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
      supabase.from('profiles').select('*').order('name'),
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
    const selectedStores = stores.filter(s => fd.get(`store_${s.id}`) === 'on').map(s => s.id)

    setSaving(true)
    try {
      // In a real scenario, we'd use an edge function to create the user in Auth
      // and then the trigger would create the profile.
      // For now, since we want to allow the admin to just "add" someone,
      // we'll advise them that they need to invite the user or we'd need an Edge Function.
      
      toast.info('Para cadastrar novos usuários com acesso ao sistema, é necessário usar o convite por e-mail no painel do Supabase ou configurar uma Função de Borda (Edge Function) administrativa.')
      
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-5 flex justify-center"><Loader2 className="animate-spin text-brand-500" /></div>

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Usuários do Sistema</h2>
          <p className="text-xs text-gray-500 mt-0.5">Gerencie quem pode acessar o painel administrativo.</p>
        </div>
        <button 
          onClick={() => load()}
          className="p-2 text-gray-400 hover:text-brand-600 transition-colors"
          title="Recarregar"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

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
            {profiles.map(p => (
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
                  {/* Edit functionality could be added here */}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

function AlertTriangle(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}
