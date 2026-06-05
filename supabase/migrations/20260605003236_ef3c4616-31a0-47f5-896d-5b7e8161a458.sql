DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;

CREATE POLICY "profiles_select_allowed" ON public.profiles 
FOR SELECT TO authenticated 
USING (
  id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('diretoria', 'regional')
  )
);