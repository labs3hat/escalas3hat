-- Update the profiles policy to avoid infinite recursion
-- We use a subquery that specifically avoids triggering the same policy if possible,
-- but the safest way in Supabase is to check against a fixed value or use a security definer function.

DROP POLICY IF EXISTS "profiles_select_allowed" ON public.profiles;

CREATE POLICY "profiles_select_policy_v2" ON public.profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid() 
  OR 
  is_admin() -- This function is SECURITY DEFINER, so it bypasses RLS on profiles safely
);

-- Ensure RH is included in the is_admin function (it already is, but let's be sure)
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
 AS $function$
  SELECT role IN ('regional','diretoria','rh') FROM public.profiles WHERE id = auth.uid();
$function$;
