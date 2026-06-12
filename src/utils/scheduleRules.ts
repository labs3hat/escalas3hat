import { SLOT_KEYS, type Employee, type ScheduleSlot, type Store } from "@/types";
import { BUSINESS_RULES } from "@/constants";
import { formatters } from "@/lib/formatters";

export interface RuleViolation {
  employeeId?: string;
  dayOfWeek: number;
  type: 'error' | 'warning';
  message: string;
}

export const MAX_OFF_PER_DAY = (employeeCount: number) => {
  if (employeeCount <= 4) return 1;
  if (employeeCount <= 8) return 2;
  return 3;
};

export function validateScheduleRules(
  employees: Employee[],
  slots: ScheduleSlot[],
  store?: Store,
  newChange?: {
    employeeId: string;
    dayOfWeek: number;
    type: 'work' | 'day_off' | 'empty';
    payload?: { entry: string; exit: string; breakStart?: string; breakEnd?: string };
  }
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const days = [0, 1, 2, 3, 4, 5, 6];

  days.forEach(dow => {
    // 1. Validação de folgas simultâneas
    const offEmps = employees.filter(emp => {
      if (newChange && newChange.employeeId === emp.id && newChange.dayOfWeek === dow) {
        return newChange.type === 'day_off';
      }
      return slots.some(s => s.employee_id === emp.id && s.day_of_week === dow && s.slot_type === 'day_off');
    });

    const maxOff = MAX_OFF_PER_DAY(employees.length);
    if (offEmps.length > maxOff) {
      violations.push({
        dayOfWeek: dow,
        type: 'error',
        message: `Excesso de folgas: ${offEmps.length} pessoas de folga. Máximo permitido: ${maxOff}.`
      });
    }

    // 2. Validação de abertura e fechamento (se store fornecida)
    if (store) {
      const isWknd = dow === 0 || dow === 6;
      
      // Abertura
      const rawOpening = (dow === 0 ? store.opening_time_sunday : (dow === 6 ? store.opening_time_saturday : store.opening_time_weekday)) || '10:00';
      const openingTime = formatters.time(rawOpening);
      
      const abCount = employees.filter(emp => {
        if (newChange && newChange.employeeId === emp.id && newChange.dayOfWeek === dow) {
          if (newChange.type !== 'work' || !newChange.payload) return false;
          return openingTime >= newChange.payload.entry && openingTime < newChange.payload.exit && openingTime !== (newChange.payload.breakStart);
        }
        return slots.some(s => s.employee_id === emp.id && s.day_of_week === dow && s.slot_time === openingTime && s.slot_type === 'work');
      }).length;

      const minOpening = isWknd ? (store.min_opening_weekend ?? 1) : (store.min_opening_staff ?? 1);
      if (abCount < minOpening) {
        violations.push({
          dayOfWeek: dow,
          type: 'error',
          message: `R1: Abertura com ${abCount} func. (mínimo obrigatório: ${minOpening})`
        });
      }

      // Fechamento
      const rawClosing = (dow === 0 ? (store.closing_time_sunday || store.closing_time_weekday) : (dow === 6 ? (store.closing_time_saturday || store.closing_time_weekday) : store.closing_time_weekday)) || '22:00';
      const closingTime = formatters.time(rawClosing);
      
      // Slot anterior ao fechamento
      const [h, m] = closingTime.split(':').map(Number);
      const dateRef = new Date(2000, 0, 1, h, m);
      dateRef.setMinutes(dateRef.getMinutes() - 30);
      const checkClosing = `${String(dateRef.getHours()).padStart(2, '0')}:${String(dateRef.getMinutes()).padStart(2, '0')}`;

      const fcCount = employees.filter(emp => {
        if (newChange && newChange.employeeId === emp.id && newChange.dayOfWeek === dow) {
          if (newChange.type !== 'work' || !newChange.payload) return false;
          return checkClosing >= newChange.payload.entry && checkClosing < newChange.payload.exit && checkClosing !== (newChange.payload.breakStart);
        }
        return slots.some(s => s.employee_id === emp.id && s.day_of_week === dow && s.slot_time === checkClosing && s.slot_type === 'work');
      }).length;

      const minClosing = isWknd ? (store.min_closing_weekend ?? 2) : (store.min_closing_staff ?? 2);
      if (fcCount < minClosing) {
        violations.push({
          dayOfWeek: dow,
          type: 'error',
          message: `R2: Fechamento com ${fcCount} func. (mínimo obrigatório: ${minClosing})`
        });
      }
    }

    // 3. Validação de intervalos simultâneos (R16) e Carga Horária Máxima (R18)
    SLOT_KEYS.forEach((slotTime, idx) => {
      const inBreak = employees.filter(emp => {
        if (newChange && newChange.employeeId === emp.id && newChange.dayOfWeek === dow) {
          if (newChange.type !== 'work' || !newChange.payload?.breakStart || !newChange.payload?.breakEnd) return false;
          return slotTime >= newChange.payload.breakStart && slotTime < newChange.payload.breakEnd;
        }
        return slots.some(s => s.employee_id === emp.id && s.day_of_week === dow && s.slot_time === slotTime && s.slot_type === 'interval');
      });

      if (inBreak.length >= 2) {
        // R16: Apenas alerta se os intervalos iniciarem exatamente no mesmo slot
        const starters = inBreak.filter(emp => {
          const prevSlot = idx > 0 ? SLOT_KEYS[idx - 1] : null;
          
          if (newChange && newChange.employeeId === emp.id && newChange.dayOfWeek === dow) {
            return slotTime === newChange.payload?.breakStart;
          }
          
          const isAtSlot = slots.some(s => s.employee_id === emp.id && s.day_of_week === dow && s.slot_time === slotTime && s.slot_type === 'interval');
          const wasAtPrevSlot = prevSlot ? slots.some(s => s.employee_id === emp.id && s.day_of_week === dow && s.slot_time === prevSlot && s.slot_type === 'interval') : false;
          
          return isAtSlot && !wasAtPrevSlot;
        });

        if (starters.length >= 2) {
          violations.push({
            dayOfWeek: dow,
            type: 'warning',
            message: `R16: Conflito de início de intervalo às ${slotTime}: ${starters.map(e => e.name.split(' ')[0]).join(', ')} iniciaram juntos.`
          });
        }
      }
    });

    // R18: Carga horária máxima contínua (6h sem intervalo)
    employees.forEach(emp => {
      let currentWork = 0;
      
      const empSlots = SLOT_KEYS.map(slotTime => {
        if (newChange && newChange.employeeId === emp.id && newChange.dayOfWeek === dow) {
          if (newChange.type === 'day_off') return 'day_off';
          if (newChange.type === 'empty') return 'empty';
          if (newChange.payload && slotTime >= newChange.payload.entry && slotTime < newChange.payload.exit) {
            if (newChange.payload.breakStart && newChange.payload.breakEnd && slotTime >= newChange.payload.breakStart && slotTime < newChange.payload.breakEnd) {
              return 'interval';
            }
            return 'work';
          }
          return 'empty';
        }
        return slots.find(s => s.employee_id === emp.id && s.day_of_week === dow && s.slot_time === slotTime)?.slot_type || 'empty';
      });

      empSlots.forEach(type => {
        if (type === 'work') {
          currentWork += BUSINESS_RULES.SLOT_DURATION_MINS;
        } else {
          currentWork = 0;
        }

        if (currentWork > BUSINESS_RULES.MAX_WORK_BEFORE_BREAK_MINS) {
          violations.push({
            employeeId: emp.id,
            dayOfWeek: dow,
            type: 'error',
            message: `R18: ${emp.name.split(' ')[0]} está trabalhando há mais de 6h seguidas.`
          });
        }
      });
    });
  });

  return violations;
}


