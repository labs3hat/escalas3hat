import { supabase } from "@/integrations/supabase/client";
import type { Schedule, ScheduleSlot, SlotType } from "@/types";

export const scheduleService = {
  async getByStoreAndWeek(storeId: string, weekKey: string): Promise<Schedule | null> {
    const { data, error } = await supabase
      .from("schedules")
      .select("*")
      .eq("store_id", storeId)
      .eq("week_start", weekKey)
      .order("created_at", { ascending: false })
      .limit(1);
    
    if (error) throw error;
    return data?.[0] as Schedule || null;
  },

  async create(storeId: string, weekKey: string, userId?: string): Promise<Schedule> {
    const { data, error } = await supabase
      .from("schedules")
      .insert({ 
        store_id: storeId, 
        week_start: weekKey, 
        status: "draft", 
        created_by: userId 
      })
      .select()
      .single();
    
    if (error) throw error;
    return data as Schedule;
  },

  async getSlots(scheduleId: string): Promise<ScheduleSlot[]> {
    const { data, error } = await supabase
      .from("schedule_slots")
      .select("*")
      .eq("schedule_id", scheduleId);
    
    if (error) throw error;
    return (data || []) as ScheduleSlot[];
  },

  async deleteSlots(scheduleId: string, employeeId: string, dayOfWeek: number) {
    const { error } = await supabase
      .from("schedule_slots")
      .delete()
      .eq("schedule_id", scheduleId)
      .eq("employee_id", employeeId)
      .eq("day_of_week", dayOfWeek);
    
    if (error) throw error;
  },

  async insertSlots(slots: any[]) {
    const { error } = await supabase
      .from("schedule_slots")
      .upsert(slots, { onConflict: "schedule_id,employee_id,day_of_week,slot_time" });
    
    if (error) throw error;
  },

  async publish(scheduleId: string, userId: string) {
    const { error } = await supabase
      .from("schedules")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        published_by: userId,
      })
      .eq("id", scheduleId);
    
    if (error) throw error;
  }
};
