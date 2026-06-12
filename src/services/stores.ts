import { supabase } from "@/integrations/supabase/client";
import type { Store } from "@/types";

export const storeService = {
  async getAll(): Promise<Store[]> {
    const { data, error } = await supabase
      .from("stores")
      .select("*")
      .order("code");
    if (error) throw error;
    return data as Store[];
  },

  async getById(id: string): Promise<Store> {
    const { data, error } = await supabase
      .from("stores")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data as Store;
  }
};
