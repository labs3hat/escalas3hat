export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      employees: {
        Row: {
          active: boolean
          allowed_shifts: string[] | null
          color: string
          created_at: string
          fixed_day_off: number | null
          id: string
          name: string
          notes: string
          preferred_shift: string | null
          responsibilities: string[]
          role: string
          store_id: string
          work_regime: Database["public"]["Enums"]["work_regime"]
        }
        Insert: {
          active?: boolean
          allowed_shifts?: string[] | null
          color?: string
          created_at?: string
          fixed_day_off?: number | null
          id?: string
          name: string
          notes?: string
          preferred_shift?: string | null
          responsibilities?: string[]
          role?: string
          store_id: string
          work_regime?: Database["public"]["Enums"]["work_regime"]
        }
        Update: {
          active?: boolean
          allowed_shifts?: string[] | null
          color?: string
          created_at?: string
          fixed_day_off?: number | null
          id?: string
          name?: string
          notes?: string
          preferred_shift?: string | null
          responsibilities?: string[]
          role?: string
          store_id?: string
          work_regime?: Database["public"]["Enums"]["work_regime"]
        }
        Relationships: [
          {
            foreignKeyName: "employees_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      freelancer_slots: {
        Row: {
          created_at: string
          day_of_week: number
          filled_at: string | null
          filled_by: string | null
          filled_by_user: string | null
          id: string
          rule_origin: string
          schedule_id: string
          shift_name: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          filled_at?: string | null
          filled_by?: string | null
          filled_by_user?: string | null
          id?: string
          rule_origin: string
          schedule_id: string
          shift_name: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          filled_at?: string | null
          filled_by?: string | null
          filled_by_user?: string | null
          id?: string
          rule_origin?: string
          schedule_id?: string
          shift_name?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "freelancer_slots_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_slots_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      hours_bank: {
        Row: {
          created_at: string
          employee_id: string
          extra_hours: number
          id: string
          scheduled_hours: number
          store_id: string
          updated_at: string
          week_start: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          extra_hours?: number
          id?: string
          scheduled_hours?: number
          store_id: string
          updated_at?: string
          week_start: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          extra_hours?: number
          id?: string
          scheduled_hours?: number
          store_id?: string
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "hours_bank_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hours_bank_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          role: Database["public"]["Enums"]["user_role"]
          store_ids: string[]
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name: string
          role?: Database["public"]["Enums"]["user_role"]
          store_ids?: string[]
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["user_role"]
          store_ids?: string[]
        }
        Relationships: []
      }
      rule_violations: {
        Row: {
          created_at: string
          day_of_week: number | null
          employee_ids: string[]
          id: string
          message: string
          resolved: boolean
          rule_code: string
          schedule_id: string
          severity: Database["public"]["Enums"]["severity_type"]
          slot_time: string | null
          store_id: string
        }
        Insert: {
          created_at?: string
          day_of_week?: number | null
          employee_ids?: string[]
          id?: string
          message: string
          resolved?: boolean
          rule_code: string
          schedule_id: string
          severity?: Database["public"]["Enums"]["severity_type"]
          slot_time?: string | null
          store_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number | null
          employee_ids?: string[]
          id?: string
          message?: string
          resolved?: boolean
          rule_code?: string
          schedule_id?: string
          severity?: Database["public"]["Enums"]["severity_type"]
          slot_time?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_violations_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_violations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_changes: {
        Row: {
          after_value: Json | null
          before_value: Json | null
          change_type: Database["public"]["Enums"]["change_type"]
          created_at: string
          created_by: string
          day_of_week: number | null
          employee_id: string | null
          employee_id_2: string | null
          id: string
          notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          schedule_id: string
          status: string
          store_id: string
        }
        Insert: {
          after_value?: Json | null
          before_value?: Json | null
          change_type: Database["public"]["Enums"]["change_type"]
          created_at?: string
          created_by: string
          day_of_week?: number | null
          employee_id?: string | null
          employee_id_2?: string | null
          id?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          schedule_id: string
          status?: string
          store_id: string
        }
        Update: {
          after_value?: Json | null
          before_value?: Json | null
          change_type?: Database["public"]["Enums"]["change_type"]
          created_at?: string
          created_by?: string
          day_of_week?: number | null
          employee_id?: string | null
          employee_id_2?: string | null
          id?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          schedule_id?: string
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_changes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_changes_employee_id_2_fkey"
            columns: ["employee_id_2"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_changes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_changes_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_changes_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_changes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_slots: {
        Row: {
          day_of_week: number
          employee_id: string
          id: string
          schedule_id: string
          slot_time: string
          slot_type: Database["public"]["Enums"]["slot_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          day_of_week: number
          employee_id: string
          id?: string
          schedule_id: string
          slot_time: string
          slot_type?: Database["public"]["Enums"]["slot_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          day_of_week?: number
          employee_id?: string
          id?: string
          schedule_id?: string
          slot_time?: string
          slot_type?: Database["public"]["Enums"]["slot_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_slots_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_slots_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_slots_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          published_by: string | null
          status: Database["public"]["Enums"]["schedule_status"]
          store_id: string
          week_start: string
          whatsapp_sent: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["schedule_status"]
          store_id: string
          week_start: string
          whatsapp_sent?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["schedule_status"]
          store_id?: string
          week_start?: string
          whatsapp_sent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_templates: {
        Row: {
          break_end: string
          break_start: string
          created_at: string
          entry_time: string
          exit_time: string
          id: string
          name: string
          regime: Database["public"]["Enums"]["work_regime"]
          store_id: string
        }
        Insert: {
          break_end: string
          break_start: string
          created_at?: string
          entry_time: string
          exit_time: string
          id?: string
          name: string
          regime: Database["public"]["Enums"]["work_regime"]
          store_id: string
        }
        Update: {
          break_end?: string
          break_start?: string
          created_at?: string
          entry_time?: string
          exit_time?: string
          id?: string
          name?: string
          regime?: Database["public"]["Enums"]["work_regime"]
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_templates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_rules: {
        Row: {
          active: boolean
          id: string
          rule_code: string
          store_id: string
          updated_at: string
          updated_by: string | null
          value_json: Json | null
        }
        Insert: {
          active?: boolean
          id?: string
          rule_code: string
          store_id: string
          updated_at?: string
          updated_by?: string | null
          value_json?: Json | null
        }
        Update: {
          active?: boolean
          id?: string
          rule_code?: string
          store_id?: string
          updated_at?: string
          updated_by?: string | null
          value_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "store_rules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          active: boolean
          city: string
          closing_entry_5x2: string
          closing_entry_6x1: string
          closing_exit_5x2: string
          closing_exit_6x1: string
          code: string
          created_at: string
          display_order: number | null
          id: string
          ideal_closing_staff: number
          ideal_opening_staff: number
          ideal_staff: number
          machine_wash_days: number[]
          min_closing_staff: number
          min_closing_weekend: number
          min_opening_staff: number
          min_opening_weekend: number
          min_sunday_off_per_month: number
          min_sunday_staff: number
          min_weekday_staff: number
          min_weekend_staff: number
          name: string
          opening_time_saturday: string
          opening_time_sunday: string
          opening_time_weekday: string
          region: Database["public"]["Enums"]["store_region"]
          shopping: string
          stock_count_days: number[]
          type: Database["public"]["Enums"]["store_type"]
        }
        Insert: {
          active?: boolean
          city: string
          closing_entry_5x2?: string
          closing_entry_6x1?: string
          closing_exit_5x2?: string
          closing_exit_6x1?: string
          code: string
          created_at?: string
          display_order?: number | null
          id?: string
          ideal_closing_staff?: number
          ideal_opening_staff?: number
          ideal_staff?: number
          machine_wash_days?: number[]
          min_closing_staff?: number
          min_closing_weekend?: number
          min_opening_staff?: number
          min_opening_weekend?: number
          min_sunday_off_per_month?: number
          min_sunday_staff?: number
          min_weekday_staff?: number
          min_weekend_staff?: number
          name: string
          opening_time_saturday?: string
          opening_time_sunday?: string
          opening_time_weekday?: string
          region: Database["public"]["Enums"]["store_region"]
          shopping: string
          stock_count_days?: number[]
          type: Database["public"]["Enums"]["store_type"]
        }
        Update: {
          active?: boolean
          city?: string
          closing_entry_5x2?: string
          closing_entry_6x1?: string
          closing_exit_5x2?: string
          closing_exit_6x1?: string
          code?: string
          created_at?: string
          display_order?: number | null
          id?: string
          ideal_closing_staff?: number
          ideal_opening_staff?: number
          ideal_staff?: number
          machine_wash_days?: number[]
          min_closing_staff?: number
          min_closing_weekend?: number
          min_opening_staff?: number
          min_opening_weekend?: number
          min_sunday_off_per_month?: number
          min_sunday_staff?: number
          min_weekday_staff?: number
          min_weekend_staff?: number
          name?: string
          opening_time_saturday?: string
          opening_time_sunday?: string
          opening_time_weekday?: string
          region?: Database["public"]["Enums"]["store_region"]
          shopping?: string
          stock_count_days?: number[]
          type?: Database["public"]["Enums"]["store_type"]
        }
        Relationships: []
      }
      sunday_off_tracking: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          month_year: string
          store_id: string
          sundays_off: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          month_year: string
          store_id: string
          sundays_off?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          month_year?: string
          store_id?: string
          sundays_off?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sunday_off_tracking_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sunday_off_tracking_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_base_schedule: {
        Args: {
          p_created_by?: string
          p_store_id: string
          p_week_start: string
        }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      my_store_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      change_type:
        | "shift_edit"
        | "swap_request"
        | "swap_approved"
        | "swap_refused"
        | "absence"
        | "day_off_adjust"
        | "publication"
      schedule_status: "draft" | "published" | "frozen"
      severity_type: "critical" | "warning"
      slot_type: "work" | "interval" | "day_off" | "empty"
      store_region: "curitiba" | "maringa"
      store_type: "loja" | "quiosque"
      user_role: "gerente" | "regional" | "diretoria" | "rh"
      work_regime: "6x1" | "5x2"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      change_type: [
        "shift_edit",
        "swap_request",
        "swap_approved",
        "swap_refused",
        "absence",
        "day_off_adjust",
        "publication",
      ],
      schedule_status: ["draft", "published", "frozen"],
      severity_type: ["critical", "warning"],
      slot_type: ["work", "interval", "day_off", "empty"],
      store_region: ["curitiba", "maringa"],
      store_type: ["loja", "quiosque"],
      user_role: ["gerente", "regional", "diretoria", "rh"],
      work_regime: ["6x1", "5x2"],
    },
  },
} as const
