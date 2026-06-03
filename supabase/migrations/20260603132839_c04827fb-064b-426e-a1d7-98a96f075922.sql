-- Remove insecure name-based identity matching on schedule_changes.

-- 1. Drop the always-true / name-matched UPDATE policy (awareness updates are
--    not performed by employees in the app; only managers/admins write records).
DROP POLICY IF EXISTS "Employees can update their own awareness" ON public.schedule_changes;

-- 2. Replace SELECT policy: drop the name-matching branch, keep store + admin access.
DROP POLICY IF EXISTS "Users can view schedule changes for their stores" ON public.schedule_changes;
CREATE POLICY "Users can view schedule changes for their stores"
ON public.schedule_changes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = ANY (ARRAY['regional'::user_role, 'diretoria'::user_role, 'rh'::user_role])
        OR (schedule_changes.store_id)::text = ANY (p.store_ids)
      )
  )
);