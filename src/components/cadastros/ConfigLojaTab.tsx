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
  const [openWeekday, setOpenWeekday] = useState(store.opening_time_weekday ?? '10:00')
  const [openSaturday, setOpenSaturday] = useState(store.opening_time_saturday ?? '10:00')
  const [openSunday, setOpenSunday] = useState(store.opening_time_sunday ?? '12:00')
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
    }).eq('id', store.id)
    toast.success('Configurações salvas')
    setSaving(false)
    setChanged(false)
  }

  return (
    <div className="p-5 max-w-lg">
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
      <div className="mb-6">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Horário de abertura oficial</div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Seg – Sex', value: openWeekday, onChange: (v: string) => { setOpenWeekday(v); setChanged(true) } },
            { label: 'Sábado',    value: openSaturday, onChange: (v: string) => { setOpenSaturday(v); setChanged(true) } },
            { label: 'Domingo',   value: openSunday,   onChange: (v: string) => { setOpenSunday(v); setChanged(true) } },
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

      {/* Dias de lavagem */}
      <div className="mb-6">
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
          <div className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
            R6 e R8 aplicadas em: {lavarDays.map(d => DAY_NAMES[d]).join(', ')}
          </div>
        )}
      </div>

      {/* Dias de estoque */}
      <div className="mb-6">
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

      {changed && (
        <button onClick={handleSave} disabled={saving}
          className="w-full bg-brand-500 hover:bg-brand-600 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">
          {saving ? 'Salvando...' : 'Salvar configurações'}
        </button>
      )}
    </div>
  )
}
