DROP FUNCTION IF EXISTS public.generate_base_schedule(uuid, date, uuid);

CREATE OR REPLACE FUNCTION public.generate_base_schedule(p_store_id uuid, p_week_start date, p_created_by uuid DEFAULT NULL)
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
  v_sundays_in_month    INT[];
  v_sunday_count        INT;
  v_total_emps          INT;
  v_month_start         DATE;
  v_month_end           DATE;
  v_d                   DATE;
  v_si                  INT;
  v_emp_idx             INT;
  v_folga_day           INT;
  v_folga_day2          INT;
  v_folga_sunday        DATE;
  v_fixed_sunday        DATE;
  v_candidate_day       INT;
  v_shift_name          TEXT;
  v_break_start         TIME;
  v_break_end           TIME;
  v_entrada_real        TIME;
  v_opening_ref         TIME;
  v_closing_ref         TIME;
  v_ab_count            INT;
  v_fc_count            INT;
  v_min_opening         INT;
  v_min_closing         INT;
  v_exit_time           TIME;
  v_jornada_bruta       INTERVAL;
  v_fl_i                INT;
  v_base_per_sunday     INT;
  v_extra_sundays       INT;
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

  DELETE FROM schedule_slots   WHERE schedule_id = v_schedule_id;
  DELETE FROM rule_violations  WHERE schedule_id = v_schedule_id;
  
  DELETE FROM freelancer_slots 
  WHERE schedule_id = v_schedule_id 
    AND filled_by IS NULL 
    AND (is_manual IS NULL OR is_manual = false);
    
  DELETE FROM sunday_off_tracking
  WHERE store_id   = p_store_id
    AND month_year = v_month_year
    AND week_start = p_week_start;

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

  SELECT COUNT(*) INTO v_total_emps
  FROM employees WHERE store_id = p_store_id AND active = true;

  IF v_sunday_count > 0 THEN
    v_base_per_sunday  := v_total_emps / v_sunday_count;
    v_extra_sundays    := v_total_emps % v_sunday_count;
    v_sundays_in_month := ARRAY[]::INT[];
    FOR v_si IN 1..v_sunday_count LOOP
      IF v_si <= (v_sunday_count - v_extra_sundays) THEN
        v_sundays_in_month := v_sundays_in_month || v_base_per_sunday;
      ELSE
        v_sundays_in_month := v_sundays_in_month || (v_base_per_sunday + 1);
      END IF;
    END LOOP;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _emp_sched (
    employee_id      UUID PRIMARY KEY,
    pref_shift       TEXT,
    work_regime      TEXT,
    folga_weekday    INT,
    folga_weekday2   INT,
    folga_sunday     BOOLEAN,
    responsibilities TEXT[],
    emp_idx_internal INT
  ) ON COMMIT DROP;
  TRUNCATE _emp_sched;

  v_emp_idx := 0;
  FOR v_emp IN
    SELECT e.*,
           COALESCE(SUM(sot.sundays_off), 0) AS hist_sundays_off
    FROM employees e
    LEFT JOIN sunday_off_tracking sot
      ON  sot.employee_id = e.id
      AND sot.month_year  = v_month_year
    WHERE e.store_id = p_store_id AND e.active = true
    GROUP BY e.id
    ORDER BY e.created_at ASC
  LOOP
    v_emp_idx := v_emp_idx + 1;
    v_folga_day := NULL;
    v_folga_day2 := NULL;
    v_folga_sunday := NULL;

    SELECT sunday_date INTO v_fixed_sunday
    FROM monthly_sunday_off
    WHERE store_id = p_store_id AND employee_id = v_emp.id AND month_year = v_month_year;

    IF v_fixed_sunday IS NOT NULL THEN
      IF v_fixed_sunday BETWEEN p_week_start AND (p_week_start + 6) THEN
        v_folga_sunday := v_fixed_sunday;
      END IF;
    ELSE
      FOR v_si IN 1..v_sunday_count LOOP
        IF (v_si <= array_length(v_sundays_in_month, 1)) AND v_sundays_in_month[v_si] > 0 THEN
          IF v_sunday_dates[v_si] BETWEEN p_week_start AND (p_week_start + 6) THEN
            v_folga_sunday := v_sunday_dates[v_si];
            v_sundays_in_month[v_si] := v_sundays_in_month[v_si] - 1;
            EXIT;
          END IF;
        END IF;
      END LOOP;
    END IF;

    IF v_folga_sunday IS NOT NULL THEN
      INSERT INTO sunday_off_tracking (store_id, employee_id, month_year, week_start, sundays_off)
      VALUES (p_store_id, v_emp.id, v_month_year, p_week_start, 1);
    END IF;

    IF v_emp.fixed_day_off IS NOT NULL THEN
        v_folga_day := v_emp.fixed_day_off;
    ELSE
        IF v_emp.work_regime = '6x1' THEN
          v_candidate_day := ((v_emp_idx - 1) % 6) + 1;
          v_folga_day := v_candidate_day;
        ELSIF v_emp.work_regime = '5x2' THEN
          v_candidate_day := ((v_emp_idx - 1) % 5) + 1;
          v_folga_day := v_candidate_day;
          v_folga_day2 := (v_candidate_day % 5) + 1;
          IF v_folga_day2 = v_folga_day THEN v_folga_day2 := (v_folga_day % 6) + 1; END IF;
        END IF;
    END IF;

    INSERT INTO _emp_sched (employee_id, pref_shift, work_regime, folga_weekday, folga_weekday2, folga_sunday, responsibilities, emp_idx_internal)
    VALUES (v_emp.id, v_emp.preferred_shift, v_emp.work_regime, v_folga_day, v_folga_day2, (v_folga_sunday IS NOT NULL), v_emp.responsibilities, v_emp_idx);
  END LOOP;

  FOR v_day IN 0..6 LOOP
    v_opening_ref := CASE WHEN v_day = 0 THEN v_store.opening_time_sunday WHEN v_day = 6 THEN v_store.opening_time_saturday ELSE v_store.opening_time_weekday END;
    v_closing_ref := CASE WHEN v_day = 0 THEN v_store.closing_time_sunday WHEN v_day = 6 THEN v_store.closing_time_saturday ELSE v_store.closing_time_weekday END;
    v_min_opening := CASE WHEN v_day IN (0,6) THEN COALESCE(v_store.min_opening_weekend, 1) ELSE COALESCE(v_store.min_opening_staff, 1) END;
    v_min_closing := CASE WHEN v_day IN (0,6) THEN COALESCE(v_store.min_closing_weekend, 2) ELSE COALESCE(v_store.min_closing_staff, 2) END;

    FOR v_emp IN SELECT es.*, e.name, e.color FROM _emp_sched es JOIN employees e ON e.id = es.employee_id LOOP
      IF (v_day = 0 AND v_emp.folga_sunday) OR (v_day > 0 AND (v_day = v_emp.folga_weekday OR v_day = v_emp.folga_weekday2)) THEN
        v_slot_time := '08:00:00'::TIME;
        WHILE v_slot_time < '23:30:00'::TIME LOOP
          INSERT INTO schedule_slots (schedule_id, employee_id, day_of_week, slot_time, slot_type)
          VALUES (v_schedule_id, v_emp.employee_id, v_day, v_slot_time, 'day_off');
          v_slot_time := v_slot_time + INTERVAL '30 minutes';
        END LOOP;
        CONTINUE;
      END IF;

      v_shift_name := v_emp.pref_shift;
      IF v_shift_name IS NULL OR v_shift_name = 'flutuante' THEN
        v_shift_name := CASE WHEN v_emp.emp_idx_internal % 2 = 0 THEN 'abertura' ELSE 'fechamento' END;
      END IF;

      v_jornada_bruta := CASE WHEN v_emp.work_regime = '5x2' THEN INTERVAL '9 hours 48 minutes' ELSE INTERVAL '8 hours 20 minutes' END;
      
      IF v_shift_name = 'abertura' THEN
        v_entrada_real := v_opening_ref;
        v_exit_time := v_entrada_real + v_jornada_bruta;
      ELSE
        v_exit_time := CASE WHEN v_emp.work_regime = '5x2' THEN v_store.closing_exit_5x2 ELSE v_store.closing_exit_6x1 END;
        IF v_shift_name = 'intermediario' THEN
            v_entrada_real := v_opening_ref + INTERVAL '2 hours';
            v_exit_time := v_entrada_real + v_jornada_bruta;
        ELSE
            v_entrada_real := v_exit_time - v_jornada_bruta;
        END IF;
      END IF;

      v_break_start := v_entrada_real + (v_jornada_bruta / 2) - INTERVAL '30 minutes';
      v_break_end   := v_break_start + INTERVAL '1 hour';

      v_slot_time := v_entrada_real;
      WHILE v_slot_time < v_exit_time LOOP
        v_slot_type := CASE WHEN v_slot_time >= v_break_start AND v_slot_time < v_break_end THEN 'interval'::slot_type ELSE 'work'::slot_type END;
        INSERT INTO schedule_slots (schedule_id, employee_id, day_of_week, slot_time, slot_type)
        VALUES (v_schedule_id, v_emp.employee_id, v_day, v_slot_time, v_slot_type);
        v_slot_time := v_slot_time + INTERVAL '30 minutes';
        v_slots_created := v_slots_created + 1;
      END LOOP;
    END LOOP;

    v_ab_count := (SELECT COUNT(DISTINCT employee_id) FROM schedule_slots WHERE schedule_id = v_schedule_id AND day_of_week = v_day AND slot_time = v_opening_ref AND slot_type = 'work');
    IF v_ab_count < v_min_opening THEN
      FOR v_fl_i IN 1..(v_min_opening - v_ab_count) LOOP
        INSERT INTO freelancer_slots (schedule_id, day_of_week, shift_name, start_time, end_time)
        VALUES (v_schedule_id, v_day, 'Abertura', v_opening_ref, v_opening_ref + INTERVAL '4 hours');
      END LOOP;
    END IF;

    v_fc_count := (SELECT COUNT(DISTINCT employee_id) FROM schedule_slots WHERE schedule_id = v_schedule_id AND day_of_week = v_day AND slot_time = (v_closing_ref - INTERVAL '30 minutes') AND slot_type = 'work');
    IF v_fc_count < v_min_closing THEN
      FOR v_fl_i IN 1..(v_min_closing - v_fc_count) LOOP
        INSERT INTO freelancer_slots (schedule_id, day_of_week, shift_name, start_time, end_time)
        VALUES (v_schedule_id, v_day, 'Fechamento', v_closing_ref - INTERVAL '4 hours', v_closing_ref);
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'slots_created', v_slots_created);
END;
$function$
;
