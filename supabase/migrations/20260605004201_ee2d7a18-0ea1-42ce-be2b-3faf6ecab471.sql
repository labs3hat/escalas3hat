DROP POLICY IF EXISTS "stores_select_policy" ON public.stores;

CREATE POLICY "stores_select_policy" ON public.stores
FOR SELECT TO authenticated
USING (
  active = true AND (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND (
        role IN ('diretoria', 'regional', 'rh')
        OR
        store_ids @> array[stores.id]::text[]
      )
    )
  )
);