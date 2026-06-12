import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Schedule, ScheduleSlot, SlotType, Employee, Store } from "@/types";
import { validateScheduleRules } from "@/utils/scheduleRules";
import { scheduleService } from "@/services/schedules";
import { formatters } from "@/lib/formatters";
import { handleSupabaseError } from "@/lib/errorHandler";

function normalizeSlot(slot: ScheduleSlot): ScheduleSlot {
  return { ...slot, slot_time: formatters.time(slot.slot_time) };
}

export function useSchedule(storeId: string | null, weekStart: Date, store?: Store) {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const subscriptionId = useMemo(() => Math.random().toString(36).substring(7), []);
  const [loading, setLoading] = useState(true);
  const weekKey = format(weekStart, "yyyy-MM-dd");
  const loadSeq = useRef(0);

  const load = useCallback(
    async (forceScheduleId?: string) => {
      if (!storeId) {
        setLoading(false);
        return;
      }
      const seq = ++loadSeq.current;
      setLoading(true);

      try {
        let sched: Schedule | null = null;

        if (forceScheduleId) {
          const { data: forcedSched, error } = await supabase
            .from("schedules")
            .select("*")
            .eq("id", forceScheduleId)
            .single();
          if (error) throw error;
          sched = forcedSched as Schedule;
        }

        if (!sched) {
          sched = await scheduleService.getByStoreAndWeek(storeId, weekKey);
        }

        if (!sched) {
          const { data: { user } } = await supabase.auth.getUser();
          sched = await scheduleService.create(storeId, weekKey, user?.id);
        }

        if (seq !== loadSeq.current) return;
        setSchedule(sched);

        if (sched) {
          const slotData = await scheduleService.getSlots(sched.id);
          if (seq !== loadSeq.current) return;
          setSlots(slotData.map(normalizeSlot));
        } else {
          setSlots([]);
        }
      } catch (err: any) {
        handleSupabaseError(err, "Erro ao carregar escala");
        // Se falhar ao carregar/criar a escala, não podemos continuar
        if (err.message?.includes("multiple rows") || err.message?.includes("PGRST116")) {
          toast.error("Erro crítico: Foram encontradas múltiplas escalas para esta semana. Por favor, contate o suporte.");
        }
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    },
    [storeId, weekKey],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!schedule?.id) return;
    const channel = supabase
      .channel(`schedule-slots-${schedule.id}-${subscriptionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "schedule_slots",
          filter: `schedule_id=eq.${schedule.id}`,
        },
        () => {
          load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [schedule?.id, load, subscriptionId]);

  async function updateSlot(
    employeeId: string,
    dayOfWeek: number,
    slotTime: string,
    slotType: string,
  ) {
    if (!schedule) return;
    const typedSlotType = slotType as SlotType;
    const { data: { user } } = await supabase.auth.getUser();
    const normalizedTime = formatters.time(slotTime);

    const existing = slots.find(
      (s) => s.employee_id === employeeId && s.day_of_week === dayOfWeek && s.slot_time === normalizedTime,
    );

    try {
      if (existing) {
        if (typedSlotType === 'empty') {
          await supabase.from("schedule_slots").delete().eq("id", existing.id);
          setSlots((prev) => prev.filter((s) => s.id !== existing.id));
        } else {
          await supabase
            .from("schedule_slots")
            .update({
              slot_type: typedSlotType,
              updated_by: user?.id,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
          setSlots((prev) =>
            prev.map((s) => (s.id === existing.id ? { ...s, slot_type: typedSlotType } : s)),
          );
        }
      } else if (typedSlotType !== 'empty') {
        const { data: newSlot, error } = await supabase
          .from("schedule_slots")
          .insert({
            schedule_id: schedule.id,
            employee_id: employeeId,
            day_of_week: dayOfWeek,
            slot_time: normalizedTime,
            slot_type: typedSlotType,
            updated_by: user?.id,
          })
          .select()
          .single();
        if (error) throw error;
        if (newSlot) setSlots((prev) => [...prev, normalizeSlot(newSlot as ScheduleSlot)]);
      }
    } catch (err) {
      handleSupabaseError(err, "Erro ao atualizar slot");
    }
  }

  async function updateDay(
    employeeId: string,
    dayOfWeek: number,
    dayType: "work" | "day_off" | "empty",
    payload?: { entry: string; exit: string; breakStart?: string; breakEnd?: string },
  ) {
    if (!schedule) return;
    const { data: { user } } = await supabase.auth.getUser();

    try {
      await scheduleService.deleteSlots(schedule.id, employeeId, dayOfWeek);

      const toInsert: any[] = [];

      if (dayType === "day_off") {
        toInsert.push({
          schedule_id: schedule.id,
          employee_id: employeeId,
          day_of_week: dayOfWeek,
          slot_time: "08:00",
          slot_type: "day_off",
          updated_by: user?.id,
        });
      } else if (dayType === "work" && payload) {
        const toMin = (s: string) => {
          const [h, m] = s.split(":").map(Number);
          return h * 60 + m;
        };
        const fmt = (mins: number) =>
          `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

        const entryM = toMin(payload.entry);
        const exitM = toMin(payload.exit);
        const bStart = payload.breakStart ? toMin(payload.breakStart) : null;
        const bEnd = payload.breakEnd ? toMin(payload.breakEnd) : null;

        const startAligned = entryM - (entryM % 30);
        for (let t = startAligned; t < exitM; t += 30) {
          const inBreak = bStart !== null && bEnd !== null && t >= bStart && t < bEnd;
          toInsert.push({
            schedule_id: schedule.id,
            employee_id: employeeId,
            day_of_week: dayOfWeek,
            slot_time: fmt(t),
            slot_type: inBreak ? "interval" : "work",
            updated_by: user?.id,
          });
        }
      }

      if (toInsert.length > 0) {
        await scheduleService.insertSlots(toInsert);
      }

      await load();
    } catch (err) {
      handleSupabaseError(err, "Erro ao atualizar dia");
    }
  }

  async function publish() {
    if (!schedule) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      await scheduleService.publish(schedule.id, user.id);
      setSchedule((prev) => (prev ? { ...prev, status: "published" } : prev));
    } catch (err) {
      handleSupabaseError(err, "Erro ao publicar escala");
    }
  }


  function getSlot(employeeId: string, dayOfWeek: number, slotTime: string): string {
    return (
      slots.find(
        (s) => s.employee_id === employeeId && s.day_of_week === dayOfWeek && s.slot_time === slotTime,
      )?.slot_type ?? "empty"
    );
  }

  function validate(employees: Employee[], newChange?: any) {
    return validateScheduleRules(employees, slots, store, newChange);
  }

  return { 
    schedule, 
    slots, 
    loading, 
    updateSlot, 
    updateDay, 
    publish, 
     
    getSlot, 
    reload: load,
    validate
  };
}

