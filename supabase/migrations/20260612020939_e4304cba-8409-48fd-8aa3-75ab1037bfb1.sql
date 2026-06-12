CREATE OR REPLACE FUNCTION public.generate_base_schedule(p_store_id uuid, p_week_start date, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_schedule_id         UUID;
  v_store               RECORD;
  v_emp                 RECORD;
  v_shift               RECORD;
  v_day                 INT;
  v_slot_time           TIME;
  v_slot_type           slot_type;
  v_month_year          TEXT;
  v_slots_created       INT := 0;
  v_freelancers_created INT := 0;
  v_sunday_dates        DATE[];
  v_sundays_in_month    INT[];
  v_sunday_count        INT;
  v_total_emps          INT;
  v_month_start         DATE;
  v_month_end           DATE;
  v_d                   DATE;
  v_si                  INT;
  v_acc                 INT;
  v_emp_idx             INT;
  v_folga_day           INT;
  v_folga_day2          INT;
  v_folga_sunday        DATE;
  v_fixed_sunday        DATE;
  v_found               BOOLEAN;
  v_found2              BOOLEAN;
  v_candidate_day       INT;
  v_fc_folga_days       INT[] := ARRAY[]::INT[];
  v_ab_folga_days       INT[] := ARRAY[]::INT[];
  v_int_folga_days      INT[] := ARRAY[]::INT[];
  v_global_folga_counts INT[] := ARRAY[0,0,0,0,0,0,0]; 
  v_max_sim_offs        INT;
  v_shift_name          TEXT;
  v_break_start         TIME;
  v_break_end           TIME;
  v_entrada_real        TIME;
  v_saida_real          TIME;
  v_is_special_day      BOOLEAN;
  v_ab_today            INT;
  v_fc_today            INT;
  v_int_today           INT;
  v_int_as_fc_today     INT;
  v_int_as_ab_today     INT;
  v_weekly_hours_emp    DECIMAL;
  v_dias_regime         INT;
  v_horas_liquidas_dia  DECIMAL;
  v_jornada_bruta      INTERVAL;
  v_working_today       INT;
  v_min_fc_today        INT;
  v_min_ab_today        INT;
  v_fc_available        INT;
  v_ab_available        INT;
  v_int_available       INT;
  v_opening_ref         TIME;
  v_closing_ref         TIME;
  v_closing_exit        TIME;
  v_ab_working          INT;
  v_fc_working          INT;
  v_min_required        INT;
  v_gap                 INT;
  v_fl_i                INT;
  v_base_per_sunday     INT;
  v_extra_sundays       INT;
  v_break_offset        INT := 0;
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
  DELETE FROM freelancer_slots WHERE schedule_id = v_schedule_id;
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

  v_max_sim_offs := CASE WHEN v_total_emps <= 6 THEN 1 ELSE 2 END;

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

  CREATE TEMP TABLE IF NOT EXISTS _emp_sched (
    employee_id      UUID PRIMARY KEY,
    pref_shift       TEXT,
    work_regime      TEXT,
    folga_weekday    INT,
    folga_weekday2   INT,
    folga_sunday     BOOLEAN,
    responsibilities TEXT[]
  ) ON COMMIT DROP;
  TRUNCATE _emp_sched;

  v_emp_idx := 0;
  FOR v_emp IN
    SELECT e.*,
           COALESCE(SUM(sot.sundays_off), 0) AS hist_sundays_off
    FROM employees e
    LEFT JOIN sunday_off_tracking sot ON e.id = sot.employee_id AND sot.month_year = v_month_year
    WHERE e.store_id = p_store_id AND e.active = true
    GROUP BY e.id
    ORDER BY hist_sundays_off ASC, e.name ASC
  LOOP
    v_si := ((v_emp_idx % v_sunday_count) + 1);
    v_folga_sunday := v_sunday_dates[v_si];
    
    SELECT sunday_date INTO v_fixed_sunday
    FROM monthly_sunday_off
    WHERE employee_id = v_emp.id AND month_year = v_month_year;
    
    IF FOUND THEN
      v_folga_sunday := v_fixed_sunday;
    END IF;

    IF v_folga_sunday = p_week_start + INTERVAL '6 days' THEN
      v_found := true;
    ELSE
      v_found := false;
    END IF;

    v_folga_day := (v_emp_idx % 6) + 1;
    v_found2 := false;
    IF v_emp.work_regime::text = '6x1' THEN
      v_folga_day := (v_emp_idx % 6) + 1;
    ELSIF v_emp.work_regime::text = '5x2' THEN
      v_folga_day := (v_emp_idx % 5) + 1;
      v_folga_day2 := (v_folga_day % 5) + 1;
      v_found2 := true;
    END IF;

    INSERT INTO _emp_sched (employee_id, pref_shift, work_regime, folga_weekday, folga_weekday2, folga_sunday, responsibilities)
    VALUES (v_emp.id, v_emp.preferred_shift, v_emp.work_regime::text, v_folga_day, v_folga_day2, v_found, v_emp.responsibilities);

    IF v_found THEN
      INSERT INTO sunday_off_tracking (store_id, employee_id, month_year, week_start, sundays_off)
      VALUES (p_store_id, v_emp.id, v_month_year, p_week_start, 1);
    END IF;
    
    v_emp_idx := v_emp_idx + 1;
  END LOOP;

  FOR v_day IN 1..7 LOOP
    v_break_offset := 0;

    FOR v_emp IN
      SELECT e.*, es.pref_shift, es.work_regime, es.folga_weekday, es.folga_weekday2, es.folga_sunday, es.responsibilities
      FROM employees e
      JOIN _emp_sched es ON e.id = es.employee_id
      ORDER BY 
        CASE 
          WHEN es.pref_shift = 'Abertura' THEN 1 
          WHEN es.pref_shift = 'Intermediário' THEN 2 
          ELSE 3 
        END, e.name ASC
    LOOP
      IF (v_day = 7 AND v_emp.folga_sunday) OR 
         (v_emp.work_regime::text = '6x1' AND v_day = v_emp.folga_weekday) OR
         (v_emp.work_regime::text = '5x2' AND (v_day = v_emp.folga_weekday OR v_day = v_emp.folga_weekday2)) 
      THEN
        INSERT INTO schedule_slots (schedule_id, employee_id, day_of_week, slot_time, slot_type, updated_by)
        VALUES (v_schedule_id, v_emp.id, v_day, '08:00', 'day_off', p_created_by);
        CONTINUE;
      END IF;

      v_is_special_day := (v_day = 6 OR v_day = 7);
      SELECT * INTO v_shift FROM shift_templates 
      WHERE store_id = p_store_id AND name = v_emp.pref_shift AND is_special_day = v_is_special_day;
      
      IF NOT FOUND THEN
        SELECT * INTO v_shift FROM shift_templates 
        WHERE store_id = p_store_id AND name = v_emp.pref_shift AND is_special_day = false;
      END IF;

      IF FOUND THEN
        v_entrada_real := v_shift.start_time;
        v_saida_real   := v_shift.end_time;
        
        v_break_start := v_entrada_real + INTERVAL '3 hours' + (v_break_offset * INTERVAL '30 minutes');
        
        IF v_break_start >= v_entrada_real + INTERVAL '5 hours 30 minutes' THEN
           v_break_start := v_entrada_real + INTERVAL '5 hours';
        END IF;
        
        v_break_end := v_break_start + INTERVAL '1 hour';
        v_break_offset := v_break_offset + 1;

        FOR v_slot_time IN SELECT generate_series(v_entrada_real::time, (v_saida_real - INTERVAL '30 min')::time, '30 min')::time LOOP
          v_slot_type := CASE WHEN v_slot_time >= v_break_start AND v_slot_time < v_break_end THEN 'interval'::slot_type ELSE 'work'::slot_type END;
          
          INSERT INTO schedule_slots (schedule_id, employee_id, day_of_week, slot_time, slot_type, updated_by)
          VALUES (v_schedule_id, v_emp.id, v_day, v_slot_time, v_slot_type, p_created_by);
        END LOOP;
      END IF;
    END LOOP;

    SELECT opening_time, closing_time INTO v_opening_ref, v_closing_ref FROM stores WHERE id = p_store_id;
    
    FOR v_si IN 0..1 LOOP
       v_slot_time := CASE WHEN v_si = 0 THEN v_opening_ref ELSE v_closing_ref - INTERVAL '30 min' END;
       
       SELECT COUNT(*) INTO v_working_today 
       FROM schedule_slots 
       WHERE schedule_id = v_schedule_id AND day_of_week = v_day AND slot_time = v_slot_time AND slot_type = 'work';
       
       IF v_working_today = 0 THEN
          UPDATE schedule_slots 
          SET slot_type = 'work'
          WHERE id = (
            SELECT id FROM schedule_slots 
            WHERE schedule_id = v_schedule_id AND day_of_week = v_day AND slot_time = v_slot_time
            LIMIT 1
          );
       END IF;
    END LOOP;
  END LOOP;

  SELECT COUNT(*) INTO v_slots_created FROM schedule_slots WHERE schedule_id = v_schedule_id;

  RETURN jsonb_build_object(
    'success', true,
    'schedule_id', v_schedule_id,
    'slots_created', v_slots_created,
    'freelancers_created', v_freelancers_created
  );
END $function$;