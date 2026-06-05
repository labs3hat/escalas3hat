-- Grant DELETE permission
GRANT DELETE ON public.freelancer_slots TO authenticated;
GRANT DELETE ON public.freelancer_slots TO service_role;

-- Add DELETE policy
CREATE POLICY "freelancer_slots_delete" ON public.freelancer_slots
FOR DELETE TO authenticated
USING (
  auth.uid() IN (
    SELECT profiles.id
    FROM profiles
    WHERE profiles.role = ANY (ARRAY['regional'::user_role, 'diretoria'::user_role, 'rh'::user_role, 'gerente'::user_role])
  )
);

-- Ensure UPDATE policy covers all necessary roles and has no conflicts
DROP POLICY IF EXISTS "freelancer_slots_update" ON public.freelancer_slots;
CREATE POLICY "freelancer_slots_update" ON public.freelancer_slots
FOR UPDATE TO authenticated
USING (
  auth.uid() IN (
    SELECT profiles.id
    FROM profiles
    WHERE profiles.role = ANY (ARRAY['regional'::user_role, 'diretoria'::user_role, 'rh'::user_role, 'gerente'::user_role])
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT profiles.id
    FROM profiles
    WHERE profiles.role = ANY (ARRAY['regional'::user_role, 'diretoria'::user_role, 'rh'::user_role, 'gerente'::user_role])
  )
);
