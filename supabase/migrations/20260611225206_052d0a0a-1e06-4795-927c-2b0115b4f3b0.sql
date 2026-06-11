CREATE OR REPLACE FUNCTION public.generate_base_schedule(p_store_id uuid, p_week_start date, p_created_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
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
  v_emp_index           INT := 0;
  v_target_offs         INT;
  v_offs_count          INT;
  v_is_stock_day        BOOLEAN;
  v_is_wash_day         BOOLEAN;
  v_is_responsible      BOOLEAN;
  v_sunday_is_off       BOOLEAN;
  v_calculated_off_day  INT;
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

  FOR v_emp IN
    SELECT e.* FROM employees e 
    WHERE e.store_id = p_store_id AND e.active = true
    ORDER BY e.created_at ASC
  LOOP
    -- DETERMINAÇÃO DO ALVO DE FOLGAS SEMANAIS
    -- 5x2 -> Sempre 2 folgas na semana.
    -- 6x1 -> 1 folga na semana. Se folgar no domingo, ganha +1 folga na semana (total 2 folgas naquela semana específica).
    
    SELECT sunday_date INTO v_fixed_sunday
    FROM monthly_sunday_off
    WHERE store_id = p_store_id AND employee_id = v_emp.id AND month_year = v_month_year;
    
    v_sunday_is_off := (v_fixed_sunday IS NOT NULL AND v_fixed_sunday >= p_week_start AND v_fixed_sunday < p_week_start + 7);
    
    IF v_emp.work_regime = '5x2' THEN
      v_target_offs := 2; -- Domingo de folga conta como 1 das 2 folgas.
    ELSE
      -- 6x1: Se folga domingo, precisa de +1 na semana. Se não folga domingo, apenas 1 na semana.
      v_target_offs := CASE WHEN v_sunday_is_off THEN 2 ELSE 1 END;
    END IF;

    v_offs_count := 0;
    v_emp_index := v_emp_index + 1;

    FOR v_day IN 0..6 LOOP
      v_current_date := p_week_start + v_day;
      v_dow := EXTRACT(DOW FROM v_current_date)::INT; 
      
      v_is_stock_day := (v_dow = ANY(v_store.stock_count_days));
      v_is_wash_day := (v_dow = ANY(v_store.machine_wash_days));
      v_is_responsible := (v_is_stock_day AND 'estoque' = ANY(v_emp.responsibilities)) OR
                          (v_is_wash_day AND 'maquina' = ANY(v_emp.responsibilities));

      v_slot_type_val := 'work'; 
      
      -- 1. Verificar folga de Domingo (se aplica a ambos os regimes como folga prioritária)
      IF v_dow = 0 AND v_sunday_is_off THEN
        v_slot_type_val := 'day_off';
        v_offs_count := v_offs_count + 1;
      
      -- 2. Distribuir as folgas restantes entre Segunda e Sexta (proporcionalmente)
      ELSIF v_dow >= 1 AND v_dow <= 5 AND v_offs_count < v_target_offs THEN
        -- Se tem dia fixo e é hoje
        IF v_emp.fixed_day_off = v_dow AND NOT v_is_responsible THEN
          v_slot_type_val := 'day_off';
          v_offs_count := v_offs_count + 1;
        -- Senão, usa distribuição rotativa baseada no índice do funcionário (emp_index % 5 + 1)
        ELSIF (v_emp_index % 5) + 1 = v_dow AND NOT v_is_responsible AND (v_emp.fixed_day_off IS NULL OR v_emp.fixed_day_off = 0) THEN
          v_slot_type_val := 'day_off';
          v_offs_count := v_offs_count + 1;
        END IF;
      END IF;

      -- Se chegamos no Sábado e ainda falta folga (ex: v_is_responsible bloqueou dia de semana), tenta folgar sábado
      IF v_dow = 6 AND v_offs_count < v_target_offs AND NOT v_is_responsible THEN
        v_slot_type_val := 'day_off';
        v_offs_count := v_offs_count + 1;
      END IF;

      IF v_slot_type_val = 'day_off' THEN
        INSERT INTO schedule_slots (schedule_id, employee_id, day_of_week, slot_time, slot_type, updated_by)
        VALUES (v_schedule_id, v_emp.id, v_dow, '08:00', 'day_off', p_created_by);
        v_slots_created := v_slots_created + 1;
        
        IF v_dow = 0 THEN
          INSERT INTO sunday_off_tracking (store_id, employee_id, month_year, week_start, sundays_off)
          VALUES (p_store_id, v_emp.id, v_month_year, p_week_start, 1)
          ON CONFLICT (store_id, employee_id, month_year, week_start) DO UPDATE SET sundays_off = 1;
        END IF;
      ELSE
        v_shift_name := COALESCE(v_emp.preferred_shift, 'abertura');
        
        IF v_dow = 0 THEN 
          v_entrada_real := COALESCE(v_store.opening_time_sunday, '11:00'::TIME);
          v_exit_time := COALESCE(v_store.closing_time_sunday, '20:00'::TIME);
        ELSIF v_dow = 6 THEN
          v_entrada_real := COALESCE(v_store.opening_time_saturday, '09:00'::TIME);
          v_exit_time := COALESCE(v_store.closing_time_saturday, '22:00'::TIME);
        ELSE
          v_entrada_real := COALESCE(v_store.opening_time_weekday, '09:00'::TIME);
          v_exit_time := COALESCE(v_store.closing_time_weekday, '22:00'::TIME);
        END IF;

        IF v_shift_name = 'fechamento' THEN
          v_entrada_real := v_exit_time - INTERVAL '9 hours';
        ELSIF v_shift_name = 'intermediario' THEN
          v_entrada_real := v_entrada_real + INTERVAL '3 hours';
          v_exit_time := v_entrada_real + INTERVAL '9 hours';
        ELSE
          v_exit_time := v_entrada_real + INTERVAL '9 hours';
        END IF;

        v_interval_start := v_entrada_real + INTERVAL '4 hours';
        v_interval_end := v_interval_start + INTERVAL '1 hour';
        v_current_time := v_entrada_real;

        WHILE v_current_time < v_exit_time LOOP
          v_slot_type_val := CASE WHEN v_current_time >= v_interval_start AND v_current_time < v_interval_end THEN 'interval'::slot_type ELSE 'work'::slot_type END;
          
          INSERT INTO schedule_slots (schedule_id, employee_id, day_of_week, slot_time, slot_type, updated_by)
          VALUES (v_schedule_id, v_emp.id, v_dow, TO_CHAR(v_current_time, 'HH24:MI'), v_slot_type_val, p_created_by);
          
          v_current_time := v_current_time + INTERVAL '30 minutes';
          v_slots_created := v_slots_created + 1;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'weeks_generated', 1,
    'slots_created', v_slots_created
  );
END;
$function$