import { useState, useEffect, useMemo } from 'react'
import { Check, Clock, History, Search, Calendar, User, MapPin } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { format, startOfWeek, addWeeks, subWeeks } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Profile, Store, ScheduleChange } from '@/types'
import { DAY_NAMES_FULL } from '@/types'

interface Props { profile: Profile | null; initialStores: Store[] }

export default function AlteracoesClient({ profile, initialStores }: Props) {
  const [selectedStoreId, setSelectedStoreId] = useState<string>(initialStores[0]?.id || 'all')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all')
  const [weekOffset, setWeekOffset] = useState(0)
  const [changes, setChanges] = useState<ScheduleChange[]>([])
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])
  const [cienciaFilter, setCienciaFilter] = useState<'all' | 'pending' | 'confirmed'>('all')
  const [loading, setLoading] = useState(true)

  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 });
    return weekOffset >= 0 ? addWeeks(base, weekOffset) : subWeeks(base, Math.abs(weekOffset));
  }, [weekOffset]);

  useEffect(() => {
    loadEmployees()
  }, [selectedStoreId])

  useEffect(() => {
    load()
  }, [selectedStoreId, selectedEmployeeId, weekOffset, cienciaFilter])

  useEffect(() => {
    // Real-time subscription to refresh when science is confirmed or new changes added
    const channel = supabase
      .channel('alteracoes-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_changes' }, () => {
        load()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [selectedStoreId, selectedEmployeeId, weekOffset, cienciaFilter])

  async function loadEmployees() {
    let query = supabase.from('employees').select('id, name').eq('active', true)
    if (selectedStoreId !== 'all') {
      query = query.eq('store_id', selectedStoreId)
    }
    const { data } = await query.order('name')
    setEmployees(data || [])
  }

  async function load() {
    setLoading(true)
    try {
      let query = supabase
        .from('schedule_changes')
        .select('*, profiles(name), employees(name), stores(name)')
        .order('changed_at', { ascending: false })

      if (selectedStoreId !== 'all') {
        query = query.eq('store_id', selectedStoreId)
      }
      if (selectedEmployeeId !== 'all') {
        query = query.eq('employee_id', selectedEmployeeId)
      }

      if (cienciaFilter === 'pending') {
        query = query.eq('ciencia_funcionario', false)
      } else if (cienciaFilter === 'confirmed') {
        query = query.eq('ciencia_funcionario', true)
      }

      const { data, error } = await query.limit(100)
      
      if (error) {
        console.error('Error loading schedule changes:', error)
        toast.error('Erro ao carregar alterações: ' + error.message)
      } else {
        setChanges((data ?? []) as any)
      }
    } catch (err: any) {
      console.error('Unexpected error loading schedule changes:', err)
      toast.error('Erro inesperado ao carregar alterações')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmCiencia(id: string) {
    const { error } = await supabase
      .from('schedule_changes')
      .update({
        ciencia_funcionario: true,
        ciencia_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) {
      toast.error('Erro ao confirmar ciência')
    } else {
      toast.success('Ciência confirmada')
      load()
    }
  }

  const isEmployee = profile?.role === 'gerente' || !['regional', 'diretoria', 'rh'].includes(profile?.role || '')

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-bold text-gray-900">Alterações</h1>
        <p className="text-sm text-gray-500">Histórico de edições em escalas publicadas</p>
      </div>

      {/* Filters */}
      <div className="p-4 bg-white border-b border-gray-200 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-gray-400" />
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={() => setWeekOffset(w => w - 1)} className="px-2 py-1.5 hover:bg-gray-50 border-r border-gray-200 text-gray-500">
              &lt;
            </button>
            <span className="px-3 py-1.5 text-sm font-medium min-w-[140px] text-center bg-gray-50">
              Semana de {format(weekStart, 'dd/MM/yy')}
            </span>
            <button onClick={() => setWeekOffset(w => w + 1)} className="px-2 py-1.5 hover:bg-gray-50 border-l border-gray-200 text-gray-500">
              &gt;
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-gray-400" />
          <select 
            value={selectedStoreId}
            onChange={e => setSelectedStoreId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-400"
          >
            <option value="all">Todas as lojas</option>
            {initialStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <User size={16} className="text-gray-400" />
          <select 
            value={selectedEmployeeId}
            onChange={e => setSelectedEmployeeId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-400"
          >
            <option value="all">Todos os funcionários</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Check size={16} className="text-gray-400" />
          <select 
            value={cienciaFilter}
            onChange={e => setCienciaFilter(e.target.value as any)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-400"
          >
            <option value="all">Todas as alterações</option>
            <option value="pending">Pendentes de ciência</option>
            <option value="confirmed">Ciência confirmada</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-white rounded-xl border border-gray-200">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mb-4"></div>
            <p>Carregando alterações...</p>
          </div>
        ) : changes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
            <History size={48} className="mb-4 opacity-20" />
            <p>Nenhuma alteração registrada para os filtros selecionados</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Data / Dia</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Funcionário</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Loja</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Alteração</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Motivo</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Por / Quando</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ciência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {changes.map(c => {
                  const dayName = DAY_NAMES_FULL[c.day_of_week] || 'N/A'
                  const changeDesc = c.new_slot_type === 'day_off' 
                    ? 'Folga' 
                    : c.new_entry_time ? `${c.new_entry_time} - ${c.new_exit_time}` : 'Alteração'
                  const oldDesc = c.old_slot_type === 'day_off'
                    ? 'Folga'
                    : c.old_entry_time ? `${c.old_entry_time} - ${c.old_exit_time}` : 'Original'
                  
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium text-gray-900">{dayName}</div>
                        <div className="text-xs text-gray-400">Escala da semana</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900 font-medium">{(c as any).employees?.name}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-600">{(c as any).stores?.name}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-400 line-through">{oldDesc}</span>
                          <span className="text-sm font-semibold text-brand-600">{changeDesc}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 max-w-xs">
                        <div className="text-sm text-gray-600 italic">"{c.reason}"</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900">{(c as any).profiles?.name || 'Sistema'}</div>
                        <div className="text-xs text-gray-400">{format(new Date(c.changed_at), "dd/MM 'às' HH:mm")}</div>
                      </td>
                      <td className="px-4 py-4">
                        {c.ciencia_funcionario ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold bg-emerald-50 px-2 py-1 rounded-full w-fit">
                              <Check size={14} /> Ciente
                            </div>
                            {c.ciencia_at && (
                              <div className="text-[10px] text-gray-400 italic pl-1">
                                {format(new Date(c.ciencia_at), "dd/MM 'às' HH:mm")}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <span className="flex items-center gap-1.5 text-amber-600 text-xs font-bold bg-amber-50 px-2 py-1 rounded-full w-fit">
                              <Clock size={14} /> Pendente
                            </span>
                            {/* Comparison by name - identifying the employee by profile name */}
                            {profile?.name?.toLowerCase() === (c as any).employees?.name?.toLowerCase() && (
                              <button 
                                onClick={() => handleConfirmCiencia(c.id)}
                                className="w-full px-2 py-1.5 bg-brand-500 text-white rounded-lg text-[10px] font-bold hover:bg-brand-600 shadow-sm transition-all active:scale-95"
                              >
                                Confirmar ciência
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}