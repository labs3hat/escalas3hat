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
  v_slot_end            TIME;
  v_slot_type           slot_type;
  v_month_year          TEXT;
  v_violations          JSONB[] := ARRAY[]::JSONB[];
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
  v_shift_name          TEXT;
  v_break_start         TIME;
  v_break_end           TIME;
  v_entrada_real        TIME;
  v_is_special_day      BOOLEAN;
  v_ab_today            INT;
  v_fc_today            INT;
  v_int_today           INT;
  v_int_as_fc_today     INT;
  v_week_hours          DECIMAL;
  v_dias_trabalhados    INT;
  v_contract_hours      DECIMAL;
  v_ab_count            INT;
  v_fc_count            INT;
  v_int_count           INT;
  v_opening_ref         TIME;
  v_closing_ref         TIME;
  v_closing_exit        TIME;
  v_working_count       INT;
  v_min_required        INT;
  v_gap                 INT;
  v_fl_i                INT;
  v_fl_shift            TEXT;
  v_ab_working          INT;
  v_fc_working          INT;
  v_int_working         INT;
  v_base_per_sunday     INT;
  v_extra_sundays       INT;
  v_horas_liquidas_dia  DECIMAL;
  v_jornada_bruta       INTERVAL;
  v_r16_threshold       INT;
  v_weekly_hours_emp    DECIMAL;
  v_dias_regime         INT;
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
  
  -- PRESERVAR FREELANCERS: Deleta apenas vagas automáticas que NÃO estão preenchidas
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

    -- Domingo de folga R17
    v_folga_sunday := NULL;
    IF v_sunday_count > 0 THEN
      v_acc := 0;
      FOR v_si IN 1..v_sunday_count LOOP
        v_acc := v_acc + v_sundays_in_month[v_si];
        IF v_emp_idx <= v_acc THEN
          v_folga_sunday := v_sunday_dates[v_si];
          EXIT;
        END IF;
      END LOOP;
    END IF;

    -- Domingo fixo mensal
    SELECT sunday_date INTO v_fixed_sunday
    FROM monthly_sunday_off
    WHERE store_id = p_store_id
      AND employee_id = v_emp.id
      AND month_year = v_month_year
    LIMIT 1;
    IF v_fixed_sunday IS NOT NULL THEN
      v_folga_sunday := v_fixed_sunday;
    END IF;

    -- Lógica de folgas semanais...
    IF v_emp.fixed_day_off IS NOT NULL THEN
      v_folga_day := v_emp.fixed_day_off;
      CASE COALESCE(v_emp.preferred_shift, 'flutuante')
        WHEN 'fechamento' THEN v_fc_folga_days  := v_fc_folga_days  || v_folga_day;
        WHEN 'abertura'   THEN v_ab_folga_days  := v_ab_folga_days  || v_folga_day;
        ELSE                   v_int_folga_days := v_int_folga_days || v_folga_day;
      END CASE;
    ELSE
      v_found := false;
      IF v_emp.preferred_day_off IS NOT NULL
         AND v_emp.preferred_day_off BETWEEN 1 AND 5
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
          CASE COALESCE(v_emp.preferred_shift, 'flutuante')
            WHEN 'fechamento' THEN
              IF v_candidate_day = ANY(v_fc_folga_days) THEN CONTINUE; END IF;
              v_fc_folga_days := v_fc_folga_days || v_candidate_day;
            WHEN 'abertura' THEN
              IF v_candidate_day = ANY(v_ab_folga_days) THEN CONTINUE; END IF;
              v_ab_folga_days := v_ab_folga_days || v_candidate_day;
            ELSE
              IF v_candidate_day = ANY(v_int_folga_days) AND v_si < 4 THEN CONTINUE; END IF;
              v_int_folga_days := v_int_folga_days || v_candidate_day;
          END CASE;
          v_folga_day := v_candidate_day;
          v_found     := true;
          EXIT;
        END LOOP;
      END IF;
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
          v_folga_day2 := v_candidate_day;
          v_found2     := true;
          EXIT;
        END LOOP;
        IF NOT v_found2 THEN
          v_folga_day2 := CASE WHEN v_folga_day = 1 THEN 2 ELSE 1 END;
        END IF;
      END IF;
    END IF;

    INSERT INTO _emp_sched VALUES (
      v_emp.id,
      COALESCE(v_emp.preferred_shift, 'flutuante'),
      v_emp.work_regime,
      v_folga_day,
      v_folga_day2,
      (v_folga_sunday IS NOT NULL AND v_folga_sunday >= p_week_start AND v_folga_sunday < p_week_start + 7),
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
         OR (v_emp.folga_weekday2 IS NOT NULL AND v_emp.folga_weekday2 = v_day AND v_day BETWEEN 1 AND 6)
      THEN
        INSERT INTO schedule_slots
          (schedule_id, employee_id, day_of_week, slot_time, slot_type, updated_by)
        VALUES (v_schedule_id, v_emp.id, v_day, '08:00'::TIME, 'day_off'::slot_type, p_created_by)
        ON CONFLICT DO NOTHING;
        CONTINUE;
      END IF;

      v_shift_name := CASE v_emp.pref_shift
                        WHEN 'abertura'   THEN 'Abertura'
                        WHEN 'fechamento' THEN 'Fechamento'
                        ELSE                   'Intermediário'
                      END;

      SELECT * INTO v_shift FROM shift_templates
      WHERE store_id = p_store_id AND name = v_shift_name LIMIT 1;
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

      v_is_special_day := (
        (v_emp.responsibilities @> ARRAY['estoque'] AND v_day = ANY(v_store.stock_count_days))
        OR
        (v_emp.responsibilities @> ARRAY['maquina'] AND v_day = ANY(v_store.machine_wash_days))
      );

      IF v_is_special_day THEN
        v_entrada_real := v_opening_ref - INTERVAL '2 hours';
      ELSIF v_shift_name = 'Fechamento' THEN
        v_entrada_real := v_closing_exit - v_jornada_bruta;
      ELSIF v_shift_name = 'Abertura' THEN
        v_entrada_real := v_opening_ref - INTERVAL '1 hour';
      ELSE
        v_entrada_real := v_shift.entry_time;
      END IF;

      v_slot_time := v_entrada_real;
      v_slot_end  := v_entrada_real + v_jornada_bruta;
      v_break_start := v_entrada_real + make_interval(secs => v_horas_liquidas_dia * 3600 * 0.5);
      v_break_end   := v_break_start + INTERVAL '60 minutes';

      WHILE v_slot_time < v_slot_end LOOP
        v_slot_type := CASE
          WHEN v_slot_time >= v_break_start AND v_slot_time < v_break_end
          THEN 'interval'::slot_type
          ELSE 'work'::slot_type
        END;
        INSERT INTO schedule_slots
          (schedule_id, employee_id, day_of_week, slot_time, slot_type, updated_by)
        VALUES (v_schedule_id, v_emp.id, v_day, v_slot_time, v_slot_type, p_created_by)
        ON CONFLICT DO NOTHING;
        v_slots_created := v_slots_created + 1;
        v_slot_time     := v_slot_time + INTERVAL '30 minutes';
      END LOOP;
    END LOOP;
  END LOOP;

  -- Geração de freelancers...
  FOR v_day IN 0..6 LOOP
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

    SELECT COUNT(DISTINCT employee_id) INTO v_working_count
    FROM schedule_slots
    WHERE schedule_id = v_schedule_id AND day_of_week = v_day AND slot_type = 'work';
    
    -- Contabilizar freelancers já existentes (preservados)
    SELECT COUNT(*) INTO v_acc FROM freelancer_slots 
    WHERE schedule_id = v_schedule_id AND day_of_week = v_day;
    v_working_count := v_working_count + v_acc;

    v_min_required := CASE
      WHEN v_day = 0 THEN GREATEST(v_store.min_sunday_staff, v_store.min_weekend_staff)
      WHEN v_day = 6 THEN v_store.min_weekend_staff
      ELSE                v_store.min_weekday_staff
    END;

    v_gap := GREATEST(0, v_min_required - v_working_count);
    FOR v_fl_i IN 1..v_gap LOOP
      INSERT INTO freelancer_slots (schedule_id, store_id, day_of_week, shift_name, rule_origin)
      VALUES (v_schedule_id, p_store_id, v_day, 'Intermediário', 'R18');
      v_freelancers_created := v_freelancers_created + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success',             true,
    'schedule_id',         v_schedule_id,
    'slots_created',       v_slots_created,
    'freelancers_created', v_freelancers_created
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'detail', SQLSTATE);
END;
$function$;