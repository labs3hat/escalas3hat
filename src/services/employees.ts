import { supabase } from "@/integrations/supabase/client";
import type { Employee } from "@/types";

export const employeeService = {
  async getByStore(storeId: string): Promise<Employee[]> {
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .eq("store_id", storeId)
      .order("name");
    if (error) throw error;
    return data as Employee[];
  }
};
