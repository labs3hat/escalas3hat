import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { useProfile } from '@/hooks/useProfile'
import type { Store } from '@/types'

const DAY_NAMES = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const ADMIN_ROLES = ['regional', 'rh', 'diretoria']

export default function ConfigLojaTab({ store }: { store: Store }) {
  const { profile } = useProfile()
  const canSync = profile && ADMIN_ROLES.includes(profile.role)
  const [syncing, setSyncing] = useState(false)

  async function handleSyncStores() {
    setSyncing(true)
    try {
      const { data, error } = await supabase.functions.invoke('sync-sheets-stores')
      if (error) throw error
      const c = data?.created ?? 0
      const u = data?.updated ?? 0
      toast.success(`${u} lojas atualizadas, ${c} criadas`)
    } catch (e: any) {
      toast.error(`Erro ao sincronizar lojas: ${e?.message ?? 'desconhecido'}`)
    } finally {
      setSyncing(false)
    }
  }

  const [lavarDays, setLavarDays] = useState<number[]>(store.machine_wash_days ?? [2,4,6])
  const [estoqueDays, setEstoqueDays] = useState<number[]>(store.stock_count_days ?? [1])
  
  // Abertura
  const [openWeekday, setOpenWeekday] = useState(store.opening_time_weekday ?? '10:00')
  const [openSaturday, setOpenSaturday] = useState(store.opening_time_saturday ?? '10:00')
  const [openSunday, setOpenSunday] = useState(store.opening_time_sunday ?? '12:00')
  
  // Fechamento
  const [closeWeekday, setCloseWeekday] = useState(store.closing_time_weekday ?? '22:00')
  const [closeSaturday, setCloseSaturday] = useState(store.closing_time_saturday ?? '22:00')
  const [closeSunday, setCloseSunday] = useState(store.closing_time_sunday ?? '20:00')

  // Equipe Mínima
  const [minOpen, setMinOpen] = useState(store.min_opening_staff ?? 1)
  const [minClose, setMinClose] = useState(store.min_closing_staff ?? 2)
  const [minWeekday, setMinWeekday] = useState(store.min_weekday_staff ?? 4)
  const [minWeekend, setMinWeekend] = useState(store.min_weekend_staff ?? 8)
  const [minSunday, setMinSunday] = useState(store.min_sunday_staff ?? 8)
  const [minOpenWknd, setMinOpenWknd] = useState(store.min_opening_weekend ?? 1)
  const [minCloseWknd, setMinCloseWknd] = useState(store.min_closing_weekend ?? 2)

  // Equipe Ideal
  const [idealOpen, setIdealOpen] = useState(store.ideal_opening_staff ?? 1)
  const [idealClose, setIdealClose] = useState(store.ideal_closing_staff ?? 2)
  const [idealTotal, setIdealTotal] = useState(store.ideal_staff ?? 8)

  const [saving, setSaving] = useState(false)
  const [changed, setChanged] = useState(false)

  function toggleDay(day: number, list: number[], setList: (v: number[]) => void) {
    setList(list.includes(day) ? list.filter(d => d !== day) : [...list, day].sort())
    setChanged(true)
  }

  async function handleSave() {
    setSaving(true)
    await supabase.from('stores').update({
      machine_wash_days: lavarDays,
      stock_count_days: estoqueDays,
      opening_time_weekday: openWeekday,
      opening_time_saturday: openSaturday,
      opening_time_sunday: openSunday,
      closing_time_weekday: closeWeekday,
      closing_time_saturday: closeSaturday,
      closing_time_sunday: closeSunday,
      min_opening_staff: minOpen,
      min_closing_staff: minClose,
      min_weekday_staff: minWeekday,
      min_weekend_staff: minWeekend,
      min_sunday_staff: minSunday,
      min_opening_weekend: minOpenWknd,
      min_closing_weekend: minCloseWknd,
      ideal_opening_staff: idealOpen,
      ideal_closing_staff: idealClose,
      ideal_staff: idealTotal,
    } as any).eq('id', store.id)
    toast.success('Configurações salvas')
    setSaving(false)
    setChanged(false)
  }

  return (
    <div className="p-5 max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <div className="text-sm font-medium text-gray-700">Configurações — {store.name}</div>
        {canSync && (
          <button onClick={handleSyncStores} disabled={syncing}
            className="flex items-center gap-1.5 text-sm bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg font-medium disabled:opacity-50">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando...' : 'Sincronizar Lojas'}
          </button>
        )}
      </div>

      {/* Horários de abertura */}
      <div className="mb-8">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Horário de abertura oficial</div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Seg – Sex', value: openWeekday, onChange: (v: string) => { setOpenWeekday(v); setChanged(true) } },
            { label: 'Sábado',    value: openSaturday, onChange: (v: string) => { setOpenSaturday(v); setChanged(true) } },
            { label: 'Domingo',   value: openSunday,   onChange: (v: string) => { setOpenSunday(v);   setChanged(true) } },
          ].map(f => (
            <div key={f.label}>
              <label className="text-xs text-gray-400 mb-1 block">{f.label}</label>
              <input type="time" value={f.value} onChange={e => f.onChange(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-400" />
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Base para R8 (entrada 2h antes) e R9 (entrada 1h antes)
        </p>
      </div>

      {/* Horários de fechamento */}
      <div className="mb-8">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Horário de fechamento oficial</div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Seg – Sex', value: closeWeekday, onChange: (v: string) => { setCloseWeekday(v); setChanged(true) } },
            { label: 'Sábado',    value: closeSaturday, onChange: (v: string) => { setCloseSaturday(v); setChanged(true) } },
            { label: 'Domingo',   value: closeSunday,   onChange: (v: string) => { setCloseSunday(v);   setChanged(true) } },
          ].map(f => (
            <div key={f.label}>
              <label className="text-xs text-gray-400 mb-1 block">{f.label}</label>
              <input type="time" value={f.value} onChange={e => f.onChange(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-400" />
            </div>
          ))}
        </div>
      </div>

      {/* Equipe Mínima */}
      <div className="mb-8">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Equipe Mínima Necessária</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider border-b border-gray-100 pb-1">Cobertura de Horário</div>
            {[
              { label: 'Abertura (Seg-Sex)', value: minOpen,     onChange: (v: number) => { setMinOpen(v);     setChanged(true) } },
              { label: 'Abertura (Fim Sem)', value: minOpenWknd, onChange: (v: number) => { setMinOpenWknd(v); setChanged(true) } },
              { label: 'Fechamento (Seg-Sex)', value: minClose,     onChange: (v: number) => { setMinClose(v);     setChanged(true) } },
              { label: 'Fechamento (Fim Sem)', value: minCloseWknd, onChange: (v: number) => { setMinCloseWknd(v); setChanged(true) } },
            ].map(f => (
              <div key={f.label} className="flex items-center justify-between">
                <label className="text-xs text-gray-500">{f.label}</label>
                <input type="number" min="0" value={f.value} onChange={e => f.onChange(parseInt(e.target.value) || 0)}
                  className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:border-brand-400" />
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider border-b border-gray-100 pb-1">Mínimo Diário (Total)</div>
            {[
              { label: 'Dia de Semana', value: minWeekday, onChange: (v: number) => { setMinWeekday(v); setChanged(true) } },
              { label: 'Finais de Semana',  value: minWeekend, onChange: (v: number) => { setMinWeekend(v); setChanged(true) } },
              { label: 'Domingos',     value: minSunday,  onChange: (v: number) => { setMinSunday(v);  setChanged(true) } },
            ].map(f => (
              <div key={f.label} className="flex items-center justify-between">
                <label className="text-xs text-gray-500">{f.label}</label>
                <input type="number" min="0" value={f.value} onChange={e => f.onChange(parseInt(e.target.value) || 0)}
                  className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:border-brand-400" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Equipe Ideal */}
      <div className="mb-8">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Equipe Ideal (Meta)</div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Abertura',  value: idealOpen,  onChange: (v: number) => { setIdealOpen(v);  setChanged(true) } },
            { label: 'Fechamento', value: idealClose, onChange: (v: number) => { setIdealClose(v); setChanged(true) } },
            { label: 'Total Loja', value: idealTotal, onChange: (v: number) => { setIdealTotal(v); setChanged(true) } },
          ].map(f => (
            <div key={f.label}>
              <label className="text-xs text-gray-400 mb-1 block text-center">{f.label}</label>
              <input type="number" min="0" value={f.value} onChange={e => f.onChange(parseInt(e.target.value) || 0)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:border-brand-400" />
            </div>
          ))}
        </div>
      </div>

      {/* Dias de lavagem */}
      <div className="mb-8 pt-4 border-t border-gray-100">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Dias de lavagem da máquina</div>
        <p className="text-xs text-gray-400 mb-3">Afeta R6 (proibição de folga) e R8 (entrada 2h antes). Padrão: Ter, Qui, Sáb</p>
        <div className="flex gap-2">
          {DAY_NAMES.map((d, i) => (
            <button key={i} onClick={() => toggleDay(i, lavarDays, setLavarDays)}
              className={`w-10 h-10 rounded-lg text-xs font-medium border transition-colors ${
                lavarDays.includes(i)
                  ? 'bg-red-500 border-red-500 text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-red-300'
              }`}>
              {d}
            </button>
          ))}
        </div>
        {lavarDays.length > 0 && (
          <div className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 max-w-sm">
            R6 e R8 aplicadas em: {lavarDays.map(d => DAY_NAMES[d]).join(', ')}
          </div>
        )}
      </div>

      {/* Dias de estoque */}
      <div className="mb-8">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Dias de contagem de estoque</div>
        <p className="text-xs text-gray-400 mb-3">Afeta R5 (proibição de folga na segunda) e R8. Padrão: Seg</p>
        <div className="flex gap-2">
          {DAY_NAMES.map((d, i) => (
            <button key={i} onClick={() => toggleDay(i, estoqueDays, setEstoqueDays)}
              className={`w-10 h-10 rounded-lg text-xs font-medium border transition-colors ${
                estoqueDays.includes(i)
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300'
              }`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Resumo das Regras */}
      <div className="mb-8 pt-6 border-t border-gray-100">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Resumo das Regras ("R"s)</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
          {[
            { code: 'R1',  desc: 'Mínimo obrigatório na abertura' },
            { code: 'R2',  desc: 'Mínimo obrigatório no fechamento' },
            { code: 'R3',  desc: 'Proibição de folga no Sábado' },
            { code: 'R5',  desc: 'Estoque não folga na Segunda' },
            { code: 'R6',  desc: 'Responsável pela máquina não folga em dias de lavagem' },
            { code: 'R8',  desc: 'Entrada antecipada (2h antes) em dias de lavagem/estoque' },
            { code: 'R9',  desc: 'Entrada antecipada (1h antes) em dias comuns' },
            { code: 'R10', desc: 'Mínimo obrigatório aos Domingos' },
            { code: 'R12', desc: 'Mínimo obrigatório em dias de semana' },
            { code: 'R13', desc: 'Mínimo obrigatório aos finais de semana' },
            { code: 'R16', desc: 'Proibição de intervalos simultâneos' },
            { code: 'R17', desc: 'Limite de folgas simultâneas por unidade' },
            { code: 'R18', desc: 'Máximo de 6h de trabalho contínuo sem intervalo' },
            { code: 'R19', desc: 'Preferência de saída: quem entra primeiro, sai primeiro' },
          ].map(r => (
            <div key={r.code} className="flex gap-2 items-start text-[11px]">
              <span className="font-bold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded min-w-[32px] text-center">{r.code}</span>
              <span className="text-gray-600 leading-snug">{r.desc}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
          <p className="text-[11px] text-amber-800 leading-relaxed">
            <strong>Nota sobre Prioridade:</strong> Conforme solicitado, as regras de <strong>Cobertura (R1, R2, R10, R12, R13)</strong> são prioritárias e devem ser cumpridas mesmo que gerem horas extras ou necessidade de freelancers.
          </p>
        </div>
      </div>

      {changed && (
        <button onClick={handleSave} disabled={saving}
          className="w-full bg-brand-500 hover:bg-brand-600 text-white font-medium py-2.5 rounded-lg text-sm shadow-sm disabled:opacity-60 transition-all">
          {saving ? 'Salvando...' : 'Salvar configurações'}
        </button>
      )}
    </div>
  )
}
