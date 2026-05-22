import { useState } from 'react'
import { DAY_NAMES, SLOT_KEYS, type Employee, type Store } from '@/types'
import SlotModal from './SlotModal'

interface Props {
  employees: Employee[]
  weekDates: Date[]
  getSlot: (empId: string, dow: number, slot: string) => string
  updateSlot: (empId: string, dow: number, slot: string, type: string) => Promise<void>
  store: Store
}

const TODAY = new Date()

function hex2rgba(hex: string, alpha = 0.15) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export default function GradeHoraria({ employees, weekDates, getSlot, updateSlot, store }: Props) {
  const [modal, setModal] = useState<{
    emp: Employee; dow: number; slot: string; date: Date; current: string
  } | null>(null)

  function isOnHour(slot: string) { return slot.endsWith(':00') }
  function isPeak(slot: string) {
    const h = parseInt(slot)
    return h >= 12 && h <= 21
  }

  function getCoverage(dow: number, slot: string) {
    return employees.filter(e => getSlot(e.id, dow, slot) === 'work').length
  }

  // Detectar blocos contínuos por funcionário/dia
  function getBlockInfo(empId: string, dow: number, slotIdx: number) {
    const slot = SLOT_KEYS[slotIdx]
    const type = getSlot(empId, dow, slot)
    if (type === 'empty') return null

    // início do bloco
    let start = slotIdx
    while (start > 0 && getSlot(empId, dow, SLOT_KEYS[start - 1]) === type) start--

    // fim do bloco
    let end = slotIdx
    while (end < SLOT_KEYS.length - 1 && getSlot(empId, dow, SLOT_KEYS[end + 1]) === type) end++

    return { type, isStart: start === slotIdx, isEnd: end === slotIdx }
  }

  // Funcionário em folga o dia todo (coluna inteira)
  function isFullDayOff(empId: string, dow: number) {
    let hasOff = false
    for (const s of SLOT_KEYS) {
      const t = getSlot(empId, dow, s)
      if (t === 'work' || t === 'interval') return false
      if (t === 'day_off') hasOff = true
    }
    return hasOff
  }

  const washDays: number[] = (store as any).machine_wash_days ?? []
  const stockDays: number[] = (store as any).stock_count_days ?? []
  function stripePattern(hex: string) {
    const c = hex2rgba(hex, 0.22)
    const c2 = hex2rgba(hex, 0.10)
    return `repeating-linear-gradient(45deg, ${c} 0 6px, ${c2} 6px 12px)`
  }

  return (
    <>
      <div className="overflow-auto h-full">
        <table className="border-collapse" style={{ minWidth: `${64 + weekDates.length * employees.length * 48}px` }}>
          {/* Header row 1: days */}
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white w-14 min-w-[52px] border-b border-r border-gray-200 text-xs text-gray-400 font-medium px-2 py-2 text-left">
                Horário
              </th>
              {weekDates.map((d, di) => {
                const isToday = d.toDateString() === TODAY.toDateString()
                const isWknd = d.getDay() === 0 || d.getDay() === 6
                return (
                  <th
                    key={di}
                    colSpan={employees.length}
                    className={`border-b border-gray-200 text-center py-1.5 px-1 ${
                      isToday ? 'bg-brand-50' : isWknd ? 'bg-gray-100' : di % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                    }`}
                    style={{ borderLeft: '2px solid #888780' }}
                  >
                    <span className={`text-xs font-medium ${isToday ? 'text-brand-600' : 'text-gray-500'}`}>
                      {DAY_NAMES[d.getDay()]}
                    </span>
                    <span className={`block text-sm font-semibold ${isToday ? 'text-brand-700' : 'text-gray-800'}`}>
                      {d.getDate()}/{String(d.getMonth() + 1).padStart(2, '0')}
                    </span>
                    <div className="flex items-center justify-center gap-1 mt-0.5 min-h-[14px]">
                      {washDays.includes(d.getDay()) && (
                        <span title="Lavagem de máquina" className="text-[9px] px-1 rounded bg-sky-100 text-sky-700 font-medium">🧺 Lav</span>
                      )}
                      {stockDays.includes(d.getDay()) && (
                        <span title="Contagem de estoque" className="text-[9px] px-1 rounded bg-amber-100 text-amber-700 font-medium">📦 Est</span>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
            {/* Header row 2: employees */}
            <tr>
              <th className="sticky left-0 z-10 bg-white border-b border-r border-gray-200 w-16 text-left px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                Hora
              </th>
              {weekDates.map((d, di) => {
                return employees.map((emp, ei) => {
                  const off = isFullDayOff(emp.id, d.getDay())
                  return (
                    <th
                      key={`${di}-${ei}`}
                      className="border-b border-gray-200 text-center py-1 px-0.5 w-12 bg-white"
                      style={{
                        borderLeft: ei === 0 ? '2px solid #888780' : '0.5px solid #E5E5E0',
                        ...(off ? { background: stripePattern(emp.color) } : {}),
                      }}
                    >
                      <div className="text-[9px] font-bold uppercase tracking-wide truncate" style={{ color: emp.color }}>
                        {emp.name.split(' ')[0].substring(0, 7)}
                      </div>
                      {off && (
                        <div className="text-[8px] font-bold mt-0.5" style={{ color: emp.color }}>FOLGA</div>
                      )}
                    </th>
                  )
                })
              })}
            </tr>
          </thead>

          <tbody>
            {SLOT_KEYS.map((slot) => {
              const onHour = isOnHour(slot)
              return (
                <tr key={slot}>
                  {/* Hour label */}
                  <td className={`sticky left-0 z-5 bg-white border-r border-gray-200 w-16 px-2 text-left align-middle ${
                    onHour ? 'border-t border-gray-200' : 'border-t border-gray-50'
                  }`}>
                    <span className={`text-[11px] ${onHour ? 'font-semibold text-gray-700' : 'text-gray-400'}`}>
                      {slot}
                    </span>
                  </td>

                  {/* Cells */}
                  {weekDates.map((d, di) => {
                    const dow = d.getDay()
                    return employees.map((emp, ei) => {
                      const slotType = getSlot(emp.id, dow, slot)
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
                          onClick={() => setModal({ emp, dow, slot, date: d, current: slotType })}
                          style={style}
                          className={`w-12 h-7 cursor-pointer hover:brightness-95 ${
                            onHour ? 'border-t border-gray-200' : 'border-t border-gray-50'
                          }`}
                        />
                      )
                    })
                  })}
                </tr>
              )
            })}

            {/* Summary row */}
            <tr className="bg-gray-50 border-t border-gray-300">
              <td className="sticky left-0 bg-gray-50 border-r border-gray-200 px-2 text-[9px] font-medium text-gray-500 py-1.5">
                Cobertura
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
                    className="text-center py-1"
                    style={{ borderLeft: ei === 0 ? '2px solid #888780' : '0.5px solid #F1F0EC' }}
                  >
                    {ei === Math.floor(employees.length / 2) && (
                      <span className={`text-[9px] font-semibold ${ok ? 'text-brand-600' : fcOk ? 'text-amber-600' : 'text-red-600'}`}>
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
          slot={modal.slot}
          date={modal.date}
          current={modal.current}
          onClose={() => setModal(null)}
          onSave={async (type) => {
            await updateSlot(modal.emp.id, modal.dow, modal.slot, type)
            setModal(null)
          }}
        />
      )}
    </>
  )
}
