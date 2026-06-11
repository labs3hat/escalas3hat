ALTER FUNCTION public.my_store_ids() SET search_path = public;
ALTER FUNCTION public.get_regional_overview(date, uuid[]) SET search_path = public;
ALTER FUNCTION public.generate_monthly_schedule(uuid, date, jsonb, uuid) SET search_path = public;
ALTER FUNCTION public.is_admin() SET search_path = public;
ALTER FUNCTION public.generate_base_schedule(uuid, date, uuid) SET search_path = public;
ALTER FUNCTION public.generate_schedule_v2(uuid) SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
-- handle_new_user usually runs as service_role for triggers
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;