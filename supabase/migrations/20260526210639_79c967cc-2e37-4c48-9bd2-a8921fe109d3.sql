GRANT SELECT ON public.hours_bank TO authenticated;
GRANT ALL ON public.hours_bank TO service_role;

CREATE POLICY "hours_bank_select"
ON public.hours_bank
FOR SELECT
TO authenticated
USING (is_admin() OR (store_id::text = ANY (my_store_ids())));