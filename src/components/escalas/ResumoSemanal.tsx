import { useState } from 'react'
import { DAY_NAMES, SLOT_KEYS, type Employee, type Store } from '@/types'
import SlotModal, { type DayPayload } from './SlotModal'

import { type FreelancerSlot } from './FreelancerSlots';

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
  freelancerSlots?: FreelancerSlot[]
}

const TODAY = new Date()

export default function ResumoSemanal({ employees, weekDates, getSlot, updateDay, store, isPublished, freelancerSlots = [] }: Props) {
  const [modal, setModal] = useState<{
    emp: Employee; dow: number; date: Date; initial: DayPayload
  } | null>(null)

  function buildDayPayload(emp: Employee, dow: number): DayPayload {
    const work = SLOT_KEYS.filter(s => getSlot(emp.id, dow, s) === 'work')
    const intv = SLOT_KEYS.filter(s => getSlot(emp.id, dow, s) === 'interval')
    const off  = SLOT_KEYS.some(s => getSlot(emp.id, dow, s) === 'day_off')
    if (work.length === 0 && intv.length === 0) {
      return { type: off ? 'day_off' : 'empty' }
    }
    const all = [...work, ...intv].sort()
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

  function getDayData(emp: Employee, dow: number) {
    const workSlots = SLOT_KEYS.filter(s => getSlot(emp.id, dow, s) === 'work')
    const intervalSlots = SLOT_KEYS.filter(s => getSlot(emp.id, dow, s) === 'interval').sort()
    const isFolga = SLOT_KEYS.some(s => getSlot(emp.id, dow, s) === 'day_off') && workSlots.length === 0
    const hasIntConflict = checkIntervalConflict(dow)

    if (isFolga) return { type: 'folga' as const }
    if (workSlots.length === 0) return { type: 'empty' as const }

    const entry = workSlots[0]
    const [eh, em] = entry.split(':').map(Number)
    const entryTotal = eh * 60 + em
    
    // Heurística de saída baseada em quem entra
    const lastWork = workSlots[workSlots.length - 1]
    const [lh, lm] = lastWork.split(':').map(Number)
    const exitTotal = lh * 60 + lm + 30

    const netMin = workSlots.length * 30
    let hrs = `${Math.floor(netMin / 60)}h${netMin % 60 ? String(netMin % 60).padStart(2,'0') : ''}`
    
    // Ajuste visual para exibir a jornada contratual correta para turnos cheios (44h semanais)
    // No sistema de slots de 30min, 6x1 usa 15 slots (7h30) e 5x2 usa 18 slots (9h)
    if (emp.work_regime === '6x1' && workSlots.length === 15) {
      hrs = '7h20'
    } else if (emp.work_regime === '5x2' && workSlots.length === 18) {
      hrs = '8h48'
    }
    const xh = Math.floor(exitTotal / 60)
    const xm = exitTotal % 60
    const fmt = (h: number, m: number) => `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`

    let intervalLabel: string | null = null
    if (intervalSlots.length > 0) {
      const first = intervalSlots[0]
      const last = intervalSlots[intervalSlots.length - 1]
      const [lih, lim] = last.split(':').map(Number)
      const endTotal = lih * 60 + lim + 30
      intervalLabel = `${first} – ${fmt(Math.floor(endTotal / 60), endTotal % 60)}`
    }

    return {
      type: 'work' as const,
      entry: fmt(eh, em),
      exit: fmt(xh, xm),
      hrs,
      intervalLabel,
      hasIntervalConflict: intervalSlots.some(s => hasIntConflict(s)),
    }
  }

  function checkIntervalConflict(dow: number) {
    return (slot: string) => {
      const onInterval = employees.filter(e => getSlot(e.id, dow, slot) === 'interval')
      return onInterval.length >= 2
    }
  }

  // Ordena por horário de entrada do dia: quem entra antes aparece primeiro.
  // Folga/sem escala vão para o final.
  function entryRank(emp: Employee, dow: number): number {
    const workSlots = SLOT_KEYS.filter(s => getSlot(emp.id, dow, s) === 'work').sort()
    if (workSlots.length === 0) return Number.MAX_SAFE_INTEGER
    const [h, m] = workSlots[0].split(':').map(Number)
    return h * 60 + m
  }

  function getSortedDayEntities(dow: number) {
    const empData = employees.map(emp => ({
      type: 'employee' as const,
      id: emp.id,
      name: emp.name,
      color: emp.color,
      rank: entryRank(emp, dow),
      data: getDayData(emp, dow),
      original: emp
    }));

    const freeData = (freelancerSlots || [])
      .filter(s => s.day_of_week === dow && s.filled_by)
      .map(s => {
        const [h, m] = (s.start_time || '00:00').split(':').map(Number);
        return {
          type: 'freelancer' as const,
          id: s.id,
          name: s.filled_by!,
          color: '#F59E0B', // Amber 500
          rank: h * 60 + m,
          data: {
            type: 'work' as const,
            entry: s.start_time || '--:--',
            exit: s.end_time || '--:--',
            hrs: s.shift_name,
            intervalLabel: null,
            hasIntervalConflict: false
          },
          original: s
        };
      });

    // Filtra funcionários sem dados (sem escala) se necessário, ou mantém todos
    const entities = [...empData, ...freeData].filter(e => e.data.type !== 'empty');

    return entities.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.name.localeCompare(b.name);
    });
  }

  return (
    <div className="h-full flex flex-col p-2 overflow-hidden">
      <div className="grid grid-cols-7 gap-1 flex-1 min-h-0">
        {weekDates.map((d, di) => {
          const dow = d.getDay()
          const isToday = d.toDateString() === TODAY.toDateString()
          const isWknd = dow === 0 || dow === 6
          
          const abEmpCount = employees.filter(e => getSlot(e.id, dow, store.opening_time_weekday ?? '10:00') === 'work').length
          const fcEmpCount = employees.filter(e => getSlot(e.id, dow, '22:00') === 'work').length
          
          const abSlot = store.opening_time_weekday || '10:00'
          const fcSlot = '22:00'
          const abFreeCount = freelancerSlots.filter(s => {
            if (s.day_of_week !== dow || !s.filled_by) return false;
            if (s.start_time) return s.start_time <= abSlot;
            return s.shift_name === 'Abertura';
          }).length;
          const fcFreeCount = freelancerSlots.filter(s => {
            if (s.day_of_week !== dow || !s.filled_by) return false;
            if (s.end_time) return s.end_time >= fcSlot;
            return s.shift_name === 'Fechamento';
          }).length;

          const abCount = abEmpCount + abFreeCount
          const fcCount = fcEmpCount + fcFreeCount
          const fcOk = fcCount >= (store.min_closing_staff ?? 2)

          
          // Considerar freelancers no resumo
          // Precisamos dos slots de freelancer passados via props
          // Mas como não estão nas props, vamos adicionar ou usar via hook se necessário.
          // Por enquanto, vamos deixar marcado para o EscalasClient passar.


          return (
            <div
              key={di}
              className={`border rounded-lg overflow-hidden flex flex-col min-h-0 ${
                isToday ? 'border-brand-300' : 'border-gray-200'
              }`}
            >
              <div className={`px-1.5 py-1 border-b flex-shrink-0 ${
                isToday ? 'bg-brand-50 border-brand-200' : isWknd ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-100'
              }`}>
                <div className={`text-[10px] font-medium leading-tight ${isToday ? 'text-brand-600' : 'text-gray-400'}`}>
                  {DAY_NAMES[dow]}
                </div>
                <div className={`text-xs font-semibold leading-tight ${isToday ? 'text-brand-700' : 'text-gray-800'}`}>
                  {d.getDate()}/{String(d.getMonth()+1).padStart(2,'0')}
                </div>
              </div>

              <div className="flex-1 overflow-auto">
                {getSortedDayEntities(dow).map(item => {
                  if (item.type === 'freelancer') {
                    return (
                      <div key={item.id} className="px-1.5 py-1 border-b border-gray-100 bg-amber-50/40">
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] font-bold truncate leading-tight text-amber-700">
                            {item.name.split(' ')[0]}
                          </div>
                          <span className="text-[7px] bg-amber-100 text-amber-700 px-1 rounded font-bold">FREE</span>
                        </div>
                        <div className="text-[10px] text-amber-600 font-medium">
                          {item.data.entry}–{item.data.exit}
                        </div>
                        <div className="text-[9px] text-amber-500/80 leading-tight">
                          {item.data.hrs}
                        </div>
                      </div>
                    )
                  }

                  const emp = item.original as Employee
                  const data = item.data
                  return (
                    <div
                      key={emp.id}
                      onClick={() => setModal({ emp, dow, date: d, initial: buildDayPayload(emp, dow) })}
                      className={`px-1.5 py-1 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-brand-50/60 ${
                        data.type === 'folga' ? 'bg-gray-50' :
                        data.type === 'work' && data.hasIntervalConflict ? 'bg-red-50' : ''
                      }`}
                    >
                      <div className="text-[11px] font-bold truncate leading-tight" style={{ color: emp.color }}>
                        {emp.name.split(' ')[0]}
                      </div>
                      {data.type === 'folga' && (
                        <span className="inline-block text-[9px] bg-gray-200 text-gray-600 px-1 rounded mt-0.5">Folga</span>
                      )}
                      {data.type === 'work' && (
                        <>
                          <div className="text-[10px] text-gray-600 leading-tight">
                            {data.entry}–{data.exit} · {data.hrs}
                          </div>
                          {data.intervalLabel && (
                            <div className="text-[10px] text-muted-foreground leading-tight">
                              Int: {data.intervalLabel}
                            </div>
                          )}
                        </>
                      )}
                      {data.type === 'empty' && (
                        <div className="text-[10px] text-gray-300">—</div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="px-1.5 py-1 bg-gray-50 border-t border-gray-100 flex justify-between flex-shrink-0">
                <span className="text-[9px] text-gray-400">Ab:{abCount}</span>
                <span className={`text-[9px] font-medium ${fcOk ? 'text-brand-600' : 'text-red-600'}`}>
                  Fc:{fcCount}{fcOk ? '✓' : '⚠'}
                </span>
              </div>
            </div>
          )
        })}
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
    </div>
  )
}
