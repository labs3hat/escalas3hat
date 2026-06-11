-- Sunday off tracking
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.sunday_off_tracking;
CREATE POLICY "authenticated_manage_sunday_off" ON public.sunday_off_tracking
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Freelancer slots
DROP POLICY IF EXISTS "freelancer_slots_select_all" ON public.freelancer_slots;
DROP POLICY IF EXISTS "freelancer_slots_insert_all" ON public.freelancer_slots;
DROP POLICY IF EXISTS "freelancer_slots_update_all" ON public.freelancer_slots;
DROP POLICY IF EXISTS "freelancer_slots_delete_all" ON public.freelancer_slots;

CREATE POLICY "freelancer_slots_select" ON public.freelancer_slots
FOR SELECT TO authenticated USING (true);

CREATE POLICY "freelancer_slots_insert" ON public.freelancer_slots
FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "freelancer_slots_update" ON public.freelancer_slots
FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "freelancer_slots_delete" ON public.freelancer_slots
FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);