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

  return (
    <>
      <div className="overflow-auto h-full">
        <table className="border-collapse" style={{ minWidth: `${52 + weekDates.length * employees.length * 34}px` }}>
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
                  </th>
                )
              })}
            </tr>
            {/* Header row 2: employees */}
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 border-b border-r border-gray-200 w-14" />
              {weekDates.map((d, di) => {
                const isToday = d.toDateString() === TODAY.toDateString()
                const isWknd = d.getDay() === 0 || d.getDay() === 6
                const dayAlt = di % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                return employees.map((emp, ei) => (
                  <th
                    key={`${di}-${ei}`}
                    className={`border-b border-gray-200 text-center py-1 px-0.5 w-9 ${
                      isToday ? 'bg-brand-50/60' : isWknd ? 'bg-gray-100' : dayAlt
                    }`}
                    style={{ borderLeft: ei === 0 ? '2px solid #888780' : '0.5px solid #F1F0EC' }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full mx-auto mb-0.5" style={{ backgroundColor: emp.color }} />
                    <div className="text-[9px] font-semibold" style={{ color: emp.color }}>
                      {emp.name.split(' ')[0].substring(0, 4)}
                    </div>
                  </th>
                ))
              })}
            </tr>
          </thead>

          <tbody>
            {SLOT_KEYS.map((slot, si) => {
              const onHour = isOnHour(slot)
              const peak = isPeak(slot)
              return (
                <tr key={slot} className={peak ? 'bg-brand-50/20' : ''}>
                  {/* Hour label */}
                  <td className={`sticky left-0 z-5 bg-white border-r border-gray-100 w-14 px-2 text-right align-top pt-0.5 ${
                    onHour ? 'border-t border-gray-200' : ''
                  }`}>
                    {onHour && (
                      <span className="text-[10px] font-medium text-gray-500">
                        {slot.substring(0, 2)}h
                      </span>
                    )}
                    {!onHour && (
                      <span className="text-[8px] text-gray-300">{slot.substring(3, 5)}</span>
                    )}
                  </td>

                  {/* Cells */}
                  {weekDates.map((d, di) => {
                    const dow = d.getDay()
                    const isToday = d.toDateString() === TODAY.toDateString()
                    const isWknd = dow === 0 || dow === 6

                    return employees.map((emp, ei) => {
                      const slotType = getSlot(emp.id, dow, slot)
                      const block = getBlockInfo(emp.id, dow, si)

                      const dayAltBg = di % 2 === 0 ? '#FBFBF9' : 'transparent'
                      const cellBg = isToday ? 'rgba(29,158,117,0.04)' : isWknd ? '#F1F0EC' : dayAltBg
                      const borderLeft = ei === 0 ? '2px solid #888780' : '0.5px solid #F1F0EC'
                      let style: React.CSSProperties = { backgroundColor: cellBg, borderLeft }

                      if (slotType === 'work' && block) {
                        style = {
                          ...style,
                          backgroundColor: hex2rgba(emp.color, 0.18),
                          borderLeft: `3px solid ${emp.color}`,
                        }
                      } else if (slotType === 'interval') {
                        style = { ...style, backgroundColor: '#D3D1C7' }
                      } else if (slotType === 'day_off') {
                        style = { ...style, backgroundColor: '#F1F0EC' }
                      }

                      return (
                        <td
                          key={`${di}-${ei}`}
                          onClick={() => setModal({ emp, dow, slot, date: d, current: slotType })}
                          style={style}
                          className={`w-9 h-[18px] cursor-pointer hover:brightness-95 relative ${
                            onHour ? 'border-t border-gray-100' : ''
                          }`}
                        >
                          {/* Label no topo do bloco */}
                          {block?.isStart && slotType !== 'empty' && (
                            <span
                              className="absolute left-0.5 top-0 text-[8px] font-semibold leading-none pt-0.5 truncate max-w-full"
                              style={{
                                color: slotType === 'work' ? emp.color
                                  : slotType === 'interval' ? '#444441'
                                  : '#888780'
                              }}
                            >
                              {slotType === 'work' ? emp.name.split(' ')[0].substring(0, 4)
                                : slotType === 'interval' ? 'INT'
                                : 'F'}
                            </span>
                          )}
                        </td>
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
