import { useState } from 'react'
import { DAY_NAMES, SLOT_KEYS, type Employee, type Store } from '@/types'
import SlotModal, { type DayPayload } from './SlotModal'

interface Props {
  employees: Employee[]
  weekDates: Date[]
  getSlot: (empId: string, dow: number, slot: string) => string
  updateDay: (
    employeeId: string,
    dayOfWeek: number,
    type: 'work' | 'day_off' | 'empty',
    payload?: { entry: string; exit: string; breakStart?: string; breakEnd?: string },
  ) => Promise<void>
  store: Store
}

const TODAY = new Date()

function hex2rgba(hex: string, alpha = 0.15) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export default function GradeHoraria({ employees, weekDates, getSlot, updateDay, store }: Props) {
  const [modal, setModal] = useState<{
    emp: Employee; dow: number; date: Date; initial: DayPayload
  } | null>(null)

  function isOnHour(slot: string) { return slot.endsWith(':00') }

  function isFullDayOff(empId: string, dow: number) {
    let hasOff = false
    for (const s of SLOT_KEYS) {
      const t = getSlot(empId, dow, s)
      if (t === 'work' || t === 'interval') return false
      if (t === 'day_off') hasOff = true
    }
    return hasOff
  }

  // Constrói o estado do dia para abrir o modal
  function buildDayPayload(empId: string, dow: number): DayPayload {
    const work = SLOT_KEYS.filter(s => getSlot(empId, dow, s) === 'work')
    const intv = SLOT_KEYS.filter(s => getSlot(empId, dow, s) === 'interval')
    const off  = SLOT_KEYS.some(s => getSlot(empId, dow, s) === 'day_off')
    if (work.length === 0 && intv.length === 0) {
      return { type: off ? 'day_off' : 'empty' }
    }
    const all = [...work, ...intv].sort()
    const fmtAdd30 = (s: string) => {
      const [h, m] = s.split(':').map(Number)
      const tot = h * 60 + m + 30
      return `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`
    }
    return {
      type: 'work',
      entry: all[0],
      exit: fmtAdd30(all[all.length - 1]),
      breakStart: intv[0],
      breakEnd: intv.length > 0 ? fmtAdd30(intv[intv.length - 1]) : undefined,
    }
  }

  const washDays: number[] = (store as any).machine_wash_days ?? []
  const stockDays: number[] = (store as any).stock_count_days ?? []
  function stripePattern(hex: string) {
    const c = hex2rgba(hex, 0.22)
    const c2 = hex2rgba(hex, 0.10)
    return `repeating-linear-gradient(45deg, ${c} 0 6px, ${c2} 6px 12px)`
  }

  // Compact sizing
  const COL_W = 36   // px — coluna por funcionário

  // Linhas de hora cheia (07h às 22h => 16 linhas representando 07-23)
  const HOUR_KEYS: string[] = []
  for (let h = 7; h <= 22; h++) HOUR_KEYS.push(`${String(h).padStart(2, '0')}:00`)

  // Tipo prevalente da hora:
  //   QUALQUER subslot interval -> interval
  //   senão QUALQUER work -> work
  //   senão day_off / empty
  function hourType(empId: string, dow: number, hour: string): string {
    const half = `${hour.slice(0, 2)}:30`
    const a = getSlot(empId, dow, hour)
    const b = SLOT_KEYS.includes(half) ? getSlot(empId, dow, half) : a
    if (a === 'interval' || b === 'interval') return 'interval'
    if (a === 'work' || b === 'work') return 'work'
    if (a === 'day_off' || b === 'day_off') return 'day_off'
    return 'empty'
  }


  return (
    <>
      <div className="overflow-auto h-full">
        <table className="border-collapse w-full" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white w-10 min-w-[36px] border-b border-r border-gray-200 text-[9px] text-gray-400 font-medium px-1 py-1 text-left">
                H
              </th>
              {weekDates.map((d, di) => {
                const isToday = d.toDateString() === TODAY.toDateString()
                const isWknd = d.getDay() === 0 || d.getDay() === 6
                return (
                  <th
                    key={di}
                    colSpan={employees.length}
                    className={`border-b border-gray-200 text-center py-0.5 px-0.5 ${
                      isToday ? 'bg-brand-50' : isWknd ? 'bg-gray-100' : di % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                    }`}
                    style={{ borderLeft: '2px solid #888780' }}
                  >
                    <span className={`text-[9px] font-medium ${isToday ? 'text-brand-600' : 'text-gray-500'}`}>
                      {DAY_NAMES[d.getDay()]}
                    </span>
                    <span className={`block text-[10px] font-semibold leading-tight ${isToday ? 'text-brand-700' : 'text-gray-800'}`}>
                      {d.getDate()}/{String(d.getMonth() + 1).padStart(2, '0')}
                    </span>
                    <div className="flex items-center justify-center gap-0.5 min-h-[10px]">
                      {washDays.includes(d.getDay()) && (
                        <span title="Lavagem" className="text-[8px] px-0.5 rounded bg-sky-100 text-sky-700 font-medium">🧺</span>
                      )}
                      {stockDays.includes(d.getDay()) && (
                        <span title="Estoque" className="text-[8px] px-0.5 rounded bg-amber-100 text-amber-700 font-medium">📦</span>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
            <tr>
              <th className="sticky left-0 z-10 bg-white border-b border-r border-gray-200 w-10 text-left px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-gray-600">
                Hr
              </th>
              {weekDates.map((d, di) =>
                employees.map((emp, ei) => {
                  const off = isFullDayOff(emp.id, d.getDay())
                  return (
                    <th
                      key={`${di}-${ei}`}
                      className="border-b border-gray-200 text-center py-0.5 bg-white"
                      style={{
                        width: COL_W,
                        minWidth: COL_W,
                        borderLeft: ei === 0 ? '2px solid #888780' : '0.5px solid #E5E5E0',
                        ...(off ? { background: stripePattern(emp.color) } : {}),
                      }}
                    >
                      <div className="text-[9px] font-bold uppercase tracking-tight truncate leading-tight" style={{ color: emp.color }}>
                        {emp.name.split(' ')[0].substring(0, 6)}
                      </div>
                      {off && (
                        <div className="text-[7px] font-bold leading-tight" style={{ color: emp.color }}>FOLGA</div>
                      )}
                    </th>
                  )
                }),
              )}
            </tr>
          </thead>

          <tbody>
            {HOUR_KEYS.map((hour) => {
              return (
                <tr key={hour} style={{ height: ROW_H }}>
                  <td
                    className="sticky left-0 z-5 bg-white border-r border-t border-gray-200 px-1 text-left align-middle"
                    style={{ height: ROW_H }}
                  >
                    <span className="text-[10px] font-semibold text-gray-700">
                      {hour.slice(0, 2)}h
                    </span>
                  </td>

                  {weekDates.map((d, di) => {
                    const dow = d.getDay()
                    return employees.map((emp, ei) => {
                      const slotType = hourType(emp.id, dow, hour)
                      const fullOff = isFullDayOff(emp.id, dow)

                      const borderLeft = ei === 0 ? '2px solid #888780' : '0.5px solid #E5E5E0'
                      let style: React.CSSProperties = { backgroundColor: 'white', borderLeft, height: ROW_H }

                      if (slotType === 'work') {
                        style = { ...style, backgroundColor: emp.color }
                      } else if (slotType === 'interval') {
                        style = { ...style, backgroundColor: '#E8D9B8' }
                      } else if (fullOff) {
                        style = { ...style, background: stripePattern(emp.color) }
                      } else if (slotType === 'day_off') {
                        style = { ...style, backgroundColor: '#F1F0EC' }
                      }

                      return (
                        <td
                          key={`${di}-${ei}`}
                          onClick={() => setModal({ emp, dow, date: d, initial: buildDayPayload(emp.id, dow) })}
                          style={style}
                          className="cursor-pointer hover:brightness-95 p-0 border-t border-gray-200 min-h-[28px] md:min-h-[32px]"
                        />
                      )
                    })
                  })}
                </tr>
              )
            })}


            <tr className="bg-gray-50 border-t border-gray-300">
              <td className="sticky left-0 bg-gray-50 border-r border-gray-200 px-1 text-[8px] font-medium text-gray-500 py-0.5">
                Cob
              </td>
              {weekDates.map((d, di) => {
                const dow = d.getDay()
                const abSlot = store.opening_time_weekday || '10:00'
                const fcSlot = '22:00'
                const abCount = employees.filter(e => getSlot(e.id, dow, abSlot) === 'work').length
                const fcCount = employees.filter(e => getSlot(e.id, dow, fcSlot) === 'work').length
                const abOk = abCount >= (store.min_opening_staff ?? 1)
                const fcOk = fcCount >= (store.min_closing_staff ?? 2)
                const ok = abOk && fcOk

                return employees.map((emp, ei) => (
                  <td
                    key={`sum-${di}-${ei}`}
                    className="text-center py-0.5"
                    style={{ borderLeft: ei === 0 ? '2px solid #888780' : '0.5px solid #F1F0EC' }}
                  >
                    {ei === Math.floor(employees.length / 2) && (
                      <span className={`text-[8px] font-semibold ${ok ? 'text-brand-600' : fcOk ? 'text-amber-600' : 'text-red-600'}`}>
                        {ok ? '✓' : !fcOk ? 'fc↓' : 'ab↓'}
                      </span>
                    )}
                  </td>
                ))
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {modal && (
        <SlotModal
          emp={modal.emp}
          dow={modal.dow}
          date={modal.date}
          initial={modal.initial}
          onClose={() => setModal(null)}
          onSave={async (payload) => {
            await updateDay(
              modal.emp.id,
              modal.dow,
              payload.type,
              payload.type === 'work'
                ? { entry: payload.entry!, exit: payload.exit!, breakStart: payload.breakStart, breakEnd: payload.breakEnd }
                : undefined,
            )
            setModal(null)
          }}
        />
      )}
    </>
  )
}
