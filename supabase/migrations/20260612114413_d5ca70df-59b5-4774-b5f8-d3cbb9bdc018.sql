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
BEGIN
  -- v27: reancoragem do banco no repositorio. Corrige formula (% 6) aplicada
  -- fora de migration que permitia folga no sabado. Folgas: apenas seg-sex (% 5 + 1).

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
    LEFT JOIN sunday_off_tracking sot
      ON  sot.employee_id = e.id
      AND sot.store_id    = p_store_id
      AND sot.month_year  = v_month_year
      AND sot.week_start  <> p_week_start
    WHERE e.store_id = p_store_id AND e.active = true
    GROUP BY e.id
    ORDER BY
      CASE COALESCE(e.preferred_shift, 'flutuante')
        WHEN 'abertura'   THEN 0
        WHEN 'fechamento' THEN 1
        ELSE                   2
      END,
      COALESCE(SUM(sot.sundays_off), 0) ASC,
      e.name
  LOOP
    v_emp_idx    := v_emp_idx + 1;
    v_folga_day  := NULL;
    v_folga_day2 := NULL;

    v_folga_sunday := NULL;
    v_acc := 0;
    FOR v_si IN 1..v_sunday_count LOOP
      v_acc := v_acc + v_sundays_in_month[v_si];
      IF v_emp_idx <= v_acc THEN
        v_folga_sunday := v_sunday_dates[v_si];
        EXIT;
      END IF;
    END LOOP;

    SELECT sunday_date INTO v_fixed_sunday
    FROM monthly_sunday_off
    WHERE store_id = p_store_id
      AND employee_id = v_emp.id
      AND month_year = v_month_year
    LIMIT 1;
    IF v_fixed_sunday IS NOT NULL THEN
      v_folga_sunday := v_fixed_sunday;
    END IF;

    IF v_emp.fixed_day_off IS NOT NULL THEN
      v_folga_day := v_emp.fixed_day_off;
      CASE COALESCE(v_emp.preferred_shift, 'flutuante')
        WHEN 'fechamento' THEN v_fc_folga_days  := v_fc_folga_days  || v_folga_day;
        WHEN 'abertura'   THEN v_ab_folga_days  := v_ab_folga_days  || v_folga_day;
        ELSE                   v_int_folga_days := v_int_folga_days || v_folga_day;
      END CASE;
      v_global_folga_counts[v_folga_day] := v_global_folga_counts[v_folga_day] + 1;
    ELSE
      v_found := false;
      IF v_emp.preferred_day_off IS NOT NULL
         AND v_emp.preferred_day_off BETWEEN 1 AND 5
         AND NOT (v_emp.responsibilities @> ARRAY['estoque'] AND v_emp.preferred_day_off = ANY(v_store.stock_count_days))
         AND NOT (v_emp.responsibilities @> ARRAY['maquina'] AND v_emp.preferred_day_off = ANY(v_store.machine_wash_days))
         AND v_global_folga_counts[v_emp.preferred_day_off] < v_max_sim_offs
      THEN
        v_candidate_day := v_emp.preferred_day_off;
        CASE COALESCE(v_emp.preferred_shift, 'flutuante')
          WHEN 'fechamento' THEN
            IF NOT (v_candidate_day = ANY(v_fc_folga_days)) THEN
              v_folga_day     := v_candidate_day;
              v_fc_folga_days := v_fc_folga_days || v_candidate_day;
              v_found         := true;
            END IF;
          WHEN 'abertura' THEN
            IF NOT (v_candidate_day = ANY(v_ab_folga_days)) THEN
              v_folga_day     := v_candidate_day;
              v_ab_folga_days := v_ab_folga_days || v_candidate_day;
              v_found         := true;
            END IF;
          ELSE
            IF NOT (v_candidate_day = ANY(v_int_folga_days)) THEN
              v_folga_day      := v_candidate_day;
              v_int_folga_days := v_int_folga_days || v_candidate_day;
              v_found          := true;
            END IF;
        END CASE;
      END IF;

      IF NOT v_found THEN
        FOR v_si IN 0..4 LOOP
          v_candidate_day := ((v_emp_idx - 1 + v_si) % 5) + 1;
          IF v_emp.responsibilities @> ARRAY['estoque']
             AND v_candidate_day = ANY(v_store.stock_count_days) THEN CONTINUE; END IF;
          IF v_emp.responsibilities @> ARRAY['maquina']
             AND v_candidate_day = ANY(v_store.machine_wash_days) THEN CONTINUE; END IF;
          
          IF v_global_folga_counts[v_candidate_day] >= v_max_sim_offs AND v_si < 4 THEN CONTINUE; END IF;

          CASE COALESCE(v_emp.preferred_shift, 'flutuante')
            WHEN 'fechamento' THEN
              IF v_candidate_day = ANY(v_fc_folga_days) AND v_si < 4 THEN CONTINUE; END IF;
              v_fc_folga_days := v_fc_folga_days || v_candidate_day;
            WHEN 'abertura' THEN
              IF v_candidate_day = ANY(v_ab_folga_days) AND v_si < 4 THEN CONTINUE; END IF;
              v_ab_folga_days := v_ab_folga_days || v_candidate_day;
            ELSE
              IF v_candidate_day = ANY(v_int_folga_days) AND v_si < 4 THEN CONTINUE; END IF;
              v_int_folga_days := v_int_folga_days || v_candidate_day;
          END CASE;
          v_folga_day := v_candidate_day;
          v_found     := true;
          EXIT;
        END LOOP;
        IF NOT v_found THEN v_folga_day := ((v_emp_idx - 1) % 5) + 1; END IF;
      END IF;
      v_global_folga_counts[v_folga_day] := v_global_folga_counts[v_folga_day] + 1;
    END IF;

    IF v_emp.work_regime = '5x2' THEN
      IF v_folga_sunday IS NOT NULL
         AND v_folga_sunday >= p_week_start
         AND v_folga_sunday <  p_week_start + 7
      THEN
        v_folga_day2 := 0;
      ELSE
        v_found2 := false;
        FOR v_si IN 0..4 LOOP
          v_candidate_day := ((v_emp_idx + v_si) % 5) + 1;
          IF v_candidate_day = v_folga_day THEN CONTINUE; END IF;
          IF v_emp.responsibilities @> ARRAY['estoque']
             AND v_candidate_day = ANY(v_store.stock_count_days) THEN CONTINUE; END IF;
          IF v_emp.responsibilities @> ARRAY['maquina']
             AND v_candidate_day = ANY(v_store.machine_wash_days) THEN CONTINUE; END IF;
          
          IF v_global_folga_counts[v_candidate_day] >= v_max_sim_offs AND v_si < 4 THEN CONTINUE; END IF;

          v_folga_day2 := v_candidate_day;
          v_found2     := true;
          EXIT;
        END LOOP;
        IF NOT v_found2 THEN
          v_folga_day2 := CASE WHEN v_folga_day = 1 THEN 2 ELSE 1 END;
        END IF;
        v_global_folga_counts[v_folga_day2] := v_global_folga_counts[v_folga_day2] + 1;
      END IF;
    END IF;

    INSERT INTO _emp_sched VALUES (
      v_emp.id,
      COALESCE(v_emp.preferred_shift, 'flutuante'),
      v_emp.work_regime,
      v_folga_day,
      v_folga_day2,
      CASE
        WHEN v_emp.work_regime = '5x2' THEN
          (v_folga_day2 IS NOT NULL AND v_folga_day2 = 0)
        ELSE
          (v_folga_sunday IS NOT NULL
           AND v_folga_sunday >= p_week_start
           AND v_folga_sunday <  p_week_start + 7)
      END,
      v_emp.responsibilities
    );

    IF v_folga_sunday IS NOT NULL
       AND v_folga_sunday >= p_week_start
       AND v_folga_sunday <  p_week_start + 7
    THEN
      INSERT INTO sunday_off_tracking
        (store_id, employee_id, month_year, week_start, sundays_off)
      VALUES (p_store_id, v_emp.id, v_month_year, p_week_start, 1)
      ON CONFLICT (store_id, employee_id, month_year, week_start)
      DO UPDATE SET sundays_off = 1, updated_at = NOW();
    END IF;

  END LOOP;

  FOR v_day IN 0..6 LOOP
    v_ab_today        := 0;
    v_fc_today        := 0;
    v_int_today       := 0;
    v_int_as_fc_today := 0;
    v_int_as_ab_today := 0;

    v_opening_ref := CASE v_day
                       WHEN 6 THEN v_store.opening_time_saturday
                       WHEN 0 THEN v_store.opening_time_sunday
                       ELSE        v_store.opening_time_weekday
                     END;
    v_closing_ref := CASE v_day
                       WHEN 6 THEN COALESCE(v_store.closing_time_saturday, v_store.closing_time_weekday)
                       WHEN 0 THEN COALESCE(v_store.closing_time_sunday,   v_store.closing_time_weekday)
                       ELSE        v_store.closing_time_weekday
                     END;
    v_closing_exit := v_closing_ref + INTERVAL '20 minutes';

    SELECT COUNT(*) INTO v_working_today FROM _emp_sched
    WHERE NOT (folga_weekday = v_day AND v_day BETWEEN 1 AND 5)
      AND NOT (v_day = 0 AND folga_sunday)
      AND NOT (folga_weekday2 IS NOT NULL AND folga_weekday2 = v_day
               AND v_day BETWEEN 1 AND 6 AND folga_weekday2 <> 0);

    v_min_fc_today := CASE WHEN v_day IN (0,6) THEN v_store.min_closing_weekend ELSE v_store.min_closing_staff END;
    v_min_ab_today := CASE WHEN v_day IN (0,6) THEN v_store.min_opening_weekend ELSE v_store.min_opening_staff END;

    IF v_working_today >= 4 THEN
      v_min_fc_today := GREATEST(v_min_fc_today, 2);
    END IF;

    SELECT COUNT(*) INTO v_fc_available FROM _emp_sched
    WHERE pref_shift = 'fechamento'
      AND NOT (folga_weekday = v_day AND v_day BETWEEN 1 AND 5)
      AND NOT (v_day = 0 AND folga_sunday)
      AND NOT (folga_weekday2 IS NOT NULL AND folga_weekday2 = v_day AND v_day BETWEEN 1 AND 6);

    SELECT COUNT(*) INTO v_ab_available FROM _emp_sched
    WHERE pref_shift = 'abertura'
      AND NOT (folga_weekday = v_day AND v_day BETWEEN 1 AND 5)
      AND NOT (v_day = 0 AND folga_sunday)
      AND NOT (folga_weekday2 IS NOT NULL AND folga_weekday2 = v_day AND v_day BETWEEN 1 AND 6);

    SELECT COUNT(*) INTO v_int_available FROM _emp_sched es
    WHERE es.pref_shift NOT IN ('abertura', 'fechamento')
      AND NOT (es.folga_weekday = v_day AND v_day BETWEEN 1 AND 5)
      AND NOT (v_day = 0 AND es.folga_sunday)
      AND NOT (es.folga_weekday2 IS NOT NULL AND es.folga_weekday2 = v_day AND v_day BETWEEN 1 AND 6);

    FOR v_emp IN
      SELECT e.*, es.pref_shift, es.folga_weekday, es.folga_weekday2,
             es.folga_sunday AS emp_folga_sun
      FROM employees e
      JOIN _emp_sched es ON es.employee_id = e.id
      WHERE e.store_id = p_store_id AND e.active = true
      ORDER BY
        CASE es.pref_shift
          WHEN 'abertura'   THEN 0
          WHEN 'fechamento' THEN 1
          ELSE                   2
        END, e.name
    LOOP
      IF (v_emp.folga_weekday = v_day AND v_day BETWEEN 1 AND 5)
         OR (v_day = 0 AND v_emp.emp_folga_sun)
         OR (v_emp.folga_weekday2 IS NOT NULL
             AND v_emp.folga_weekday2 = v_day
             AND v_day BETWEEN 1 AND 6
             AND v_emp.folga_weekday2 <> 0)
      THEN
        SELECT * INTO v_shift FROM shift_templates
        WHERE store_id = p_store_id
          AND name = CASE v_emp.pref_shift
                       WHEN 'abertura'   THEN 'Abertura'
                       WHEN 'fechamento' THEN 'Fechamento'
                       ELSE                   'Intermediário'
                     END
          AND regime = v_emp.work_regime::work_regime LIMIT 1;
        IF NOT FOUND THEN
          SELECT * INTO v_shift FROM shift_templates
          WHERE store_id = p_store_id
            AND name = CASE v_emp.pref_shift
                         WHEN 'abertura'   THEN 'Abertura'
                         WHEN 'fechamento' THEN 'Fechamento'
                         ELSE                   'Intermediário'
                       END LIMIT 1;
        END IF;
        INSERT INTO schedule_slots
          (schedule_id, employee_id, day_of_week, slot_time, slot_type, updated_by)
        VALUES (v_schedule_id, v_emp.id, v_day,
                COALESCE(v_shift.entry_time, '08:00'::TIME),
                'day_off'::slot_type, p_created_by)
        ON CONFLICT DO NOTHING;
        CONTINUE;
      END IF;

      v_shift_name := CASE v_emp.pref_shift
                        WHEN 'abertura'   THEN 'Abertura'
                        WHEN 'fechamento' THEN 'Fechamento'
                        ELSE                   'Intermediário'
                      END;

      v_is_special_day := (
        (v_emp.responsibilities @> ARRAY['estoque'] AND v_day = ANY(v_store.stock_count_days))
        OR
        (v_emp.responsibilities @> ARRAY['maquina'] AND v_day = ANY(v_store.machine_wash_days))
      );

      IF v_emp.pref_shift NOT IN ('abertura', 'fechamento') AND NOT v_is_special_day THEN
        IF v_ab_today < v_min_ab_today AND v_ab_today >= v_ab_available AND v_int_as_ab_today < (v_min_ab_today - v_ab_available) THEN
           v_shift_name := 'Abertura';
           v_int_as_ab_today := v_int_as_ab_today + 1;
        ELSIF v_fc_today < v_min_fc_today AND v_fc_today >= v_fc_available AND v_int_as_fc_today < (v_min_fc_today - v_fc_available) THEN
           v_shift_name := 'Fechamento';
           v_int_as_fc_today := v_int_as_fc_today + 1;
        END IF;
      END IF;

      SELECT * INTO v_shift FROM shift_templates
      WHERE store_id = p_store_id
        AND name   = v_shift_name
        AND regime = v_emp.work_regime::work_regime LIMIT 1;
      IF NOT FOUND THEN
        SELECT * INTO v_shift FROM shift_templates
        WHERE store_id = p_store_id AND name = v_shift_name LIMIT 1;
      END IF;
      IF NOT FOUND THEN CONTINUE; END IF;

      IF v_emp.work_regime = '5x2' THEN
        v_weekly_hours_emp := COALESCE(v_store.weekly_hours_5x2, 44);
        v_dias_regime      := 5;
      ELSE
        v_weekly_hours_emp := COALESCE(v_store.weekly_hours_6x1, 44);
        v_dias_regime      := 6;
      END IF;
      v_horas_liquidas_dia := v_weekly_hours_emp / v_dias_regime;
      v_jornada_bruta      := make_interval(secs => (v_horas_liquidas_dia + 1.0) * 3600);

      IF v_is_special_day THEN
        v_entrada_real := v_opening_ref - INTERVAL '2 hours';
      ELSIF v_shift_name = 'Fechamento' THEN
        v_entrada_real := v_closing_exit - v_jornada_bruta;
      ELSIF v_shift_name = 'Abertura' THEN
        v_entrada_real := v_opening_ref - INTERVAL '1 hour';
      ELSE
        v_entrada_real := v_shift.entry_time;
      END IF;

      v_entrada_real := TIME '00:00'
        + (FLOOR(EXTRACT(EPOCH FROM v_entrada_real) / 1800) * 1800) * INTERVAL '1 second';
      v_saida_real := v_entrada_real + v_jornada_bruta;

      IF v_shift_name = 'Abertura' THEN
        v_ab_today    := v_ab_today + 1;
        v_break_start := v_shift.break_start + ((v_ab_today - 1) * INTERVAL '60 minutes');
      ELSIF v_shift_name = 'Fechamento' THEN
        v_fc_today    := v_fc_today + 1;
        v_break_start := v_shift.break_start - ((v_fc_today - 1) * INTERVAL '60 minutes');
      ELSE
        v_int_today   := v_int_today + 1;
        v_break_start := v_shift.break_start + ((v_int_today - 1) * INTERVAL '30 minutes');
      END IF;

      v_break_start := GREATEST(v_break_start, v_entrada_real + INTERVAL '1 hour');
      v_break_start := LEAST(v_break_start, v_entrada_real + INTERVAL '5 hours');
      v_break_start := GREATEST(v_break_start, v_saida_real - INTERVAL '7 hours');

      v_break_start := TIME '00:00' + (ROUND(EXTRACT(EPOCH FROM v_break_start) / 1800) * 1800) * INTERVAL '1 second';
      v_break_end   := v_break_start + INTERVAL '1 hour';

      v_slot_time := v_entrada_real;
      WHILE v_slot_time < v_saida_real LOOP
        IF v_slot_time >= v_break_start AND v_slot_time < v_break_end THEN
          v_slot_type := 'interval'::slot_type;
        ELSE
          v_slot_type := 'work'::slot_type;
        END IF;

        INSERT INTO schedule_slots
          (schedule_id, employee_id, day_of_week, slot_time, slot_type, updated_by)
        VALUES (v_schedule_id, v_emp.id, v_day, v_slot_time, v_slot_type, p_created_by)
        ON CONFLICT DO NOTHING;

        v_slot_time := v_slot_time + INTERVAL '30 minutes';
      END LOOP;
    END LOOP;

    SELECT COUNT(*) INTO v_ab_working FROM schedule_slots ss
    JOIN employees e ON e.id = ss.employee_id
    WHERE ss.schedule_id = v_schedule_id AND ss.day_of_week = v_day AND ss.slot_type = 'work'
      AND ss.slot_time = v_opening_ref;

    v_min_required := CASE WHEN v_day IN (0,6) THEN v_store.min_opening_weekend ELSE v_store.min_opening_staff END;
    IF v_ab_working < v_min_required THEN
      v_gap := v_min_required - v_ab_working;
      FOR v_fl_i IN 1..v_gap LOOP
        INSERT INTO freelancer_slots (schedule_id, store_id, day_of_week, shift_name)
        VALUES (v_schedule_id, p_store_id, v_day, 'Abertura');
        v_freelancers_created := v_freelancers_created + 1;
      END LOOP;
    END IF;

    SELECT COUNT(*) INTO v_fc_working FROM schedule_slots ss
    JOIN employees e ON e.id = ss.employee_id
    WHERE ss.schedule_id = v_schedule_id AND ss.day_of_week = v_day AND ss.slot_type = 'work'
      AND ss.slot_time = v_closing_ref - INTERVAL '30 minutes';

    v_min_required := CASE WHEN v_day IN (0,6) THEN v_store.min_closing_weekend ELSE v_store.min_closing_staff END;
    IF v_fc_working < v_min_required THEN
      v_gap := v_min_required - v_fc_working;
      FOR v_fl_i IN 1..v_gap LOOP
        INSERT INTO freelancer_slots (schedule_id, store_id, day_of_week, shift_name)
        VALUES (v_schedule_id, p_store_id, v_day, 'Fechamento');
        v_freelancers_created := v_freelancers_created + 1;
      END LOOP;
    END IF;

  END LOOP;

  SELECT COUNT(*) INTO v_slots_created FROM schedule_slots WHERE schedule_id = v_schedule_id;

  RETURN jsonb_build_object(
    'success', true,
    'schedule_id', v_schedule_id,
    'slots_created', v_slots_created,
    'freelancers_created', v_freelancers_created
  );
END $function$;