ALTER TABLE public.hours_bank ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES public.schedules(id);
ALTER TABLE public.hours_bank DROP CONSTRAINT IF EXISTS hours_bank_schedule_id_employee_id_key;
ALTER TABLE public.hours_bank ADD CONSTRAINT hours_bank_schedule_id_employee_id_key UNIQUE (schedule_id, employee_id);