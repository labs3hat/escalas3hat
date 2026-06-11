import { useState } from 'react'
import { RefreshCw, CheckCircle2, AlertTriangle, Plus, Minus, Loader2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

const DAY_NAMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex']

type Diff = { field: string; db: unknown; sheet: unknown }
type StoreRow = { status: 'equal'|'diff'|'new'|'inactive'; code: string; name: string; diffs?: Diff[]; sheet?: any }
type EmpRow = { status: 'equal'|'diff'|'new'|'inactive'; code: string; name: string; diffs?: Diff[]; sheet?: any; active?: boolean }

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  opening_time_weekday: 'Abertura Seg-Sex',
  closing_time_weekday: 'Fechamento Seg-Sex',
  opening_time_saturday: 'Abertura Sáb',
  closing_time_saturday: 'Fechamento Sáb',
  opening_time_sunday: 'Abertura Dom',
  closing_time_sunday: 'Fechamento Dom',
  machine_wash_days: 'Dias lavagem máquina',
  stock_count_days: 'Dias contagem estoque',
  min_opening_staff: 'Mín. abertura seg-sex',
  min_opening_weekend: 'Mín. abertura fds',
  min_closing_staff: 'Mín. fechamento seg-sex',
  min_closing_weekend: 'Mín. fechamento fds',
  min_weekday_staff: 'Mín. total dia útil',
  min_weekend_staff: 'Mín. total fds',
  min_sunday_staff: 'Mín. total domingo',
  weekly_hours_6x1: 'Horas semanais 6x1',
  weekly_hours_5x2: 'Horas semanais 5x2',
  role: 'Cargo',
  work_regime: 'Regime',
  fixed_day_off: 'Folga fixa',
  responsibilities: 'Responsabilidades',
  preferred_shift: 'Turno preferido',
  active: 'Ativo',
}

function fmt(v: unknown, field?: string): string {
  if (v === null || v === undefined || v === '') return '—'
  if (Array.isArray(v)) {
    if (field === 'machine_wash_days' || field === 'stock_count_days') {
      return v.map((n: number) => DAY_NAMES[n] ?? n).join(', ') || '—'
    }
    return v.join(', ') || '—'
  }
  if (field === 'fixed_day_off' && typeof v === 'number') {
    if (v === 0) return 'Não'
    return DAY_NAMES[v] ?? String(v)
  }
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  return String(v)
}

