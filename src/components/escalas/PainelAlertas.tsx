import { useMemo } from 'react'
import { AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react'
import { SLOT_KEYS, DAY_NAMES, type Employee, type Store, type Schedule } from '@/types'

interface Props {
  employees: Employee[]
  weekDates: Date[]
  getSlot: (empId: string, dow: number, slot: string) => string
  store: Store
  schedule: Schedule | null
}

interface Alert {
  type: 'critical' | 'warning'
  message: string
}

export default function PainelAlertas({ employees, weekDates, getSlot, store, schedule }: Props) {
  const alerts = useMemo<Alert[]>(() => {
    const al: Alert[] = []

    weekDates.forEach(d => {
      const dow = d.getDay()
      const label = `${DAY_NAMES[dow]} ${d.getDate()}/${d.getMonth()+1}`

      // R1 — mínimo na abertura
      const abSlots = ['08:00','08:30','09:00','09:30','10:00']
      const abCount = employees.filter(e => abSlots.some(s => getSlot(e.id, dow, s) === 'work')).length
      if (abCount < (store.min_opening_staff ?? 1)) {
        al.push({ type: 'critical', message: `R1: ${label} — abertura sem cobertura mínima` })
      }

      // R2 — mínimo no fechamento
      const fcCount = employees.filter(e =>
        ['21:30','22:00'].some(s => getSlot(e.id, dow, s) === 'work')
      ).length
      if (fcCount < (store.min_closing_staff ?? 2)) {
        al.push({ type: 'critical', message: `R2: ${label} — fechamento com ${fcCount} func. (mín. ${store.min_closing_staff ?? 2})` })
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

      // R16 — intervalos simultâneos
      SLOT_KEYS.forEach(slot => {
        const onInterval = employees.filter(e => getSlot(e.id, dow, slot) === 'interval')
        if (onInterval.length >= 2) {
          al.push({
            type: 'critical',
            message: `R16: ${label} ${slot} — ${onInterval.map(e => e.name.split(' ')[0]).join(' e ')} em intervalo simultâneo`
          })
        }
      })
    })

    return al
  }, [employees, weekDates, getSlot, store])

  const weekHours = useMemo(() => {
    return employees.map(emp => {
      let total = 0
      weekDates.forEach(d => {
        SLOT_KEYS.forEach(s => {
          if (getSlot(emp.id, d.getDay(), s) === 'work') total += 0.5
        })
      })
      return { emp, total: Math.round(total * 10) / 10 }
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
        <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Alertas</div>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-1.5 text-[10px] text-brand-600 bg-brand-50 rounded-lg px-2 py-1.5">
            <CheckCircle size={11} />
            Nenhum conflito
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {alerts.slice(0, 6).map((al, i) => (
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
            {alerts.length > 6 && (
              <div className="text-[9px] text-gray-400 text-center">+{alerts.length - 6} alertas</div>
            )}
          </div>
        )}
      </div>

      {/* Horas */}
      <div className="px-3 py-3 flex-1">
        <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Horas / semana</div>
        <div className="flex flex-col gap-2">
          {weekHours.map(({ emp, total }) => {
            const pct = Math.min(100, Math.round(total / 44 * 100))
            const over = total > 44
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
                <div className={`text-[9px] min-w-[26px] text-right font-medium ${over ? 'text-red-600' : 'text-gray-400'}`}>
                  {total}h
                </div>
              </div>
            )
          })}
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
