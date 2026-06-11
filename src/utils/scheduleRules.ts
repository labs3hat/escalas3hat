import { SLOT_KEYS, type Employee, type ScheduleSlot } from "@/types";

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
  newChange?: {
    employeeId: string;
    dayOfWeek: number;
    type: 'work' | 'day_off' | 'empty';
    payload?: { entry: string; exit: string; breakStart?: string; breakEnd?: string };
  }
): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // Agrupar slots por dia para validações diárias
  const days = [0, 1, 2, 3, 4, 5, 6];

  days.forEach(dow => {
    // 1. Validação de Folgas Simultâneas
    const offEmps = employees.filter(emp => {
      // Se for o funcionário sendo alterado agora
      if (newChange && newChange.employeeId === emp.id && newChange.dayOfWeek === dow) {
        return newChange.type === 'day_off';
      }
      // Senão verifica os slots existentes
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

    // 2. Validação de Intervalos Simultâneos
    // Verifica se mais de uma pessoa está em intervalo no mesmo slot
    SLOT_KEYS.forEach(slotTime => {
      const inBreak = employees.filter(emp => {
        if (newChange && newChange.employeeId === emp.id && newChange.dayOfWeek === dow) {
          if (newChange.type !== 'work' || !newChange.payload?.breakStart || !newChange.payload?.breakEnd) return false;
          return slotTime >= newChange.payload.breakStart && slotTime < newChange.payload.breakEnd;
        }
        return slots.some(s => s.employee_id === emp.id && s.day_of_week === dow && s.slot_time === slotTime && s.slot_type === 'interval');
      });

      if (inBreak.length > 1) {
        violations.push({
          dayOfWeek: dow,
          type: 'warning',
          message: `Conflito de intervalo às ${slotTime}: ${inBreak.map(e => e.name.split(' ')[0]).join(', ')} estão em pausa.`
        });
      }
    });

    // 3. Validação de Carga Horária Contínua (Máx 6h sem pausa)
    employees.forEach(emp => {
      let currentWork = 0;
      let hasBreak = false;
      
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
          currentWork += 30;
        } else if (type === 'interval') {
          hasBreak = true;
          currentWork = 0;
        } else {
          currentWork = 0;
        }

        if (currentWork > 360) { // 6 horas = 360 minutos
          violations.push({
            employeeId: emp.id,
            dayOfWeek: dow,
            type: 'error',
            message: `${emp.name.split(' ')[0]} está trabalhando há mais de 6h sem intervalo.`
          });
        }
      });
    });
  });

  return violations;
}
