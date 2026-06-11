REVOKE EXECUTE ON FUNCTION public.my_store_ids() FROM public;
REVOKE EXECUTE ON FUNCTION public.my_store_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_store_ids() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_regional_overview(date, uuid[]) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_regional_overview(date, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_regional_overview(date, uuid[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.generate_monthly_schedule(uuid, date, jsonb, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.generate_monthly_schedule(uuid, date, jsonb, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_monthly_schedule(uuid, date, jsonb, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM public;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.generate_base_schedule(uuid, date, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.generate_base_schedule(uuid, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_base_schedule(uuid, date, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.generate_schedule_v2(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.generate_schedule_v2(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_schedule_v2(uuid) TO authenticated;