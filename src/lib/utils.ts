import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Employee, Store } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getContractWeeklyHours(emp: Employee | { role: string; work_regime: string }, store?: Store | { weekly_hours_6x1: number | null; weekly_hours_5x2: number | null }): number {
  const r = (emp.role || '').toLowerCase();
  // Se o cargo contém 36h ou atendente 1, o contrato é 36h
  if (r.includes('36h') || r.includes('atendente 1')) return 36;
  
  // Caso contrário, usa o valor configurado na loja ou o padrão 44h
  const base = emp.work_regime === '5x2' ? store?.weekly_hours_5x2 : store?.weekly_hours_6x1;
  return Number(base ?? 44);
}
