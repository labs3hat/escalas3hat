export type StoreType = 'loja' | 'quiosque'
export type StoreRegion = 'curitiba' | 'maringa'
export type WorkRegime = '6x1' | '5x2'
export type UserRole = 'gerente' | 'regional' | 'diretoria' | 'rh'
export type ScheduleStatus = 'draft' | 'published' | 'frozen'
export type SlotType = 'work' | 'interval' | 'day_off' | 'empty'
export type ChangeType = 'shift_edit' | 'swap_request' | 'swap_approved' | 'swap_refused' | 'absence' | 'day_off_adjust' | 'publication'

export interface Store {
  id: string
  code: string
  name: string
  type: StoreType
  shopping: string
  city: string
  region: StoreRegion
  opening_time_weekday: string
  opening_time_saturday: string
  opening_time_sunday: string
  machine_wash_days: number[]
  stock_count_days: number[]
  closing_entry_5x2: string
  closing_exit_5x2: string
  closing_entry_6x1: string
  closing_exit_6x1: string
  min_opening_staff: number
  min_closing_staff: number
  min_weekday_staff: number
  min_weekend_staff: number
  min_sunday_staff: number
  min_sunday_off_per_month: number
  active: boolean
  created_at: string
}

export interface Employee {
  id: string
  store_id: string
  name: string
  role: string
  work_regime: WorkRegime
  fixed_day_off: number | null
  responsibilities: string[]
  color: string
  notes: string
  active: boolean
  created_at: string
}

export interface Profile {
  id: string
  email: string
  name: string
  role: UserRole
  store_ids: string[]
  created_at: string
}

export interface Schedule {
  id: string
  store_id: string
  week_start: string
  status: ScheduleStatus
  published_at: string | null
  published_by: string | null
  whatsapp_sent: boolean
  created_by: string | null
  created_at: string
}

export interface ScheduleSlot {
  id: string
  schedule_id: string
  employee_id: string
  day_of_week: number
  slot_time: string
  slot_type: SlotType
  updated_at: string
  updated_by: string | null
}

export interface ScheduleChange {
  id: string
  schedule_id: string | null
  employee_id: string
  store_id: string
  day_of_week: number
  changed_by: string | null
  changed_at: string
  reason: string
  old_entry_time: string | null
  new_entry_time: string | null
  old_exit_time: string | null
  new_exit_time: string | null
  old_break_start: string | null
  new_break_start: string | null
  old_slot_type: string | null
  new_slot_type: string | null
  ciencia_funcionario: boolean
  ciencia_at: string | null
  status: string
}

export interface ShiftTemplate {
  id: string
  store_id: string
  name: string
  regime: WorkRegime
  entry_time: string
  exit_time: string
  break_start: string
  break_end: string
  created_at: string
}

export interface RuleViolation {
  id: string
  schedule_id: string
  store_id: string
  rule_code: string
  severity: 'critical' | 'warning'
  day_of_week: number | null
  slot_time: string | null
  employee_ids: string[]
  message: string
  resolved: boolean
  created_at: string
}

// Grade helpers
export const SLOT_KEYS: string[] = []
for (let h = 8; h <= 22; h++) {
  SLOT_KEYS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 22) SLOT_KEYS.push(`${String(h).padStart(2, '0')}:30`)
}

export const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const DAY_NAMES_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export const EMPLOYEE_COLORS = [
  '#185FA5', '#0F6E56', '#854F0B', '#534AB7',
  '#993556', '#0E7490', '#6D28D9', '#B45309',
  '#065F46', '#7C3AED', '#B91C1C', '#0369A1',
]
