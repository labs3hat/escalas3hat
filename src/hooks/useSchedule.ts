import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { format, startOfWeek } from 'date-fns'
import type { Schedule, ScheduleSlot } from '@/types'

export function useSchedule(storeId: string | null, weekStart: Date) {
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [loading, setLoading] = useState(true)
  const weekKey = format(weekStart, 'yyyy-MM-dd')

  const load = useCallback(async () => {
    if (!storeId) { setLoading(false); return }
    setLoading(true)

    // busca ou cria a escala da semana
    let { data: sched } = await supabase
      .from('schedules')
      .select('*')
      .eq('store_id', storeId)
      .eq('week_start', weekKey)
      .single()

    if (!sched) {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: newSched } = await supabase
        .from('schedules')
        .insert({ store_id: storeId, week_start: weekKey, status: 'draft', created_by: user?.id })
        .select()
        .single()
      sched = newSched
    }

    setSchedule(sched)

    if (sched) {
      const { data: slotData } = await supabase
        .from('schedule_slots')
        .select('*')
        .eq('schedule_id', sched.id)
      setSlots(slotData ?? [])
    }

    setLoading(false)
  }, [storeId, weekKey])

  useEffect(() => { load() }, [load])

  async function updateSlot(
    employeeId: string,
    dayOfWeek: number,
    slotTime: string,
    slotType: string
  ) {
    if (!schedule) return
    const { data: { user } } = await supabase.auth.getUser()

    const existing = slots.find(
      s => s.employee_id === employeeId &&
           s.day_of_week === dayOfWeek &&
           s.slot_time === slotTime
    )

    if (existing) {
      await supabase.from('schedule_slots')
        .update({ slot_type: slotType, updated_by: user?.id, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      setSlots((prev: ScheduleSlot[]) => prev.map((s: ScheduleSlot) => s.id === existing.id ? { ...s, slot_type: slotType as any } : s))
    } else {
      const { data: newSlot } = await supabase.from('schedule_slots')
        .insert({
          schedule_id: schedule.id,
          employee_id: employeeId,
          day_of_week: dayOfWeek,
          slot_time: slotTime,
          slot_type: slotType,
          updated_by: user?.id,
        })
        .select()
        .single()
      if (newSlot) setSlots(prev => [...prev, newSlot])
    }
  }

  async function publish() {
    if (!schedule) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('schedules')
      .update({ status: 'published', published_at: new Date().toISOString(), published_by: user?.id })
      .eq('id', schedule.id)
    setSchedule(prev => prev ? { ...prev, status: 'published' } : prev)

    // registrar no histórico
    await supabase.from('schedule_changes').insert({
      schedule_id: schedule.id,
      store_id: storeId,
      change_type: 'publication',
      created_by: user?.id,
      notes: `Escala publicada para a semana de ${weekKey}`,
    })
  }

  async function copyPreviousWeek(employees: { id: string }[]) {
    if (!schedule || !storeId) return
    const prevWeek = new Date(weekStart)
    prevWeek.setDate(prevWeek.getDate() - 7)
    const prevKey = format(prevWeek, 'yyyy-MM-dd')

    const { data: prevSched } = await supabase
      .from('schedules').select('id').eq('store_id', storeId).eq('week_start', prevKey).single()
    if (!prevSched) return

    const { data: prevSlots } = await supabase
      .from('schedule_slots').select('*').eq('schedule_id', prevSched.id)
    if (!prevSlots?.length) return

    const { data: { user } } = await supabase.auth.getUser()
    const newSlots = prevSlots.map(s => ({
      schedule_id: schedule.id,
      employee_id: s.employee_id,
      day_of_week: s.day_of_week,
      slot_time: s.slot_time,
      slot_type: s.slot_type,
      updated_by: user?.id,
    }))

    // upsert para não duplicar
    await supabase.from('schedule_slots').upsert(newSlots, {
      onConflict: 'schedule_id,employee_id,day_of_week,slot_time'
    })

    await load()
  }

  function getSlot(employeeId: string, dayOfWeek: number, slotTime: string): string {
    return slots.find(
      s => s.employee_id === employeeId &&
           s.day_of_week === dayOfWeek &&
           s.slot_time === slotTime
    )?.slot_type ?? 'empty'
  }

  return { schedule, slots, loading, updateSlot, publish, copyPreviousWeek, getSlot, reload: load }
}
