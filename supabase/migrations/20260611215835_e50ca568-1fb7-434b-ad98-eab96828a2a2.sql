-- 1. Atualizar generate_base_schedule para lidar com preferred_day_off NULL
CREATE OR REPLACE FUNCTION public.generate_base_schedule(p_store_id uuid, p_week_start date, p_created_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_schedule_id         UUID;
  v_store               RECORD;
  v_emp                 RECORD;
  v_day                 INT;
  v_slot_type_val       slot_type;
  v_month_year          TEXT;
  v_slots_created       INT := 0;
  v_current_date        DATE;
  v_fixed_sunday        DATE;
  v_shift_name          TEXT;
  v_entrada_real        TIME;
  v_exit_time           TIME;
  v_current_time        TIME;
  v_interval_start      TIME;
  v_interval_end        TIME;
  v_dow                 INT;
  v_emp_count           INT := 0;
  v_emp_index           INT := 0;
  v_assigned_off_day    INT;
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

  DELETE FROM schedule_slots WHERE schedule_id = v_schedule_id;
  DELETE FROM rule_violations WHERE schedule_id = v_schedule_id;
  DELETE FROM freelancer_slots WHERE schedule_id = v_schedule_id AND filled_by IS NULL AND (is_manual IS NULL OR is_manual = false);
  DELETE FROM sunday_off_tracking WHERE store_id = p_store_id AND month_year = v_month_year AND week_start = p_week_start;

  -- Contar funcionários ativos para distribuir folgas se necessário
  SELECT count(*) INTO v_emp_count FROM employees WHERE store_id = p_store_id AND active = true;

  FOR v_emp IN
    SELECT e.* FROM employees e 
    WHERE e.store_id = p_store_id AND e.active = true
    ORDER BY e.created_at ASC
  LOOP
    -- Se não tem folga preferida, atribuir uma baseada no index (Segunda a Sábado: 0 a 5)
    -- Isso garante que nem todos folguem no mesmo dia e que todos tenham folga
    v_assigned_off_day := COALESCE(v_emp.preferred_day_off, (v_emp_index % 6));
    v_emp_index := v_emp_index + 1;

    SELECT sunday_date INTO v_fixed_sunday
    FROM monthly_sunday_off
    WHERE store_id = p_store_id AND employee_id = v_emp.id AND month_year = v_month_year;

    FOR v_day IN 0..6 LOOP
      v_current_date := p_week_start + v_day;
      v_dow := EXTRACT(DOW FROM v_current_date)::INT; 
      
      v_slot_type_val := 'work'; 
      -- Folga se for o Domingo escalado OU se for o dia de folga da semana (v_day 0=Seg, ..., 6=Dom)
      -- v_fixed_sunday usa v_current_date (data real)
      -- v_assigned_off_day usa v_day (0-6 relativo a p_week_start que é segunda)
      IF (v_dow = 0 AND v_fixed_sunday = v_current_date) OR 
         (v_day = v_assigned_off_day AND v_dow != 0) THEN
        v_slot_type_val := 'day_off';
      END IF;

      IF v_slot_type_val = 'day_off' THEN
        INSERT INTO schedule_slots (
          schedule_id, employee_id, day_of_week, 
          slot_time, slot_type, updated_by
        ) VALUES (
          v_schedule_id, v_emp.id, v_day,
          '08:00', 'day_off', p_created_by
        );
        v_slots_created := v_slots_created + 1;
        
        IF v_dow = 0 THEN
          INSERT INTO sunday_off_tracking (store_id, employee_id, month_year, week_start, sundays_off)
          VALUES (p_store_id, v_emp.id, v_month_year, p_week_start, 1)
          ON CONFLICT (store_id, employee_id, month_year, week_start) 
          DO UPDATE SET sundays_off = 1;
        END IF;
      ELSE
        v_shift_name := COALESCE(v_emp.preferred_shift, 'morning');
        
        IF v_dow = 0 THEN 
          v_entrada_real := COALESCE(v_store.opening_time_sunday, '09:00'::TIME);
          v_exit_time := COALESCE(v_store.closing_time_sunday, '18:00'::TIME);
        ELSIF v_dow = 6 THEN 
          v_entrada_real := COALESCE(v_store.opening_time_saturday, '09:00'::TIME);
          v_exit_time := COALESCE(v_store.closing_time_saturday, '22:00'::TIME);
        ELSE 
          v_entrada_real := COALESCE(v_store.opening_time_weekday, '09:00'::TIME);
          v_exit_time := COALESCE(v_store.closing_time_weekday, '22:00'::TIME);
        END IF;

        IF v_shift_name = 'morning' THEN
          v_exit_time := (v_entrada_real::interval + INTERVAL '8 hours')::TIME;
        ELSE
          v_entrada_real := (v_exit_time::interval - INTERVAL '8 hours')::TIME;
        END IF;

        v_interval_start := (v_entrada_real::interval + INTERVAL '4 hours')::TIME;
        v_interval_end := (v_interval_start::interval + INTERVAL '1 hour')::TIME;

        v_current_time := v_entrada_real;
        WHILE v_current_time < v_exit_time LOOP
          INSERT INTO schedule_slots (
            schedule_id, employee_id, day_of_week, 
            slot_time, slot_type, updated_by
          ) VALUES (
            v_schedule_id, v_emp.id, v_day,
            v_current_time, 
            CASE 
              WHEN v_current_time >= v_interval_start AND v_current_time < v_interval_end THEN 'interval'::slot_type
              ELSE 'work'::slot_type 
            END,
            p_created_by
          );
          v_slots_created := v_slots_created + 1;
          v_current_time := (v_current_time::interval + INTERVAL '30 minutes')::TIME;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true, 
    'slots_created', v_slots_created,
    'schedule_id', v_schedule_id
  );
END;
$function$;
