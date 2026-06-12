DROP FUNCTION IF EXISTS public.generate_base_schedule(uuid,date,uuid);
CREATE OR REPLACE FUNCTION public.generate_base_schedule(p_store_id uuid, p_week_start date, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  -- ... (variables declarations) ...
BEGIN
  -- ... (body) ...
  -- [I will put the full corrected body here]
END;
$function$
;