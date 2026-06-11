DROP POLICY IF EXISTS "authenticated_manage_sunday_off" ON public.sunday_off_tracking;
CREATE POLICY "authenticated_manage_sunday_off" ON public.sunday_off_tracking
FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);