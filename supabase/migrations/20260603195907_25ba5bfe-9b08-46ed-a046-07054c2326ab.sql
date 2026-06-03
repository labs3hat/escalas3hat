-- Add preferred_day_off if it doesn't exist (it seems it exists in types but let's be sure)
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS preferred_day_off INTEGER;

-- Ensure service_role has access to both tables for sync functions
GRANT ALL ON public.employees TO service_role;
GRANT ALL ON public.stores TO service_role;
