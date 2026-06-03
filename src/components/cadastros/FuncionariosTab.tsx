import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import type { Employee, Store } from '@/types'
import { EMPLOYEE_COLORS } from '@/types'

const REGIME_LABELS = { '6x1': '6×1', '5x2': '5×2' }
const DAY_NAMES = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

export default function FuncionariosTab({ store }: { store: Store }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [showInactive, setShowInactive] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [store.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('employees').select('*')
      .eq('store_id', store.id).order('name')
    setEmployees(data ?? [])
    setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Desativar este funcionário?')) return
    await supabase.from('employees').update({ active: false }).eq('id', id)
    load()
    toast.success('Funcionário desativado')
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const { data, error } = await supabase.functions.invoke('sync-sheets-employees')
      if (error) throw error
      const created = data?.created ?? 0
      const updated = data?.updated ?? 0
      const deactivated = data?.deactivated ?? 0
      toast.success(`${created} criados, ${updated} atualizados, ${deactivated} desativados`)
      await load()
    } catch (e: any) {
      toast.error(`Erro ao sincronizar: ${e?.message ?? 'desconhecido'}`)
    } finally {
      setSyncing(false)
    }
  }

  // sugere uma cor ainda não utilizada (ou a menos usada) na loja
  function suggestColor(): string {
    const used = employees.map(e => e.color)
    const free = EMPLOYEE_COLORS.find(c => !used.includes(c))
    if (free) return free
    const counts = EMPLOYEE_COLORS.map(c => ({ c, n: used.filter(u => u === c).length }))
    counts.sort((a, b) => a.n - b.n)
    return counts[0]?.c ?? EMPLOYEE_COLORS[0]
  }

  const form = editing ?? {
    name: '', role: 'Atendente', work_regime: '6x1' as const,
    fixed_day_off: null, preferred_day_off: null, responsibilities: [] as string[], color: suggestColor(), notes: '', active: true
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const data = {
      store_id: store.id,
      name: fd.get('name') as string,
      role: fd.get('role') as string,
      work_regime: fd.get('work_regime') as '6x1' | '5x2',
      fixed_day_off: fd.get('fixed_day_off') ? Number(fd.get('fixed_day_off')) : null,
      preferred_day_off: fd.get('preferred_day_off') ? Number(fd.get('preferred_day_off')) : null,
      responsibilities: ['estoque','maquina'].filter(r => fd.get(r) === 'on'),
      color: fd.get('color') as string,
      notes: fd.get('notes') as string,
      active: true,
    }

    if (editing) {
      await supabase.from('employees').update(data).eq('id', editing.id)
      toast.success('Funcionário atualizado')
    } else {
      await supabase.from('employees').insert(data)
      toast.success('Funcionário cadastrado')
    }
    setShowForm(false)
    setEditing(null)
    load()
  }

  if (loading) return <div className="p-5 text-sm text-gray-400">Carregando...</div>

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">
            {employees.filter(e => showInactive || e.active).length} funcionário{employees.filter(e => showInactive || e.active).length !== 1 ? 's' : ''}
          </span>
          <label className="flex items-center gap-2 cursor-pointer group">
            <input 
              type="checkbox" 
              checked={showInactive} 
              onChange={e => setShowInactive(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
            />
            <span className="text-[11px] font-medium text-gray-500 group-hover:text-gray-700 transition-colors">
              Mostrar inativos
            </span>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-1.5 text-sm bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg font-medium disabled:opacity-50">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando...' : 'Sincronizar Sheets'}
          </button>
          <button onClick={() => { setEditing(null); setShowForm(true) }}
            className="flex items-center gap-1.5 text-sm bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg font-medium">
            <Plus size={14} /> Novo funcionário
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">
            {editing ? 'Editar funcionário' : 'Novo funcionário'}
          </h3>
          <form onSubmit={handleSave} className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 mb-1 block">Nome completo</label>
              <input name="name" defaultValue={form.name} required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Cargo</label>
              <input name="role" defaultValue={form.role}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Regime</label>
              <select name="work_regime" defaultValue={form.work_regime}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-400">
                <option value="6x1">6×1</option>
                <option value="5x2">5×2</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Folga fixa (5×2)</label>
              <select name="fixed_day_off" defaultValue={form.fixed_day_off ?? ''}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-400">
                <option value="">—</option>
                {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Preferência/Restrição</label>
              <select name="preferred_day_off" defaultValue={form.preferred_day_off ?? ''}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-400">
                <option value="">—</option>
                {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Cor na grade</label>
              <div className="flex gap-1.5 flex-wrap">
                {EMPLOYEE_COLORS.map(c => (
                  <label key={c} className="cursor-pointer">
                    <input type="radio" name="color" value={c} defaultChecked={form.color === c} className="sr-only" />
                    <div className="w-5 h-5 rounded-full border-2 border-white ring-1 ring-gray-200"
                      style={{ backgroundColor: c }} />
                  </label>
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 mb-1 block">Responsabilidades</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" name="estoque" defaultChecked={form.responsibilities?.includes('estoque')} />
                  Contagem de estoque
                </label>
                <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" name="maquina" defaultChecked={form.responsibilities?.includes('maquina')} />
                  Lavagem da máquina
                </label>
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 mb-1 block">Observações</label>
              <input name="notes" defaultValue={form.notes}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-400" />
            </div>
            <div className="col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowForm(false); setEditing(null) }}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
                Cancelar
              </button>
              <button type="submit"
                className="px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-medium">
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      <div className="flex flex-col gap-2">
        {employees.filter(e => showInactive || e.active).map(emp => (
          <div key={emp.id} className={`border rounded-xl overflow-hidden ${emp.active ? 'border-gray-200' : 'border-gray-100 bg-gray-50/30'}`}>
            <div className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${emp.active ? 'hover:bg-gray-50' : 'opacity-70 hover:bg-gray-100/50'}`}
              onClick={() => setExpanded(expanded === emp.id ? null : emp.id)}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
                style={{ backgroundColor: emp.active ? emp.color : '#9CA3AF' }}>
                {emp.name.split(' ').slice(0,2).map(w=>w[0]).join('')}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium flex items-center gap-2 ${emp.active ? 'text-gray-900' : 'text-gray-400'}`}>
                  {emp.name}
                  {!emp.active && (
                    <span className="text-[9px] uppercase font-bold bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded leading-none">
                      Inativo
                    </span>
                  )}
                </div>
                <div className="flex gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-gray-400">{emp.role}</span>
                  <span className={`text-xs font-medium px-1.5 rounded ${!emp.active ? 'bg-gray-100 text-gray-400' : emp.work_regime === '5x2' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {REGIME_LABELS[emp.work_regime]}
                  </span>
                  {emp.responsibilities.includes('estoque') && <span className={`text-xs px-1.5 rounded ${emp.active ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-400'}`}>Estoque</span>}
                  {emp.responsibilities.includes('maquina') && <span className={`text-xs px-1.5 rounded ${emp.active ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-400'}`}>Máquina</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {emp.active && (
                  <>
                    <button onClick={e => { e.stopPropagation(); setEditing(emp); setShowForm(true) }}
                      className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg">
                      <Edit size={14} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); handleDelete(emp.id) }}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
                {expanded === emp.id ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </div>
            </div>
            {expanded === emp.id && (
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Regime</span>
                  <div className="text-sm text-gray-700 font-medium">{emp.work_regime === '5x2' ? '5×2' : '6×1'}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Folga fixa</span>
                  <div className="text-sm text-gray-700 font-medium">{emp.fixed_day_off !== null ? DAY_NAMES[emp.fixed_day_off] : '—'}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Preferência/Restrição</span>
                  <div className="text-sm text-gray-700 font-medium">{emp.preferred_day_off !== null ? DAY_NAMES[emp.preferred_day_off] : '—'}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Turno preferencial</span>
                  <div className="text-sm text-gray-700 font-medium capitalize">{emp.preferred_shift || 'Flutuante'}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Responsabilidades</span>
                  <div className="flex gap-1.5 mt-1">
                    {emp.responsibilities.length > 0 ? emp.responsibilities.map(r => (
                      <span key={r} className="text-[10px] font-bold uppercase bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded shadow-sm">
                        {r}
                      </span>
                    )) : <span className="text-sm text-gray-400">—</span>}
                  </div>
                </div>
                {emp.notes && (
                  <div className="col-span-full">
                    <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Observações</span>
                    <div className="text-sm text-gray-600 bg-white p-2 rounded border border-gray-100 italic">
                      "{emp.notes}"
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
