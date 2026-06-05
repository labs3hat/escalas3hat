ALTER TABLE public.freelancer_slots 
ADD COLUMN IF NOT EXISTS start_time TEXT,
ADD COLUMN IF NOT EXISTS end_time TEXT,
ADD COLUMN IF NOT EXISTS break_minutes INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT false;

-- Grant permissions (as required by instructions for public schema changes)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.freelancer_slots TO authenticated;
GRANT ALL ON public.freelancer_slots TO service_role;
