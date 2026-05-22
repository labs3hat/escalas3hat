import { DAY_NAMES, SLOT_KEYS, type Employee, type Store } from '@/types'

interface Props {
  employees: Employee[]
  weekDates: Date[]
  getSlot: (empId: string, dow: number, slot: string) => string
  store: Store
}

const TODAY = new Date()

export default function ResumoSemanal({ employees, weekDates, getSlot, store }: Props) {
  function getDayData(emp: Employee, dow: number) {
    const workSlots = SLOT_KEYS.filter(s => getSlot(emp.id, dow, s) === 'work')
    const isFolga = SLOT_KEYS.some(s => getSlot(emp.id, dow, s) === 'day_off') && workSlots.length === 0
    const hasIntConflict = checkIntervalConflict(dow)

    if (isFolga) return { type: 'folga' as const }
    if (workSlots.length === 0) return { type: 'empty' as const }

    const entry = workSlots[0]
    const lastSlot = workSlots[workSlots.length - 1]
    const hrs = workSlots.length * 0.5
    const [eh, em] = entry.split(':').map(Number)
    const [lh, lm] = lastSlot.split(':').map(Number)
    // saída real = início do último slot + 30 min
    const exitTotal = lh * 60 + lm + 30
    const xh = Math.floor(exitTotal / 60)
    const xm = exitTotal % 60
    const fmt = (h: number, m: number) => `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`

    return {
      type: 'work' as const,
      entry: fmt(eh, em),
      exit: fmt(xh, xm),
      hrs,
      hasIntervalConflict: SLOT_KEYS.filter(s => getSlot(emp.id, dow, s) === 'interval').some(s => hasIntConflict(s)),
      hasEstoque: emp.responsibilities.includes('estoque') && dow === 1,
      hasMaquina: emp.responsibilities.includes('maquina') && [2, 4, 6].includes(dow),
    }
  }

  function checkIntervalConflict(dow: number) {
    return (slot: string) => {
      const onInterval = employees.filter(e => getSlot(e.id, dow, slot) === 'interval')
      return onInterval.length >= 2
    }
  }

  return (
    <div className="p-4 overflow-auto">
      <div className="flex gap-3 min-w-max">
        {weekDates.map((d, di) => {
          const dow = d.getDay()
          const isToday = d.toDateString() === TODAY.toDateString()
          const isWknd = dow === 0 || dow === 6
          const abCount = employees.filter(e => getSlot(e.id, dow, store.opening_time_weekday?.replace(':','') ?? '10:00') === 'work').length
          const fcCount = employees.filter(e => getSlot(e.id, dow, '22:00') === 'work').length
          const abOk = abCount >= (store.min_opening_staff ?? 1)
          const fcOk = fcCount >= (store.min_closing_staff ?? 2)

          return (
            <div
              key={di}
              className={`border rounded-xl overflow-hidden w-44 flex-shrink-0 ${
                isToday ? 'border-brand-300' : 'border-gray-200'
              }`}
            >
              {/* Day header */}
              <div className={`px-3 py-2 border-b ${
                isToday ? 'bg-brand-50 border-brand-200' : isWknd ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-100'
              }`}>
                <div className={`text-xs font-medium ${isToday ? 'text-brand-600' : 'text-gray-400'}`}>
                  {DAY_NAMES[dow]}
                </div>
                <div className={`text-base font-semibold ${isToday ? 'text-brand-700' : 'text-gray-800'}`}>
                  {d.getDate()}/{String(d.getMonth()+1).padStart(2,'0')}
                </div>
              </div>

              {/* Employees */}
              {employees.map(emp => {
                const data = getDayData(emp, dow)
                return (
                  <div
                    key={emp.id}
                    className={`px-3 py-2 border-b border-gray-100 last:border-0 ${
                      data.type === 'folga' ? 'bg-gray-50' :
                      data.type === 'work' && data.hasIntervalConflict ? 'bg-red-50' : ''
                    }`}
                  >
                    <div className="text-xs font-medium truncate" style={{ color: emp.color }}>
                      {emp.name.split(' ')[0]}
                    </div>
                    {data.type === 'folga' && (
                      <span className="inline-block text-[9px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded mt-0.5">Folga</span>
                    )}
                    {data.type === 'work' && (
                      <>
                        <div className="text-[10px] text-gray-500">
                          {data.entry} – {data.exit} · {data.hrs}h
                        </div>
                        <div className="flex gap-1 flex-wrap mt-0.5">
                          {data.hasEstoque && <span className="text-[8px] bg-blue-100 text-blue-700 px-1 rounded">Estoque</span>}
                          {data.hasMaquina && <span className="text-[8px] bg-red-100 text-red-700 px-1 rounded">Máquina</span>}
                          {data.hasIntervalConflict && <span className="text-[8px] bg-red-100 text-red-700 px-1 rounded">⚠ R16</span>}
                        </div>
                      </>
                    )}
                    {data.type === 'empty' && (
                      <div className="text-[10px] text-gray-300">—</div>
                    )}
                  </div>
                )
              })}

              {/* Footer */}
              <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100 flex justify-between">
                <span className="text-[9px] text-gray-400">Ab: {abCount}</span>
                <span className={`text-[9px] font-medium ${fcOk ? 'text-brand-600' : 'text-red-600'}`}>
                  Fc: {fcCount} {fcOk ? '✓' : '⚠'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-4 flex-wrap">
        {[
          { color: 'bg-gray-200', label: 'Folga' },
          { color: 'bg-gray-400', label: 'Intervalo' },
          { color: 'bg-red-100 border border-red-200', label: 'Conflito R16' },
          { color: 'bg-blue-100', label: 'Estoque' },
          { color: 'bg-red-100', label: 'Lavar máquina' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className={`w-3 h-3 rounded ${l.color}`} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  )
}
