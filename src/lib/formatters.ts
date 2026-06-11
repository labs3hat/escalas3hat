import { format as dfFormat } from "date-fns";
import { ptBR } from "date-fns/locale";

export const formatters = {
  date(date: Date | string, pattern: string = "dd/MM/yyyy"): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return dfFormat(d, pattern, { locale: ptBR });
  },

  time(time: string): string {
    // Normalizes "08:00:00" or "8:00" to "08:00"
    if (!time) return "";
    const parts = time.split(':');
    const h = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    return `${h}:${m}`;
  },

  weekRange(start: Date, end: Date): string {
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return `${start.getDate()} – ${end.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`;
  }
};
