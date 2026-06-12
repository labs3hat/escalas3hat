import { useMemo, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { SLOT_KEYS, DAY_NAMES, type Employee, type Store, type Schedule } from '@/types'
import { getContractWeeklyHours } from '@/lib/utils'
import { formatters } from '@/lib/formatters'
import { MAX_OFF_PER_DAY } from '@/utils/scheduleRules'

interface Props {
  employees: Employee[]
  weekDates: Date[]
  getSlot: (empId: string, dow: number, slot: string) => string
  store: Store
  schedule: Schedule | null
  freelancerSlots?: any[]
}

interface Alert {
  type: 'critical' | 'warning'
  message: string
}

export default function PainelAlertas({ employees, weekDates, getSlot, store, schedule, freelancerSlots = [] }: Props) {
  const alerts = useMemo<Alert[]>(() => {
    const al: Alert[] = []

    weekDates.forEach(d => {
      const dow = d.getDay()
      const label = `${DAY_NAMES[dow]} ${d.getDate()}/${d.getMonth()+1}`

      // R1 — mínimo na abertura
      const isWknd = dow === 0 || dow === 6
      const rawOpening = (dow === 0 ? store.opening_time_sunday : (dow === 6 ? store.opening_time_saturday : store.opening_time_weekday)) || '10:00'
      const openingTime = formatters.time(rawOpening)
      const abCount = employees.filter(e => getSlot(e.id, dow, openingTime) === 'work').length
      const abFree = freelancerSlots.filter(s => s.day_of_week === dow && s.shift_name === 'Abertura' && s.filled_by).length
      
      const minOpening = isWknd ? (store.min_opening_weekend ?? 1) : (store.min_opening_staff ?? 1)
      if (abCount + abFree < minOpening) {
        al.push({ type: 'critical', message: `R1: ${label} — abertura com ${abCount + abFree} func. (mín. ${minOpening})` })
      }

      // R2 — mínimo no fechamento
      const rawClosing = (dow === 0 ? (store.closing_time_sunday || store.closing_time_weekday) : (dow === 6 ? (store.closing_time_saturday || store.closing_time_weekday) : store.closing_time_weekday)) || '22:00'
      const closingTime = formatters.time(rawClosing)
      
      // Para o fechamento, verificamos o slot IMEDIATAMENTE ANTERIOR ao horário de saída, 
      // pois às 22:00 (por exemplo) o funcionário já encerrou.
      const [h, m] = closingTime.split(':').map(Number)
      const dateRef = new Date(2000, 0, 1, h, m)
      dateRef.setMinutes(dateRef.getMinutes() - 30)
      const checkClosing = `${String(dateRef.getHours()).padStart(2, '0')}:${String(dateRef.getMinutes()).padStart(2, '0')}`
      
      const fcCount = employees.filter(e => getSlot(e.id, dow, checkClosing) === 'work').length
      const fcFree = freelancerSlots.filter(s => s.day_of_week === dow && s.shift_name === 'Fechamento' && s.filled_by).length

      const minClosing = isWknd ? (store.min_closing_weekend ?? 2) : (store.min_closing_staff ?? 2)
      if (fcCount + fcFree < minClosing) {
        al.push({ type: 'critical', message: `R2: ${label} — fechamento com ${fcCount + fcFree} func. (mín. ${minClosing})` })
      }

      // R3 — sem folga no sábado
      if (dow === 6) {
        employees.forEach(emp => {
          if (SLOT_KEYS.some(s => getSlot(emp.id, dow, s) === 'day_off')) {
            al.push({ type: 'critical', message: `R3: ${emp.name.split(' ')[0]} — folga no sábado` })
          }
        })
      }

      // R5 — estoque não folga na segunda
      if (dow === 1) {
        employees.filter(e => e.responsibilities.includes('estoque')).forEach(emp => {
          if (SLOT_KEYS.some(s => getSlot(emp.id, dow, s) === 'day_off')) {
            al.push({ type: 'critical', message: `R5: ${emp.name.split(' ')[0]} — folga na 2ª (responsável estoque)` })
          }
        })
      }

      // R6 — máquina não folga ter/qui/sáb
      if ([2, 4, 6].includes(dow)) {
        employees.filter(e => e.responsibilities.includes('maquina')).forEach(emp => {
          if (SLOT_KEYS.some(s => getSlot(emp.id, dow, s) === 'day_off')) {
            al.push({ type: 'warning', message: `R6: ${emp.name.split(' ')[0]} — folga em dia de lavagem` })
          }
        })
      }

      // R16 — intervalos simultâneos (Regra: sem alertas se horários de início forem diferentes)
      SLOT_KEYS.forEach((slot, idx) => {
        const onInterval = employees.filter(e => getSlot(e.id, dow, slot) === 'interval')
        if (onInterval.length >= 2) {
          // Filtra apenas se houver pelo menos 2 pessoas que INICIARAM o intervalo no MESMO slot
          // Se as pessoas iniciaram em horários diferentes, não gera alerta mesmo com sobreposição parcial
          const starters = onInterval.filter(e => {
            const prevSlot = idx > 0 ? SLOT_KEYS[idx - 1] : null
            return !prevSlot || getSlot(e.id, dow, prevSlot) !== 'interval'
          })

          if (starters.length >= 2) {
            al.push({
              type: 'critical',
              message: `R16: ${label} ${slot} — ${starters.map(e => e.name.split(' ')[0]).join(' e ')} iniciaram intervalo simultaneamente`
            })
          }
        }
      })

      // R17 — Limite de folgas simultâneas (TRAVA CRÍTICA)
      const offCount = employees.filter(emp => SLOT_KEYS.some(s => getSlot(emp.id, dow, s) === 'day_off')).length
      const maxOff = employees.length <= 6 ? 1 : 2;
      if (offCount > maxOff) {
        al.push({ 
          type: 'critical', 
          message: `R17: ${label} — ${offCount} folgas excede o limite (máx ${maxOff} para esta loja)` 
        })
      }

      // R18 — Carga horária máxima contínua (6h sem intervalo)
      employees.forEach(emp => {
        const slots = SLOT_KEYS.map(s => getSlot(emp.id, dow, s))
        let continuousWork = 0
        let alertTriggered = false
        slots.forEach((type, idx) => {
          if (type === 'work') {
            continuousWork += 30
          } else {
            continuousWork = 0
          }
          
          if (continuousWork > 360 && !alertTriggered) { // 6 horas
            const time = SLOT_KEYS[idx]
            al.push({ 
              type: 'critical', 
              message: `R18: ${emp.name.split(' ')[0]} — ${label} trabalhou >6h seguidas às ${time}` 
            })
            alertTriggered = true
          }
        })
      })

      // R19 — Preferência de Saída (Abertura sai primeiro)
      const staffWork = employees
        .map(emp => {
          const work = SLOT_KEYS.filter(s => getSlot(emp.id, dow, s) === 'work')
          return { name: emp.name.split(' ')[0], entry: work[0], exit: work[work.length - 1] }
        })
        .filter(s => s.entry)

      staffWork.forEach(p1 => {
        staffWork.forEach(p2 => {
          if (p1.entry < p2.entry && p1.exit > p2.exit) {
            al.push({ 
              type: 'warning', 
              message: `R19: ${label} — ${p1.name} entrou antes mas sai depois de ${p2.name}` 
            })
          }
        })
      })

      // R20 — Excesso de contingente (Freelancers manuais)
      const manualFrees = freelancerSlots.filter(s => s.day_of_week === dow && s.is_manual && s.filled_by)
      if (manualFrees.length > 0) {
        const isWeekday = dow >= 1 && dow <= 5
        const target = isWeekday ? (store.min_weekday_staff ?? 3) : (store.min_weekend_staff ?? 4)
        const workingEmps = employees.filter(e => SLOT_KEYS.some(s => getSlot(e.id, dow, s) === 'work')).length
        
        if (workingEmps + manualFrees.length > target) {
          al.push({ 
            type: 'warning', 
            message: `R20: ${label} — excesso de pessoas (${workingEmps + manualFrees.length}/${target}) devido a freelancer manual` 
          })
        }
      }
    })

    return al
  }, [employees, weekDates, getSlot, store, freelancerSlots])

  // Banco de horas — lê de hours_bank (não recalcula)
  const [bankHours, setBankHours] = useState<Record<string, number>>({})
  const weekKey = weekDates[0] ? format(weekDates[0], 'yyyy-MM-dd') : null
  const empIdsKey = employees.map(e => e.id).join(',')
  useEffect(() => {
    if (!store?.id || !weekKey || employees.length === 0) {
      setBankHours({})
      return
    }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('hours_bank')
        .select('employee_id, scheduled_hours')
        .eq('store_id', store.id)
        .eq('week_start', weekKey)
        .in('employee_id', employees.map(e => e.id))
      if (cancelled) return
      const map: Record<string, number> = {}
      ;(data ?? []).forEach((r: { employee_id: string; scheduled_hours: number | string }) => {
        map[r.employee_id] = Number(r.scheduled_hours) || 0
      })
      setBankHours(map)
    })()
    return () => { cancelled = true }
    // schedule?.id muda quando a escala é regerada/recarregada
  }, [store?.id, weekKey, empIdsKey, schedule?.id])

  function fmtHours(h: number): string {
    const totalMin = Math.round(h * 60)
    const hh = Math.floor(totalMin / 60)
    const mm = totalMin % 60
    return mm === 0 ? `${hh}h` : `${hh}h${String(mm).padStart(2, '0')}`
  }

  const weekHours = useMemo(
    () => employees.map(emp => ({ emp, total: bankHours[emp.id] ?? 0 })),
    [employees, bankHours],
  )

  const folgas = useMemo(() => {
    return [...employees]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(emp => {
        const offDays = weekDates
          .map(d => d.getDay())
          .filter(dow => SLOT_KEYS.some(s => getSlot(emp.id, dow, s) === 'day_off'))
        return { emp, offDays }
      })
  }, [employees, weekDates, getSlot])


  const criticals = alerts.filter(a => a.type === 'critical')
  const warnings = alerts.filter(a => a.type === 'warning')

  return (
    <aside className="w-48 border-l border-gray-200 bg-white flex flex-col flex-shrink-0 overflow-y-auto">
      {/* Resumo */}
      <div className="px-3 py-3 border-b border-gray-100">
        <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Semana</div>
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Alertas</span>
            <span className={`font-semibold ${criticals.length > 0 ? 'text-red-600' : 'text-brand-600'}`}>
              {alerts.length}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Status</span>
            <span className={`font-medium text-xs ${
              schedule?.status === 'published' ? 'text-brand-600' : 'text-amber-600'
            }`}>
              {schedule?.status === 'published' ? 'Publicada' : 'Rascunho'}
            </span>
          </div>
        </div>
      </div>

      {/* Alertas */}
      <div className="px-3 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Alertas</div>
          {alerts.length > 0 && (
            <span className="text-[9px] text-gray-400">{alerts.length}</span>
          )}
        </div>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-1.5 text-[10px] text-brand-600 bg-brand-50 rounded-lg px-2 py-1.5">
            <CheckCircle size={11} />
            Nenhum conflito
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto pr-1">
            {alerts.map((al, i) => (
              <div key={i} className={`flex gap-1.5 items-start text-[9px] rounded-md px-2 py-1.5 leading-tight ${
                al.type === 'critical' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
              }`}>
                {al.type === 'critical'
                  ? <AlertCircle size={10} className="flex-shrink-0 mt-0.5" />
                  : <AlertTriangle size={10} className="flex-shrink-0 mt-0.5" />
                }
                {al.message}
              </div>
            ))}
          </div>
        )}
      </div>


      {/* Horas */}
      <div className="px-3 py-3 flex-1">
        <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Horas / semana</div>
        <div className="flex flex-col gap-2">
          {weekHours.map(({ emp, total }) => {
            const contract = getContractWeeklyHours(emp, store)
            const pct = Math.min(100, Math.round(total / contract * 100))
            const over = total > contract
            return (
              <div key={emp.id} className="flex items-center gap-1.5">
                <div className="text-[9px] font-medium w-14 truncate" style={{ color: emp.color }}>
                  {emp.name.split(' ')[0]}
                </div>
                <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: over ? '#DC2626' : emp.color }}
                  />
                </div>
                <div className={`text-[9px] min-w-[34px] text-right font-medium ${over ? 'text-red-600' : 'text-gray-400'}`}>
                  {fmtHours(total)}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Folgas da semana */}
      <div className="px-3 py-3 border-t border-gray-100">
        <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Folgas da semana</div>
        <div className="flex flex-col gap-1">
          {folgas.map(({ emp, offDays }) => (
            <div key={emp.id} className="text-[10px] leading-tight flex justify-between gap-2">
              <span className="font-semibold truncate" style={{ color: emp.color }}>
                {emp.name.split(' ')[0].toUpperCase()}
              </span>
              <span className="text-gray-500 text-right">
                {offDays.length === 0
                  ? 'Trabalhando todos os dias'
                  : offDays.map(d => DAY_NAMES[d]).join(', ')}
              </span>
            </div>
          ))}
        </div>
      </div>


      {/* Responsabilidades */}
      {employees.some(e => e.responsibilities.length > 0) && (
        <div className="px-3 py-3 border-t border-gray-100">
          <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Responsabilidades</div>
          {employees.filter(e => e.responsibilities.includes('estoque')).map(e => (
            <div key={e.id} className="text-[9px] bg-blue-50 text-blue-700 rounded px-2 py-1 mb-1">
              📦 Estoque: {e.name.split(' ')[0]}
            </div>
          ))}
          {employees.filter(e => e.responsibilities.includes('maquina')).map(e => (
            <div key={e.id} className="text-[9px] bg-red-50 text-red-700 rounded px-2 py-1 mb-1">
              🫧 Máquina: {e.name.split(' ')[0]}
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
