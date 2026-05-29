-- 1) Tabela monthly_sunday_off
CREATE TABLE public.monthly_sunday_off (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  month_year TEXT NOT NULL,
  sunday_date DATE NOT NULL,
  locked BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (store_id, employee_id, month_year)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_sunday_off TO authenticated;
GRANT ALL ON public.monthly_sunday_off TO service_role;

ALTER TABLE public.monthly_sunday_off ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View monthly sunday off"
ON public.monthly_sunday_off
FOR SELECT
USING (public.is_admin() OR store_id::text = ANY(public.my_store_ids()));

CREATE POLICY "Insert monthly sunday off"
ON public.monthly_sunday_off
FOR INSERT
WITH CHECK (public.is_admin() OR store_id::text = ANY(public.my_store_ids()));

CREATE POLICY "Update monthly sunday off"
ON public.monthly_sunday_off
FOR UPDATE
USING (public.is_admin() OR store_id::text = ANY(public.my_store_ids()));

CREATE POLICY "Delete monthly sunday off"
ON public.monthly_sunday_off
FOR DELETE
USING (public.is_admin() OR store_id::text = ANY(public.my_store_ids()));

CREATE TRIGGER update_monthly_sunday_off_updated_at
BEFORE UPDATE ON public.monthly_sunday_off
FOR EACH ROW
EXECUTE FUNCTION public.update_freelancer_slots_updated_at();

-- 2) generate_monthly_schedule
CREATE OR REPLACE FUNCTION public.generate_monthly_schedule(
  p_store_id uuid,
  p_month_start date,
  p_assignments jsonb DEFAULT NULL::jsonb,
  p_created_by uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_month_year  TEXT;
  v_assignment  JSONB;
  v_month_start DATE;
  v_month_end   DATE;
  v_week_start  DATE;
  v_weeks       INT := 0;
  v_slots       INT := 0;
  v_res         JSONB;
BEGIN
  v_month_start := DATE_TRUNC('month', p_month_start)::DATE;
  v_month_end   := (DATE_TRUNC('month', p_month_start) + INTERVAL '1 month - 1 day')::DATE;
  v_month_year  := TO_CHAR(v_month_start, 'YYYY-MM');

  -- Salvar domingos de folga fixos do mês
  IF p_assignments IS NOT NULL THEN
    FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_assignments) LOOP
      IF (v_assignment->>'sunday_date') IS NOT NULL THEN
        INSERT INTO monthly_sunday_off
          (store_id, employee_id, month_year, sunday_date, created_by)
        VALUES (
          p_store_id,
          (v_assignment->>'employee_id')::uuid,
          v_month_year,
          (v_assignment->>'sunday_date')::date,
          p_created_by
        )
        ON CONFLICT (store_id, employee_id, month_year)
        DO UPDATE SET sunday_date = EXCLUDED.sunday_date, updated_at = NOW();
      END IF;
    END LOOP;
  END IF;

  -- Primeira segunda-feira que cobre o início do mês
  v_week_start := (v_month_start - (((EXTRACT(DOW FROM v_month_start)::int + 6) % 7)))::DATE;

  WHILE v_week_start <= v_month_end LOOP
    v_res := generate_base_schedule(p_store_id, v_week_start, p_created_by);
    IF COALESCE((v_res->>'success')::boolean, false) THEN
      v_weeks := v_weeks + 1;
      v_slots := v_slots + COALESCE((v_res->>'slots_created')::int, 0);
    END IF;
    v_week_start := v_week_start + 7;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'weeks_generated', v_weeks,
    'slots_created', v_slots
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'detail', SQLSTATE);
END;
$function$;