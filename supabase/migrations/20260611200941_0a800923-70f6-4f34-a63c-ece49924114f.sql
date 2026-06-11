CREATE OR REPLACE FUNCTION public.generate_base_schedule(p_store_id uuid, p_week_start date, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_schedule_id         UUID;
  v_store               RECORD;
  v_emp                 RECORD;
  v_day                 INT;
  v_slot_time           TIME;
  v_slot_type           slot_type;
  v_month_year          TEXT;
  v_slots_created       INT := 0;
  v_sunday_dates        DATE[];
  v_sunday_count        INT;
  v_total_emps          INT;
  v_month_start         DATE;
  v_month_end           DATE;
  v_d                   DATE;
  v_emp_idx             INT;
  v_folga_day           INT;
  v_folga_sunday        DATE;
  v_fixed_sunday        DATE;
  v_shift_name          TEXT;
  v_entrada_real        TIME;
  v_exit_time           TIME;
  v_jornada_bruta       INTERVAL;
  v_current_date        DATE;
BEGIN
  SELECT * INTO v_store FROM stores WHERE id = p_store_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Loja não encontrada');
  END IF;

  v_month_year := TO_CHAR(p_week_start, 'YYYY-MM');

  SELECT id INTO v_schedule_id
  FROM schedules WHERE store_id = p_store_id AND week_start = p_week_start;
  IF NOT FOUND THEN
    INSERT INTO schedules (store_id, week_start, status, created_by)
    VALUES (p_store_id, p_week_start, 'draft', p_created_by)
    RETURNING id INTO v_schedule_id;
  END IF;

  -- Limpeza profunda antes de regerar
  DELETE FROM schedule_slots WHERE schedule_id = v_schedule_id;
  DELETE FROM rule_violations WHERE schedule_id = v_schedule_id;
  DELETE FROM freelancer_slots WHERE schedule_id = v_schedule_id AND filled_by IS NULL AND (is_manual IS NULL OR is_manual = false);
  DELETE FROM sunday_off_tracking WHERE store_id = p_store_id AND month_year = v_month_year AND week_start = p_week_start;

  v_month_start  := DATE_TRUNC('month', p_week_start)::DATE;
  v_month_end    := (DATE_TRUNC('month', p_week_start) + INTERVAL '1 month - 1 day')::DATE;
  v_sunday_dates := ARRAY[]::DATE[];
  v_d            := v_month_start;
  WHILE v_d <= v_month_end LOOP
    IF EXTRACT(DOW FROM v_d) = 0 THEN
      v_sunday_dates := v_sunday_dates || v_d;
    END IF;
    v_d := v_d + 1;
  END LOOP;
  v_sunday_count := array_length(v_sunday_dates, 1);

  FOR v_emp IN
    SELECT e.* FROM employees e 
    WHERE e.store_id = p_store_id AND e.active = true
    ORDER BY e.created_at ASC
  LOOP
    -- Identificar folga fixa ou domingo de folga
    SELECT sunday_date INTO v_fixed_sunday
    FROM monthly_sunday_off
    WHERE store_id = p_store_id AND employee_id = v_emp.id AND month_year = v_month_year;

    -- Iterar por cada dia da semana (0=Domingo, 1=Segunda, ..., 6=Sábado)
    FOR v_day IN 0..6 LOOP
      v_current_date := p_week_start + v_day;
      v_slot_type := 'work'; -- Padrão é trabalho
      
      -- Determinar se é folga
      IF (v_day = 0 AND v_fixed_sunday = v_current_date) OR 
         (v_day = v_emp.folga_weekday) OR 
         (v_day = v_emp.folga_weekday2) THEN
        v_slot_type := 'off';
      END IF;

      -- Configuração de horários baseada no turno preferencial
      v_shift_name := COALESCE(v_emp.pref_shift, 'morning');
      IF v_day = 0 THEN -- Domingo geralmente tem horário reduzido ou diferenciado
        v_entrada_real := v_store.opening_time;
        v_exit_time := v_store.closing_time;
      ELSIF v_shift_name = 'morning' THEN
        v_entrada_real := v_store.opening_time;
        v_exit_time := (v_store.opening_time::interval + INTERVAL '8 hours')::TIME;
      ELSE
        v_exit_time := v_store.closing_time;
        v_entrada_real := (v_store.closing_time::interval - INTERVAL '8 hours')::TIME;
      END IF;

      -- Garantia estrutural: Todo dia TEM que ter um slot
      INSERT INTO schedule_slots (
        schedule_id, employee_id, day_of_week, 
        start_time, end_time, type, 
        shift_name, created_by
      ) VALUES (
        v_schedule_id, v_emp.id, v_day,
        CASE WHEN v_slot_type = 'off' THEN NULL ELSE v_entrada_real END,
        CASE WHEN v_slot_type = 'off' THEN NULL ELSE v_exit_time END,
        v_slot_type,
        v_shift_name, p_created_by
      );
      v_slots_created := v_slots_created + 1;
      
      -- Rastrear domingo de folga
      IF v_day = 0 AND v_slot_type = 'off' THEN
        INSERT INTO sunday_off_tracking (store_id, employee_id, month_year, week_start, sundays_off)
        VALUES (p_store_id, v_emp.id, v_month_year, p_week_start, 1)
        ON CONFLICT (store_id, employee_id, month_year, week_start) 
        DO UPDATE SET sundays_off = 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true, 
    'slots_created', v_slots_created,
    'schedule_id', v_schedule_id
  );
END;
$function$