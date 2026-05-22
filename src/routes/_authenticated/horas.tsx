import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { format, startOfWeek, addWeeks, subWeeks } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { MONTHS } from '@/types'

export const Route = createFileRoute('/_authenticated/horas')({
  component: HorasPage,
})

function HorasPage() {
  const [weekOffset, setWeekOffset] = useState(0)
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const weekStart = (() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 })
    return weekOffset >= 0 ? addWeeks(base, weekOffset) : subWeeks(base, Math.abs(weekOffset))
  })()
  const weekKey = format(weekStart, 'yyyy-MM-dd')

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

    const { data: employees } = await supabase
      .from('employees')
      .select('*, stores(name,code)')
      .in('store_id', (profile as any)?.store_ids ?? [])
      .eq('active', true)
      .order('name')

    const results = await Promise.all((employees ?? []).map(async (emp: any) => {
      const { data: sched } = await supabase.from('schedules').select('id')
        .eq('store_id', emp.store_id).eq('week_start', weekKey).maybeSingle()
      if (!sched) return { emp, hours: 0 }
      const { data: slots } = await supabase.from('schedule_slots').select('slot_type')
        .eq('schedule_id', sched.id).eq('employee_id', emp.id).eq('slot_type', 'work')
      return { emp, hours: (slots?.length ?? 0) * 0.5 }
    }))

    setData(results)
    setLoading(false)
  }

  const ws = weekStart
  const weekLabel = `${ws.getDate()} – ${ws.getDate() + 6} ${MONTHS[ws.getMonth()]} ${ws.getFullYear()}`

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center gap-3">
        <h1 className="text-sm font-semibold text-gray-800">Horas semanais</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => setWeekOffset(w => w - 1)}
            className="w-7 h-7 border border-gray-200 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-50">
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[150px] text-center">{weekLabel}</span>
          <button onClick={() => setWeekOffset(w => w + 1)}
            className="w-7 h-7 border border-gray-200 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-50">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="text-sm text-gray-400">Carregando...</div>
        ) : (
          <div className="flex flex-col gap-2">
            {data.map(({ emp, hours }) => {
              const over = hours > 44
              const pct = Math.min(100, Math.round(hours / 44 * 100))
              return (
                <div key={emp.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
                    style={{ backgroundColor: emp.color }}>
                    {emp.name.split(' ').slice(0,2).map((w: string) => w[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <span className="text-sm font-medium text-gray-900">{emp.name}</span>
                        <span className="text-xs text-gray-400 ml-2">{emp.stores?.name}</span>
                      </div>
                      <span className={`text-sm font-semibold ${over ? 'text-red-600' : hours === 0 ? 'text-gray-300' : 'text-gray-700'}`}>
                        {hours}h / 44h
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: over ? '#DC2626' : emp.color }} />
                    </div>
                  </div>
                  {over && (
                    <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                      +{Math.round((hours - 44) * 10) / 10}h extra
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
