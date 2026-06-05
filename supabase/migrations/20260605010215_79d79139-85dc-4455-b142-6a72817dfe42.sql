-- First, drop all existing SELECT policies on stores to avoid conflicts
DROP POLICY IF EXISTS "stores_select" ON public.stores;
DROP POLICY IF EXISTS "stores_select_policy" ON public.stores;
DROP POLICY IF EXISTS "stores_read_policy" ON public.stores;

-- Create a single, clean SELECT policy for authenticated users
CREATE POLICY "stores_select_policy_v2" ON public.stores
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

-- Also update the UPDATE policy to be more consistent
DROP POLICY IF EXISTS "stores_update" ON public.stores;
CREATE POLICY "stores_update_policy_v2" ON public.stores
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (
      role IN ('diretoria', 'regional', 'rh')
      OR
      store_ids @> array[stores.id]::text[]
    )
  )
);

-- Ensure permissions are correctly granted
GRANT SELECT, UPDATE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
