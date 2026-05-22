import { useState, useEffect } from 'react'
import { Check, X, Clock, History } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Profile, Store, ScheduleChange } from '@/types'

interface Props { profile: Profile | null; initialStores: Store[] }

const CHANGE_LABELS: Record<string, string> = {
  shift_edit: 'Edição de turno',
  swap_request: 'Solicitação de troca',
  swap_approved: 'Troca aprovada',
  swap_refused: 'Troca recusada',
  absence: 'Falta',
  day_off_adjust: 'Ajuste de folga',
  publication: 'Publicação',
}

export default function AlteracoesClient({ profile, initialStores }: Props) {
  const [tab, setTab] = useState<'pendentes' | 'historico'>('pendentes')
  const [selectedStore, setSelectedStore] = useState<Store>(initialStores[0])
  const [changes, setChanges] = useState<ScheduleChange[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('todos')

  useEffect(() => { load() }, [selectedStore?.id])

  async function load() {
    if (!selectedStore) return
    const { data } = await supabase
      .from('schedule_changes')
      .select('*')
      .eq('store_id', selectedStore.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setChanges((data ?? []) as any)
    setLoading(false)
  }

  const pending = changes.filter(c => c.status === 'pending' && c.change_type === 'swap_request')
  const history = changes.filter(c => c.status !== 'pending' || c.change_type !== 'swap_request')

  async function handleApprove(id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('schedule_changes').update({
      status: 'approved',
      resolved_by: user?.id,
      resolved_at: new Date().toISOString(),
    }).eq('id', id)
    toast.success('Solicitação aprovada')
    load()
  }

  async function handleRefuse(id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('schedule_changes').update({
      status: 'refused',
      resolved_by: user?.id,
      resolved_at: new Date().toISOString(),
    }).eq('id', id)
    toast.error('Solicitação recusada')
    load()
  }

  const FILTER_TYPES = ['todos','shift_edit','swap_request','absence','day_off_adjust','publication']
  const filteredHistory = filter === 'todos' ? history : history.filter(c => c.change_type === filter)

  return (
    <div className="flex flex-col h-full">
      {/* Topbar */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center gap-3">
        <h1 className="text-sm font-semibold text-gray-800">Alterações e trocas</h1>
        {initialStores.length > 1 && (
          <select value={selectedStore?.id}
            onChange={e => setSelectedStore(initialStores.find(s => s.id === e.target.value)!)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-brand-50 text-brand-700 font-medium focus:outline-none">
            {initialStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-5">
        <button onClick={() => setTab('pendentes')}
          className={`flex items-center gap-1.5 py-2.5 px-3 text-sm border-b-2 -mb-px ${tab === 'pendentes' ? 'border-brand-500 text-brand-700 font-medium' : 'border-transparent text-gray-500'}`}>
          <Clock size={14} />
          Pendentes
          {pending.length > 0 && (
            <span className="bg-red-100 text-red-700 text-xs font-semibold px-1.5 rounded-full">{pending.length}</span>
          )}
        </button>
        <button onClick={() => setTab('historico')}
          className={`flex items-center gap-1.5 py-2.5 px-3 text-sm border-b-2 -mb-px ${tab === 'historico' ? 'border-brand-500 text-brand-700 font-medium' : 'border-transparent text-gray-500'}`}>
          <History size={14} />
          Histórico
        </button>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="text-sm text-gray-400">Carregando...</div>
        ) : tab === 'pendentes' ? (
          pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Check size={32} className="mb-2 text-brand-400" />
              <div className="text-sm">Nenhuma solicitação pendente</div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {pending.map(c => (
                <div key={c.id} className="border border-amber-200 border-l-4 border-l-amber-400 rounded-xl p-4 bg-white">
                  <div className="text-sm font-medium text-gray-800 mb-1">
                    {CHANGE_LABELS[c.change_type]}
                  </div>
                  {c.notes && <div className="text-xs text-gray-500 mb-3">{c.notes}</div>}
                  <div className="text-xs text-gray-400 mb-3">
                    {format(new Date(c.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleApprove(c.id)}
                      className="flex items-center gap-1.5 text-sm bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg font-medium">
                      <Check size={13} /> Aprovar
                    </button>
                    <button onClick={() => handleRefuse(c.id)}
                      className="flex items-center gap-1.5 text-sm border border-gray-200 text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 px-3 py-1.5 rounded-lg">
                      <X size={13} /> Recusar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <>
            {/* Filters */}
            <div className="flex gap-2 flex-wrap mb-4">
              {FILTER_TYPES.map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    filter === f
                      ? 'bg-brand-500 border-brand-500 text-white'
                      : 'border-gray-200 text-gray-500 hover:border-brand-300'
                  }`}>
                  {f === 'todos' ? 'Todos' : CHANGE_LABELS[f] ?? f}
                </button>
              ))}
            </div>

            {filteredHistory.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-12">Nenhum registro encontrado</div>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredHistory.map(c => (
                  <div key={c.id} className="border border-gray-200 rounded-xl px-4 py-3 bg-white flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      c.status === 'approved' || c.change_type === 'publication' ? 'bg-brand-100 text-brand-600'
                      : c.status === 'refused' ? 'bg-red-100 text-red-600'
                      : 'bg-amber-100 text-amber-600'
                    }`}>
                      {c.status === 'approved' || c.change_type === 'publication'
                        ? <Check size={13} />
                        : c.status === 'refused' ? <X size={13} />
                        : <Clock size={13} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800">{CHANGE_LABELS[c.change_type] ?? c.change_type}</div>
                      {c.notes && <div className="text-xs text-gray-500 mt-0.5 truncate">{c.notes}</div>}
                      <div className="text-xs text-gray-400 mt-1">
                        {format(new Date(c.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                      c.status === 'approved' ? 'bg-brand-50 text-brand-600'
                      : c.status === 'refused' ? 'bg-red-50 text-red-600'
                      : c.change_type === 'publication' ? 'bg-brand-50 text-brand-600'
                      : 'bg-amber-50 text-amber-600'
                    }`}>
                      {c.status === 'approved' ? 'Aprovada'
                        : c.status === 'refused' ? 'Recusada'
                        : c.change_type === 'publication' ? 'Publicação'
                        : 'Pendente'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
