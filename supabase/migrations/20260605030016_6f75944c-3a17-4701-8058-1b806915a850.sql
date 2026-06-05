-- Drop existing restrictive policies
DROP POLICY IF EXISTS "freelancer_slots_select" ON public.freelancer_slots;
DROP POLICY IF EXISTS "freelancer_slots_insert" ON public.freelancer_slots;
DROP POLICY IF EXISTS "freelancer_slots_update" ON public.freelancer_slots;
DROP POLICY IF EXISTS "freelancer_slots_delete" ON public.freelancer_slots;

-- Create simpler policies for authenticated users
CREATE POLICY "freelancer_slots_select_all" ON public.freelancer_slots
FOR SELECT TO authenticated USING (true);

CREATE POLICY "freelancer_slots_insert_all" ON public.freelancer_slots
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "freelancer_slots_update_all" ON public.freelancer_slots
FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "freelancer_slots_delete_all" ON public.freelancer_slots
FOR DELETE TO authenticated USING (true);
