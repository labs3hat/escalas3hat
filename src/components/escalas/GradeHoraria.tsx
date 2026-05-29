import { useEffect, useRef, useState } from 'react'
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
    reason?: string
  ) => Promise<void>
  store: Store
  isPublished: boolean
}

const TODAY = new Date()

function hex2rgba(hex: string, alpha = 0.15) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export default function GradeHoraria({ employees, weekDates, getSlot, updateDay, store, isPublished }: Props) {
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

  function buildDayPayload(emp: Employee, dow: number): DayPayload {
    const work = SLOT_KEYS.filter(s => getSlot(emp.id, dow, s) === 'work')
    const intv = SLOT_KEYS.filter(s => getSlot(emp.id, dow, s) === 'interval')
    const off  = SLOT_KEYS.some(s => getSlot(emp.id, dow, s) === 'day_off')
    if (work.length === 0 && intv.length === 0) {
      return { type: off ? 'day_off' : 'empty' }
    }
    const all = [...work, ...intv].sort()
    
    // Cálculo baseado no regime (6x1 = 8h20, 5x2 = 9h48)
    const toMin = (s: string) => {
      const [h, m] = s.split(':').map(Number)
      return h * 60 + m
    }
    const fmt = (mins: number) =>
      `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
    
    const entry = all[0]
    const bruta = emp.work_regime === '5x2' ? 588 : 500
    const exit = fmt(toMin(entry) + bruta)

    const fmtAdd30 = (s: string) => {
      const [h, m] = s.split(':').map(Number)
      const tot = h * 60 + m + 30
      return `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`
    }

    return {
      type: 'work',
      entry,
      exit,
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

  // Linhas de hora cheia — dinâmico: 07h até hora de fechamento da loja
  function ceilHour(t?: string | null): number {
    if (!t) return 22
    const [h, m] = t.split(':').map(Number)
    return m > 0 ? h + 1 : h
  }
  const closeHour = Math.max(
    ceilHour((store as any).closing_exit_6x1),
    ceilHour((store as any).closing_exit_5x2),
  )
  const endHour = Math.min(23, Math.max(22, closeHour))
  const HOUR_KEYS: string[] = []
  for (let h = 7; h <= endHour; h++) HOUR_KEYS.push(`${String(h).padStart(2, '0')}:00`)

  // Altura dinâmica das linhas — calcula a partir do container para caber sem scroll
  const containerRef = useRef<HTMLDivElement>(null)
  const theadRef = useRef<HTMLTableSectionElement>(null)
  const footerRef = useRef<HTMLTableRowElement>(null)
  const [rowH, setRowH] = useState(20)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const headerH = theadRef.current?.offsetHeight ?? 0
      const footerH = footerRef.current?.offsetHeight ?? 0
      const available = el.clientHeight - headerH - footerH - 6
      const next = Math.max(12, Math.floor(available / HOUR_KEYS.length))
      setRowH(next)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    if (theadRef.current) ro.observe(theadRef.current)
    if (footerRef.current) ro.observe(footerRef.current)
    return () => ro.disconnect()
  }, [HOUR_KEYS.length])



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
      <div ref={containerRef} className="overflow-hidden h-full">
        <table className="border-collapse w-full h-full" style={{ tableLayout: 'fixed' }}>
          <thead ref={theadRef}>
            <tr style={{ height: 34 }}>
              <th className="sticky left-0 z-10 bg-white w-10 min-w-[36px] h-[34px] border-b border-r border-gray-200 text-[8px] text-gray-400 font-medium px-1 py-0 text-left leading-none">
                H
              </th>
              {weekDates.map((d, di) => {
                const isToday = d.toDateString() === TODAY.toDateString()
                const isWknd = d.getDay() === 0 || d.getDay() === 6
                return (
                  <th
                    key={di}
                    colSpan={employees.length}
                    className={`h-[34px] border-b border-gray-200 text-center py-0 px-0.5 leading-none ${
                      isToday ? 'bg-brand-50' : isWknd ? 'bg-gray-100' : di % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                    }`}
                    style={{ borderLeft: '2px solid #888780' }}
                  >
                    <span className={`text-[8px] font-medium ${isToday ? 'text-brand-600' : 'text-gray-500'}`}>
                      {DAY_NAMES[d.getDay()]}
                    </span>
                    <span className={`block text-[9px] font-semibold leading-none ${isToday ? 'text-brand-700' : 'text-gray-800'}`}>
                      {d.getDate()}/{String(d.getMonth() + 1).padStart(2, '0')}
                    </span>
                    <div className="flex items-center justify-center gap-0.5 min-h-[8px] leading-none">
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
            <tr style={{ height: 58 }}>
              <th className="sticky left-0 z-10 bg-white border-b border-r border-gray-200 w-10 h-[58px] text-left px-1 py-0 text-[8px] font-semibold uppercase tracking-wide text-gray-600 leading-none align-bottom">
                Hr
              </th>
              {weekDates.map((d, di) =>
                employees.map((emp, ei) => {
                  const off = isFullDayOff(emp.id, d.getDay())
                  return (
                    <th
                      key={`${di}-${ei}`}
                      className="h-[58px] border-b border-gray-200 text-center py-0.5 bg-white leading-none align-bottom"
                      title={emp.name}
                      style={{
                        width: COL_W,
                        minWidth: COL_W,
                        borderLeft: ei === 0 ? '2px solid #888780' : '0.5px solid #E5E5E0',
                        ...(off ? { background: stripePattern(emp.color) } : {}),
                      }}
                    >
                      <div className="flex flex-col items-center justify-end h-full gap-0.5">
                        <div
                          className="text-[9px] font-bold uppercase tracking-tight leading-none whitespace-nowrap"
                          style={{
                            color: emp.color,
                            writingMode: 'vertical-rl',
                            transform: 'rotate(180deg)',
                          }}
                        >
                          {emp.name.split(' ')[0]}
                        </div>
                        {off && (
                          <div className="text-[6px] font-bold leading-none" style={{ color: emp.color }}>F</div>
                        )}
                      </div>
                    </th>
                  )
                }),
              )}
            </tr>
          </thead>


          <tbody>
            {HOUR_KEYS.map((hour) => {
              return (
                <tr key={hour} style={{ height: rowH }}>
                  <td
                    className="sticky left-0 z-5 bg-white border-r border-t border-gray-200 px-1 text-left align-middle leading-none"
                    style={{ height: rowH }}
                  >
                    <span className="text-[9px] font-semibold text-gray-700">
                      {hour.slice(0, 2)}h
                    </span>
                  </td>

                  {weekDates.map((d, di) => {
                    const dow = d.getDay()
                    return employees.map((emp, ei) => {
                      const slotType = hourType(emp.id, dow, hour)
                      const fullOff = isFullDayOff(emp.id, dow)

                      const borderLeft = ei === 0 ? '2px solid #888780' : '0.5px solid #E5E5E0'
                      let style: React.CSSProperties = { backgroundColor: 'white', borderLeft }

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
                          onClick={() => setModal({ emp, dow, date: d, initial: buildDayPayload(emp, dow) })}
                          style={{ ...style, height: rowH }}
                          className="cursor-pointer hover:brightness-95 p-0 border-t border-gray-200"
                        />
                      )
                    })
                  })}
                </tr>
              )
            })}


            <tr ref={footerRef} className="bg-gray-50 border-t border-gray-300">
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
          isPublished={isPublished}
          onClose={() => setModal(null)}
          onSave={async (payload) => {
            await updateDay(
              modal.emp.id,
              modal.dow,
              payload.type,
              payload.type === 'work'
                ? { entry: payload.entry!, exit: payload.exit!, breakStart: payload.breakStart, breakEnd: payload.breakEnd }
                : undefined,
              payload.reason,
            )
            setModal(null)
          }}
        />
      )}
    </>
  )
}