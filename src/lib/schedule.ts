/**
 * Regras de negócio de horas — fonte única da verdade.
 * Qualquer cálculo de horas no sistema deve passar por aqui.
 */

// Duração de cada slot em horas
export const SLOT_DURATION_H = 0.5

// Intervalo obrigatório descontado da jornada
export const INTERVAL_H = 1

// Limites semanais por tipo de contrato
export const WEEKLY_LIMIT_44 = 44
export const WEEKLY_LIMIT_36 = 36

/**
 * Retorna o limite semanal de horas do funcionário.
 * Regra: role ILIKE '%36h%' → 36h | demais → 44h
 */
export function weeklyLimit(role: string): number {
  return role.toLowerCase().includes('36h') ? WEEKLY_LIMIT_36 : WEEKLY_LIMIT_44
}

/**
 * Calcula horas líquidas a partir de slots de trabalho.
 * Desconta 1h de intervalo se houver pelo menos 1 slot de trabalho.
 * Nunca retorna negativo.
 */
export function calcLiquidHours(workSlotsCount: number): number {
  if (workSlotsCount === 0) return 0
  const gross = workSlotsCount * SLOT_DURATION_H
  return Math.max(0, gross - INTERVAL_H)
}

/**
 * Calcula o total de horas líquidas na semana para um funcionário.
 * Recebe a função getSlot e os 7 dias da semana.
 */
export function calcWeekLiquidHours(
  employeeId: string,
  weekDaysOfWeek: number[],
  getSlot: (empId: string, dow: number, slot: string) => string,
  slotKeys: string[]
): number {
  let total = 0
  for (const dow of weekDaysOfWeek) {
    const workCount = slotKeys.filter(
      s => getSlot(employeeId, dow, s) === 'work'
    ).length
    total += calcLiquidHours(workCount)
  }
  return Math.round(total * 10) / 10
}
