CREATE OR REPLACE FUNCTION public.generate_base_schedule(p_store_id uuid, p_week_start date, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
-- v19: dias especiais (estoque/maquina) nao contam como fechamento na conversao int->fechamento
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
  v_remaining           INT;
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
  v_fc_available        INT;
  v_int_available       INT;
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
  v_weekly_hours_emp    DECIMAL;
  v_dias_regime         INT;
  v_horas_liquidas_dia  DECIMAL;
  v_jornada_bruta       INTERVAL;
  v_r16_threshold       INT;
  v_working_today       INT;
  v_min_fc_today        INT;
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
    ELSE
      v_found := false;
      IF v_emp.preferred_day_off IS NOT NULL
         AND v_emp.preferred_day_off BETWEEN 1 AND 5
         AND NOT (v_emp.responsibilities @> ARRAY['estoque'] AND v_emp.preferred_day_off = ANY(v_store.stock_count_days))
         AND NOT (v_emp.responsibilities @> ARRAY['maquina'] AND v_emp.preferred_day_off = ANY(v_store.machine_wash_days))
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
        IF NOT v_found THEN v_folga_day := ((v_emp_idx - 1) % 5) + 1; END IF;
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
          IF v_emp.responsibilities @> ARRAY['estoque']
             AND v_candidate_day = ANY(v_store.stock_count_days) THEN CONTINUE; END IF;
          IF v_emp.responsibilities @> ARRAY['maquina']
             AND v_candidate_day = ANY(v_store.machine_wash_days) THEN CONTINUE; END IF;
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

    IF v_emp.fixed_day_off IS NULL THEN
      UPDATE employees SET preferred_day_off = v_folga_day WHERE id = v_emp.id;
    END IF;

  END LOOP;

  FOR v_day IN 0..6 LOOP
    v_ab_today        := 0;
    v_fc_today        := 0;
    v_int_today       := 0;
    v_int_as_fc_today := 0;

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

    -- total de funcionarios trabalhando no dia e minimo de fechamento dinamico
    SELECT COUNT(*) INTO v_working_today FROM _emp_sched
    WHERE NOT (folga_weekday = v_day AND v_day BETWEEN 1 AND 5)
      AND NOT (v_day = 0 AND folga_sunday)
      AND NOT (folga_weekday2 IS NOT NULL AND folga_weekday2 = v_day
               AND v_day BETWEEN 1 AND 6 AND folga_weekday2 <> 0);

    v_min_fc_today := CASE WHEN v_day IN (0,6) THEN v_store.min_closing_weekend ELSE v_store.min_closing_staff END;
    IF v_working_today >= 4 THEN
      v_min_fc_today := GREATEST(v_min_fc_today, 2);
    END IF;

    SELECT COUNT(*) INTO v_fc_available FROM _emp_sched
    WHERE pref_shift = 'fechamento'
      AND NOT (folga_weekday = v_day AND v_day BETWEEN 1 AND 5)
      AND NOT (v_day = 0 AND folga_sunday)
      AND NOT (folga_weekday2 IS NOT NULL AND folga_weekday2 = v_day AND v_day BETWEEN 1 AND 6);

    -- v19: intermediarios disponiveis para virar fechamento, EXCLUINDO quem tem dia especial (entra cedo)
    SELECT COUNT(*) INTO v_int_available FROM _emp_sched es
    WHERE es.pref_shift NOT IN ('abertura', 'fechamento')
      AND NOT (es.folga_weekday = v_day AND v_day BETWEEN 1 AND 5)
      AND NOT (v_day = 0 AND es.folga_sunday)
      AND NOT (es.folga_weekday2 IS NOT NULL AND es.folga_weekday2 = v_day AND v_day BETWEEN 1 AND 6)
      AND NOT (
        (es.responsibilities @> ARRAY['estoque'] AND v_day = ANY(v_store.stock_count_days))
        OR (es.responsibilities @> ARRAY['maquina'] AND v_day = ANY(v_store.machine_wash_days))
      );

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

      -- v19: calcular dia especial ANTES da conversao para fechamento
      v_is_special_day := (
        (v_emp.responsibilities @> ARRAY['estoque'] AND v_day = ANY(v_store.stock_count_days))
        OR
        (v_emp.responsibilities @> ARRAY['maquina'] AND v_day = ANY(v_store.machine_wash_days))
      );

      -- v19: so converte intermediario em fechamento se NAO for dia especial (que entra cedo)
      IF v_emp.pref_shift NOT IN ('abertura', 'fechamento')
         AND NOT v_is_special_day
         AND v_fc_today < v_min_fc_today
         AND v_fc_today >= v_fc_available
         AND v_int_as_fc_today < (v_min_fc_today - v_fc_available)
         AND v_int_available > 0
      THEN
        v_shift_name      := 'Fechamento';
        v_int_as_fc_today := v_int_as_fc_today + 1;
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

      v_slot_time := v_entrada_real;

      IF v_shift_name = 'Abertura' THEN
        v_ab_today    := v_ab_today + 1;
        v_break_start := v_shift.break_start + ((v_ab_today - 1) * INTERVAL '60 minutes');
      ELSIF v_shift_name = 'Fechamento' THEN
        v_fc_today    := v_fc_today + 1;
        v_break_start := v_entrada_real
                         + make_interval(secs => v_horas_liquidas_dia * 3600 * 0.6);
        v_break_start := DATE_TRUNC('hour', v_break_start) +
                         CASE WHEN EXTRACT(MINUTE FROM v_break_start) >= 30
                              THEN INTERVAL '30 minutes' ELSE INTERVAL '0' END;
        v_break_start := v_break_start + ((v_fc_today - 1) * INTERVAL '60 minutes');
      ELSE
        v_int_today   := v_int_today + 1;
        v_break_start := v_shift.break_start + ((v_int_today - 1) * INTERVAL '60 minutes');
      END IF;

      v_break_end := v_break_start + INTERVAL '60 minutes';

      IF v_is_special_day THEN
        v_break_start := v_slot_time + INTERVAL '4 hours';
        v_break_end   := v_break_start + INTERVAL '60 minutes';
      END IF;

      IF v_shift_name = 'Fechamento' AND NOT v_is_special_day THEN
        v_slot_end := v_closing_exit;
      ELSE
        v_slot_end := v_slot_time + v_jornada_bruta;
      END IF;

      IF v_break_end > v_slot_end THEN
        v_break_start := v_slot_time + make_interval(secs => v_horas_liquidas_dia * 3600 * 0.5);
        v_break_end   := v_break_start + INTERVAL '60 minutes';
      END IF;

      IF v_slot_end > v_closing_exit + INTERVAL '30 minutes' THEN
        v_slot_end := v_closing_exit;
      END IF;

      WHILE v_slot_time < v_slot_end LOOP
        v_slot_type := CASE
          WHEN v_slot_time >= v_break_start AND v_slot_time < v_break_end
          THEN 'interval'::slot_type
          ELSE 'work'::slot_type
        END;
        INSERT INTO schedule_slots
          (schedule_id, employee_id, day_of_week, slot_time, slot_type, updated_by)
        VALUES (v_schedule_id, v_emp.id, v_day, v_slot_time, v_slot_type, p_created_by)
        ON CONFLICT (schedule_id, employee_id, day_of_week, slot_time)
        DO UPDATE SET slot_type = EXCLUDED.slot_type;
        v_slots_created := v_slots_created + 1;
        v_slot_time     := v_slot_time + INTERVAL '30 minutes';
      END LOOP;

    END LOOP;
  END LOOP;

  FOR v_emp IN
    SELECT * FROM employees WHERE store_id = p_store_id AND active = true
  LOOP
    SELECT COUNT(DISTINCT day_of_week) INTO v_dias_trabalhados
    FROM schedule_slots
    WHERE schedule_id = v_schedule_id
      AND employee_id = v_emp.id
      AND slot_type   = 'work';

    IF v_emp.work_regime = '5x2' THEN
      v_weekly_hours_emp := COALESCE(v_store.weekly_hours_5x2, 44);
      v_dias_regime      := 5;
    ELSE
      v_weekly_hours_emp := COALESCE(v_store.weekly_hours_6x1, 44);
      v_dias_regime      := 6;
    END IF;

    v_horas_liquidas_dia := v_weekly_hours_emp / v_dias_regime;
    v_week_hours         := v_dias_trabalhados * v_horas_liquidas_dia;

    v_contract_hours := CASE
      WHEN v_emp.role ILIKE '%36h%'
        OR v_emp.role ILIKE '%atendente 1%' THEN 36
      ELSE v_weekly_hours_emp
    END;

    INSERT INTO hours_bank
      (store_id, employee_id, week_start, scheduled_hours, extra_hours)
    VALUES
      (p_store_id, v_emp.id, p_week_start,
       ROUND(v_week_hours::numeric, 2),
       ROUND(GREATEST(0, v_week_hours - v_contract_hours)::numeric, 2))
    ON CONFLICT (store_id, employee_id, week_start)
    DO UPDATE SET
      scheduled_hours = EXCLUDED.scheduled_hours,
      extra_hours     = EXCLUDED.extra_hours,
      updated_at      = NOW();
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

    SELECT COUNT(DISTINCT employee_id) INTO v_working_count
    FROM schedule_slots
    WHERE schedule_id = v_schedule_id AND day_of_week = v_day AND slot_type = 'work';

    v_min_required := CASE
      WHEN v_day = 0 THEN GREATEST(v_store.min_sunday_staff, v_store.min_weekend_staff)
      WHEN v_day = 6 THEN v_store.min_weekend_staff
      ELSE                v_store.min_weekday_staff
    END;

    SELECT COUNT(DISTINCT ss.employee_id) INTO v_ab_working
    FROM schedule_slots ss
    WHERE ss.schedule_id = v_schedule_id AND ss.day_of_week = v_day
      AND ss.slot_type = 'work' AND ss.slot_time <= v_opening_ref;

    SELECT COUNT(DISTINCT ss.employee_id) INTO v_fc_working
    FROM schedule_slots ss
    WHERE ss.schedule_id = v_schedule_id AND ss.day_of_week = v_day
      AND ss.slot_type = 'work'
      AND ss.slot_time >= v_closing_exit - INTERVAL '2 hours';

    SELECT COUNT(DISTINCT ss.employee_id) INTO v_int_working
    FROM schedule_slots ss
    WHERE ss.schedule_id = v_schedule_id AND ss.day_of_week = v_day
      AND ss.slot_type = 'work'
      AND ss.employee_id NOT IN (
            SELECT DISTINCT ss2.employee_id FROM schedule_slots ss2
            WHERE ss2.schedule_id = v_schedule_id AND ss2.day_of_week = v_day
              AND ss2.slot_type = 'work' AND ss2.slot_time <= v_opening_ref)
      AND ss.employee_id NOT IN (
            SELECT DISTINCT ss3.employee_id FROM schedule_slots ss3
            WHERE ss3.schedule_id = v_schedule_id AND ss3.day_of_week = v_day
              AND ss3.slot_type = 'work'
              AND ss3.slot_time >= v_closing_exit - INTERVAL '2 hours');

    DECLARE
      v_min_ab INT := CASE WHEN v_day IN (0,6) THEN v_store.min_opening_weekend ELSE v_store.min_opening_staff END;
      v_min_fc INT := GREATEST(
                        CASE WHEN v_day IN (0,6) THEN v_store.min_closing_weekend ELSE v_store.min_closing_staff END,
                        CASE WHEN v_working_count >= 4 THEN 2 ELSE 0 END);
      v_ab_gap INT := GREATEST(0, v_min_ab - v_ab_working);
      v_fc_gap INT := GREATEST(0, v_min_fc - v_fc_working);
    BEGIN
      FOR v_fl_i IN 1..v_ab_gap LOOP
        IF v_working_count + v_fl_i - 1 < v_min_required THEN CONTINUE; END IF;
        INSERT INTO freelancer_slots (schedule_id, store_id, day_of_week, shift_name, rule_origin)
        VALUES (v_schedule_id, p_store_id, v_day, 'Abertura',
                CASE WHEN v_day = 0 THEN 'R4' WHEN v_day = 6 THEN 'R19' ELSE 'R1' END);
        v_freelancers_created := v_freelancers_created + 1;
        v_ab_working := v_ab_working + 1;
      END LOOP;
      FOR v_fl_i IN 1..v_fc_gap LOOP
        IF v_working_count + v_fl_i - 1 < v_min_required THEN CONTINUE; END IF;
        INSERT INTO freelancer_slots (schedule_id, store_id, day_of_week, shift_name, rule_origin)
        VALUES (v_schedule_id, p_store_id, v_day, 'Fechamento',
                CASE WHEN v_day = 0 THEN 'R4' WHEN v_day = 6 THEN 'R19' ELSE 'R2' END);
        v_freelancers_created := v_freelancers_created + 1;
        v_fc_working := v_fc_working + 1;
      END LOOP;
    END;

    v_gap := GREATEST(0, v_min_required - v_working_count);
    IF v_gap = 0 THEN CONTINUE; END IF;

    FOR v_fl_i IN 1..v_gap LOOP
      IF v_ab_working < (CASE WHEN v_day IN (0,6) THEN v_store.min_opening_weekend ELSE v_store.min_opening_staff END) THEN
        v_fl_shift := 'Abertura'; v_ab_working := v_ab_working + 1;
      ELSIF v_fc_working < (CASE WHEN v_day IN (0,6) THEN v_store.min_closing_weekend ELSE v_store.min_closing_staff END) THEN
        v_fl_shift := 'Fechamento'; v_fc_working := v_fc_working + 1;
      ELSE
        v_fl_shift := 'Intermediário'; v_int_working := v_int_working + 1;
      END IF;
      INSERT INTO freelancer_slots (schedule_id, store_id, day_of_week, shift_name, rule_origin)
      VALUES (v_schedule_id, p_store_id, v_day, v_fl_shift,
              CASE WHEN v_day = 0 THEN 'R4' WHEN v_day = 6 THEN 'R19' ELSE 'R18' END);
      v_freelancers_created := v_freelancers_created + 1;
    END LOOP;

    v_violations := v_violations || jsonb_build_object(
      'rule_code',    CASE WHEN v_day = 0 THEN 'R4' WHEN v_day = 6 THEN 'R19' ELSE 'R18' END,
      'severity',     'warning', 'day_of_week', v_day,
      'employee_ids', to_jsonb(ARRAY[]::text[]),
      'message',
        (CASE WHEN v_day = 0 THEN 'R4' WHEN v_day = 6 THEN 'R19' ELSE 'R18' END)
        || ': ' || v_working_count || '/' || v_min_required
        || ' no dia ' || v_day || ' — ' || v_gap || ' vaga(s) freelancer gerada(s)'
    );
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

    SELECT COUNT(DISTINCT employee_id) INTO v_working_count
    FROM schedule_slots
    WHERE schedule_id = v_schedule_id AND day_of_week = v_day AND slot_type = 'work';

    SELECT COUNT(DISTINCT ss.employee_id) INTO v_ab_count
    FROM schedule_slots ss
    WHERE ss.schedule_id = v_schedule_id AND ss.day_of_week = v_day
      AND ss.slot_type = 'work'
      AND ss.slot_time >= v_opening_ref - INTERVAL '2 hours'
      AND ss.slot_time <= v_opening_ref;
    IF COALESCE(v_ab_count,0) < (CASE WHEN v_day IN (0,6) THEN v_store.min_opening_weekend ELSE v_store.min_opening_staff END) THEN
      SELECT COUNT(*) INTO v_int_count FROM freelancer_slots
      WHERE schedule_id = v_schedule_id AND day_of_week = v_day
        AND shift_name IN ('Abertura','Intermediário');
      v_violations := v_violations || jsonb_build_object(
        'rule_code','R1','severity',CASE WHEN v_int_count > 0 THEN 'warning' ELSE 'critical' END,
        'day_of_week',v_day,'employee_ids',to_jsonb(ARRAY[]::text[]),
        'message','R1: '||COALESCE(v_ab_count,0)||'/'
          ||(CASE WHEN v_day IN (0,6) THEN v_store.min_opening_weekend ELSE v_store.min_opening_staff END)
          ||' na abertura (dia '||v_day||')'
          ||CASE WHEN v_int_count > 0 THEN ' — coberto por freelancer' ELSE ' — sem cobertura' END
      );
    END IF;

    SELECT COUNT(DISTINCT ss.employee_id) INTO v_fc_count
    FROM schedule_slots ss
    WHERE ss.schedule_id = v_schedule_id AND ss.day_of_week = v_day
      AND ss.slot_type = 'work'
      AND ss.slot_time >= v_closing_exit - INTERVAL '2 hours';
    v_min_fc_today := GREATEST(
                        CASE WHEN v_day IN (0,6) THEN v_store.min_closing_weekend ELSE v_store.min_closing_staff END,
                        CASE WHEN v_working_count >= 4 THEN 2 ELSE 0 END);
    IF COALESCE(v_fc_count,0) < v_min_fc_today THEN
      SELECT COUNT(*) INTO v_int_count FROM freelancer_slots
      WHERE schedule_id = v_schedule_id AND day_of_week = v_day
        AND shift_name IN ('Fechamento','Intermediário');
      v_violations := v_violations || jsonb_build_object(
        'rule_code','R2','severity',CASE WHEN v_int_count > 0 THEN 'warning' ELSE 'critical' END,
        'day_of_week',v_day,'employee_ids',to_jsonb(ARRAY[]::text[]),
        'message','R2: '||COALESCE(v_fc_count,0)||'/'|| v_min_fc_today
          ||' no fechamento (dia '||v_day||')'
          ||CASE WHEN v_int_count > 0 THEN ' — coberto por freelancer' ELSE ' — sem cobertura' END
      );
    END IF;

    v_r16_threshold := GREATEST(3, CEIL(v_working_count::DECIMAL / 3));

    FOR v_slot_time IN
      SELECT DISTINCT slot_time FROM schedule_slots
      WHERE schedule_id = v_schedule_id AND day_of_week = v_day AND slot_type = 'interval'
    LOOP
      SELECT COUNT(*) INTO v_int_count FROM schedule_slots
      WHERE schedule_id = v_schedule_id AND day_of_week = v_day
        AND slot_time = v_slot_time AND slot_type = 'interval';
      IF v_int_count >= v_r16_threshold THEN
        v_violations := v_violations || jsonb_build_object(
          'rule_code','R16','severity','critical','day_of_week',v_day,
          'slot_time',v_slot_time::TEXT,'employee_ids',to_jsonb(ARRAY[]::text[]),
          'message','R16: '||v_int_count||' em intervalo às '||v_slot_time::TEXT
            ||' (dia '||v_day||') — threshold='||v_r16_threshold
        );
      END IF;
    END LOOP;
  END LOOP;

  IF array_length(v_violations, 1) > 0 THEN
    INSERT INTO rule_violations
      (schedule_id, store_id, rule_code, severity, day_of_week, message, employee_ids, resolved)
    SELECT v_schedule_id, p_store_id,
      (v->>'rule_code')::TEXT, (v->>'severity')::severity_type,
      (v->>'day_of_week')::INT, (v->>'message')::TEXT, ARRAY[]::UUID[], false
    FROM unnest(v_violations) AS v;
  END IF;

  RETURN jsonb_build_object(
    'success',             true,
    'schedule_id',         v_schedule_id,
    'slots_created',       v_slots_created,
    'freelancers_created', v_freelancers_created,
    'violations_count',    COALESCE(array_length(v_violations,1), 0),
    'violations',          to_jsonb(v_violations)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success',false,'error',SQLERRM,'detail',SQLSTATE);
END;
$function$;