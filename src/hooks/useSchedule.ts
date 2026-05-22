import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { format, startOfWeek } from 'date-fns'
import type { Schedule, ScheduleSlot } from '@/types'

export function useSchedule(storeId: string | null, weekStart: Date) {
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [loading, setLoading] = useState(true)
  const weekKey = format(weekStart, 'yyyy-MM-dd')
  const scheduleIdRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    if (!storeId) { setLoading(false); return }
    setLoading(true)

    // busca a escala mais recente da semana (tolera duplicatas)
    let { data: schedList } = await supabase
      .from('schedules')
      .select('*')
      .eq('store_id', storeId)
      .eq('week_start', weekKey)
      .order('created_at', { ascending: false })
      .limit(1)

    let sched = schedList?.[0] ?? null

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
    scheduleIdRef.current = sched?.id ?? null

    if (sched) {
      const { data: slotData } = await supabase
        .from('schedule_slots')
        .select('*')
        .eq('schedule_id', sched.id)
      setSlots((slotData ?? []) as any)
    } else {
      setSlots([])
    }

    setLoading(false)
  }, [storeId, weekKey])

  useEffect(() => { load() }, [load])

  // Realtime: recarrega quando schedule_slots mudar para a escala atual
  useEffect(() => {
    if (!schedule?.id) return
    const channel = supabase
      .channel(`schedule-slots-${schedule.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'schedule_slots', filter: `schedule_id=eq.${schedule.id}` },
        () => { load() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [schedule?.id, load])

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
        .update({ slot_type: slotType as any, updated_by: user?.id, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      setSlots((prev) => prev.map((s) => s.id === existing.id ? { ...s, slot_type: slotType as any } : s))
    } else {
      const { data: newSlot } = await supabase.from('schedule_slots')
        .insert({
          schedule_id: schedule.id,
          employee_id: employeeId,
          day_of_week: dayOfWeek,
          slot_time: slotTime,
          slot_type: slotType as any,
          updated_by: user?.id,
        })
        .select()
        .single()
      if (newSlot) setSlots(prev => [...prev, newSlot as any])
    }
  }

  async function publish() {
    if (!schedule) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('schedules')
      .update({ status: 'published', published_at: new Date().toISOString(), published_by: user?.id })
      .eq('id', schedule.id)
    setSchedule(prev => prev ? { ...prev, status: 'published' } : prev)

    await supabase.from('schedule_changes').insert({
      schedule_id: schedule.id,
      store_id: storeId as string,
      change_type: 'publication',
      created_by: user?.id as string,
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
