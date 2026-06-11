GRANT SELECT, INSERT, UPDATE, DELETE ON public.sunday_off_tracking TO authenticated;
GRANT ALL ON public.sunday_off_tracking TO service_role;

CREATE POLICY "Allow all for authenticated users" ON public.sunday_off_tracking
FOR ALL TO authenticated USING (true) WITH CHECK (true);