export default function ConsistenciaTab() {
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [stores, setStores] = useState<StoreRow[] | null>(null)
  const [employees, setEmployees] = useState<EmpRow[] | null>(null)
  const [tab, setTab] = useState<'stores' | 'employees'>('stores')
  const [filter, setFilter] = useState<'all'|'diff'>('diff')

  async function check() {
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('check-sheets-consistency')
      if (error) throw error
      setStores(data?.stores ?? [])
      setEmployees(data?.employees ?? [])
    } catch (e: any) {
      toast.error(`Erro: ${e?.message ?? 'desconhecido'}`)
    } finally {
      setLoading(false)
    }
  }

  async function syncAll() {
    setSyncing(true)
    try {
      const [r1, r2] = await Promise.all([
        supabase.functions.invoke('sync-sheets-stores'),
        supabase.functions.invoke('sync-sheets-employees'),
      ])
      if (r1.error) throw r1.error
      if (r2.error) throw r2.error
      const s = r1.data, e = r2.data
      toast.success(
        `Lojas: ${s?.updated ?? 0} atualizadas, ${s?.created ?? 0} criadas. ` +
        `Funcionários: ${e?.updated ?? 0} atualizados, ${e?.created ?? 0} criados, ${e?.deactivated ?? 0} desativados.`,
      )
      await check()
    } catch (e: any) {
      toast.error(`Erro: ${e?.message ?? 'desconhecido'}`)
    } finally {
      setSyncing(false)
    }
  }

  async function syncOne(type: 'stores' | 'employees') {
    const fn = type === 'stores' ? 'sync-sheets-stores' : 'sync-sheets-employees'
    try {
      const { error } = await supabase.functions.invoke(fn)
      if (error) throw error
      toast.success('Atualizado a partir da planilha')
      await check()
    } catch (e: any) {
      toast.error(`Erro: ${e?.message ?? 'desconhecido'}`)
    }
  }

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === 'equal') return <span className="inline-flex items-center gap-1 text-xs text-brand-700 bg-brand-50 px-2 py-0.5 rounded"><CheckCircle2 size={11}/> Igual</span>
    if (status === 'diff') return <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded"><AlertTriangle size={11}/> Diferente</span>
    if (status === 'new') return <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded"><Plus size={11}/> Novo na planilha</span>
    return <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded"><Minus size={11}/> Inativo no banco</span>
  }

  const rows = (tab === 'stores' ? stores : employees) ?? []
  const filtered = rows.filter(r => filter === 'all' ? true : r.status !== 'equal')
  const summary = {
    equal: rows.filter(r => r.status === 'equal').length,
    diff: rows.filter(r => r.status === 'diff').length,
    new: rows.filter(r => r.status === 'new').length,
    inactive: rows.filter(r => r.status === 'inactive').length,
  }

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-800">Consistência Planilha × Banco</div>
          <div className="text-xs text-gray-500 mt-0.5">Comparação somente leitura. Nenhuma alteração automática.</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={check} disabled={loading || syncing}
            className="flex items-center gap-1.5 text-sm bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg font-medium disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
            {loading ? 'Verificando...' : 'Verificar consistência'}
          </button>
          <button onClick={syncAll} disabled={loading || syncing}
            className="flex items-center gap-1.5 text-sm bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-50">
            {syncing ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
            Sincronizar tudo
          </button>
        </div>
      </div>

      {(stores || employees) && (
        <>
          <div className="flex border-b border-gray-200 mb-3">
            <button onClick={() => setTab('stores')}
              className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab==='stores' ? 'border-brand-500 text-brand-700 font-medium' : 'border-transparent text-gray-500'}`}>
              Lojas ({stores?.length ?? 0})
            </button>
            <button onClick={() => setTab('employees')}
              className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab==='employees' ? 'border-brand-500 text-brand-700 font-medium' : 'border-transparent text-gray-500'}`}>
              Funcionários ({employees?.length ?? 0})
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-600 mb-3">
            <span>✓ Iguais: <b>{summary.equal}</b></span>
            <span className="text-amber-700">⚠ Diferentes: <b>{summary.diff}</b></span>
            <span className="text-blue-700">+ Novos: <b>{summary.new}</b></span>
            <span className="text-gray-500">− Inativos: <b>{summary.inactive}</b></span>
            <label className="ml-auto flex items-center gap-1.5">
              <input type="checkbox" checked={filter==='all'} onChange={e => setFilter(e.target.checked ? 'all' : 'diff')} />
              Mostrar iguais
            </label>
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-2 w-48">Loja / Funcionário</th>
                  <th className="text-left px-3 py-2">Campo</th>
                  <th className="text-left px-3 py-2">Valor no banco</th>
                  <th className="text-left px-3 py-2">Valor na planilha</th>
                  <th className="text-left px-3 py-2 w-40">Status</th>
                  <th className="text-right px-3 py-2 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-gray-400 py-6 text-xs">Nenhuma diferença encontrada</td></tr>
                )}
                {filtered.map((row, idx) => {
                  const label = `${row.code} — ${row.name}`
                  if (row.status === 'equal' || row.status === 'new' || row.status === 'inactive') {
                    return (
                      <tr key={idx} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-medium text-gray-800">{label}</td>
                        <td className="px-3 py-2 text-gray-400">—</td>
                        <td className="px-3 py-2 text-gray-400">{row.status === 'new' ? '—' : 'existe'}</td>
                        <td className="px-3 py-2 text-gray-400">{row.status === 'inactive' ? '—' : 'existe'}</td>
                        <td className="px-3 py-2"><StatusBadge status={row.status}/></td>
                        <td className="px-3 py-2 text-right">
                          {(row.status === 'new' || row.status === 'inactive') && (
                            <button onClick={() => syncOne(tab)}
                              className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                              Sincronizar
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  }
                  // diff: one row per field
                  return (row.diffs ?? []).map((d, j) => (
                    <tr key={`${idx}-${j}`} className="border-t border-gray-100">
                      {j === 0 ? (
                        <td className="px-3 py-2 font-medium text-gray-800 align-top" rowSpan={row.diffs!.length}>{label}</td>
                      ) : null}
                      <td className="px-3 py-2 text-gray-700">{FIELD_LABELS[d.field] ?? d.field}</td>
                      <td className="px-3 py-2 text-gray-600 font-mono text-xs">{fmt(d.db, d.field)}</td>
                      <td className="px-3 py-2 text-gray-600 font-mono text-xs">{fmt(d.sheet, d.field)}</td>
                      {j === 0 ? (
                        <td className="px-3 py-2 align-top" rowSpan={row.diffs!.length}><StatusBadge status="diff"/></td>
                      ) : null}
                      {j === 0 ? (
                        <td className="px-3 py-2 text-right align-top" rowSpan={row.diffs!.length}>
                          <button onClick={() => syncOne(tab)}
                            className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                            Atualizar banco
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400 mt-3">
            "Atualizar banco" re-executa a sincronização completa da aba correspondente (operação idempotente).
          </p>
        </>
      )}

      {!stores && !employees && !loading && (
        <div className="text-center text-gray-400 text-sm py-12 border border-dashed border-gray-200 rounded-xl">
          Clique em "Verificar consistência" para comparar.
        </div>
      )}
    </div>
  )
}
