-- Optimize stores policies using the security definer functions
DROP POLICY IF EXISTS "stores_select_policy_v2" ON public.stores;

CREATE POLICY "stores_select_policy_v3" ON public.stores
FOR SELECT TO authenticated
USING (
  active = true AND (
    is_admin() 
    OR 
    (id)::text = ANY (my_store_ids())
  )
);

-- Update the UPDATE policy as well
DROP POLICY IF EXISTS "stores_update_policy_v2" ON public.stores;
CREATE POLICY "stores_update_policy_v3" ON public.stores
FOR UPDATE TO authenticated
USING (
  is_admin() 
  OR 
  (id)::text = ANY (my_store_ids())
);
