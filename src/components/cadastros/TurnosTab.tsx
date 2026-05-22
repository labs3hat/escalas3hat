import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import type { ShiftTemplate, Store } from '@/types'

// ── TURNOS TAB ──────────────────────────────────────────────
export function TurnosTab({ store }: { store: Store }) {
  const [turnos, setTurnos] = useState<ShiftTemplate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [store.id])

  async function load() {
    const { data } = await supabase.from('shift_templates').select('*')
      .eq('store_id', store.id).order('entry_time')
    setTurnos(data ?? [])
    setLoading(false)
  }

  if (loading) return <div className="p-5 text-sm text-gray-400">Carregando...</div>

  return (
    <div className="p-5">
      <div className="text-sm font-medium text-gray-700 mb-4">
        Turnos padrão — {store.name}
      </div>
      <div className="flex flex-col gap-2">
        {turnos.map(t => {
          const [eh] = t.entry_time.split(':').map(Number)
          const [xh] = t.exit_time.split(':').map(Number)
          const hrs = (xh + (t.exit_time.endsWith('30') ? 0.5 : 0)) -
                      (eh + (t.entry_time.endsWith('30') ? 0.5 : 0)) - 1
          const barColor = t.name.includes('Abertura') ? '#185FA5'
            : t.name.includes('Fechamento') ? '#0F6E56' : '#854F0B'

          return (
            <div key={t.id} className="border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-1.5 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: barColor }} />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">
                  {t.name} <span className="text-xs font-normal text-gray-400">({t.regime})</span>
                </div>
                <div className="text-xs text-gray-500">
                  {t.entry_time} – {t.exit_time} &nbsp;·&nbsp;
                  Intervalo {t.break_start}–{t.break_end} &nbsp;·&nbsp;
                  <span className="font-medium text-gray-700">{hrs}h líquidas</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-gray-400 mt-4">
        Para alterar horários de fechamento, use Configurações da loja. Os turnos são gerados automaticamente.
      </p>
    </div>
  )
}

export default TurnosTab
