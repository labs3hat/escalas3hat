-- Drop existing table if it exists to recreate it with the new schema
DROP TABLE IF EXISTS public.schedule_changes;

-- Create table for schedule changes
CREATE TABLE public.schedule_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID REFERENCES public.schedules(id) ON DELETE SET NULL,
    employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    reason TEXT NOT NULL,
    old_entry_time TIME,
    new_entry_time TIME,
    old_exit_time TIME,
    new_exit_time TIME,
    old_break_start TIME,
    new_break_start TIME,
    old_slot_type TEXT,
    new_slot_type TEXT,
    ciencia_funcionario BOOLEAN DEFAULT false,
    ciencia_at TIMESTAMPTZ,
    status TEXT DEFAULT 'approved'
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_changes TO authenticated;
GRANT ALL ON public.schedule_changes TO service_role;

-- Enable RLS
ALTER TABLE public.schedule_changes ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view schedule changes for their stores"
ON public.schedule_changes
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND (
            p.role IN ('regional', 'diretoria', 'rh')
            OR (store_id::text = ANY(p.store_ids))
            OR (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = schedule_changes.employee_id AND e.name = p.name))
        )
    )
);

CREATE POLICY "Managers and admins can insert schedule changes"
ON public.schedule_changes
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('gerente', 'regional', 'diretoria', 'rh')
    )
);

CREATE POLICY "Employees can update their own awareness"
ON public.schedule_changes
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.employees e ON e.id = schedule_changes.employee_id
        WHERE p.id = auth.uid()
        AND (p.name = e.name)
    )
)
WITH CHECK (
    TRUE
);

-- Index for performance
CREATE INDEX idx_schedule_changes_store_id ON public.schedule_changes(store_id);
CREATE INDEX idx_schedule_changes_employee_id ON public.schedule_changes(employee_id);
CREATE INDEX idx_schedule_changes_changed_at ON public.schedule_changes(changed_at);
