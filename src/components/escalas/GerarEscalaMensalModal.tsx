import { useEffect, useMemo, useState } from "react";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, startOfWeek, endOfWeek, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Shuffle, X, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Employee, Store } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  store: Store;
  employees: Employee[];
  monthDate: Date;
  onGenerated: () => void;
}

export default function GerarEscalaMensalModal({
  open,
  onClose,
  store,
  employees,
  monthDate,
  onGenerated,
}: Props) {
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);

  const monthFirst = useMemo(() => startOfMonth(monthDate), [monthDate]);
  const monthYear = useMemo(() => format(monthFirst, "yyyy-MM"), [monthFirst]);
  const monthLabel = useMemo(
    () => format(monthFirst, "MMMM 'de' yyyy", { locale: ptBR }),
    [monthFirst],
  );

  const sundays = useMemo(() => {
    return eachDayOfInterval({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) })
      .filter((d) => d.getDay() === 0)
      .map((d) => format(d, "yyyy-MM-dd"));
  }, [monthDate]);

  // Carregar definições já existentes do mês (pré-preenche)
  useEffect(() => {
    if (!open || !store?.id) return;
    setLoadingExisting(true);
    setConfirming(false);
    (async () => {
      const { data } = await (supabase as any)
        .from("monthly_sunday_off")
        .select("employee_id, sunday_date")
        .eq("store_id", store.id)
        .eq("month_year", monthYear);
      const next: Record<string, string> = {};
      (data ?? []).forEach((row: any) => {
        next[row.employee_id] = String(row.sunday_date).slice(0, 10);
      });
      setAssignments(next);
      setLoadingExisting(false);
    })();
  }, [open, store?.id, monthYear]);

  function distributeAutomatically() {
    if (sundays.length === 0) return;
    const next: Record<string, string> = {};
    employees.forEach((emp, idx) => {
      next[emp.id] = sundays[idx % sundays.length];
    });
    setAssignments(next);
    toast.success("Domingos distribuídos automaticamente");
  }

  function setAssignment(employeeId: string, sundayDate: string) {
    setAssignments((prev) => ({ ...prev, [employeeId]: sundayDate }));
  }

  async function startGeneration() {
    // Verifica se já existem escalas geradas no mês
    const weeksFirst = format(startOfWeek(monthFirst, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const weeksLast = format(endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const { data: existing } = await supabase
      .from("schedules")
      .select("id")
      .eq("store_id", store.id)
      .gte("week_start", weeksFirst)
      .lte("week_start", weeksLast)
      .limit(1);

    if (existing && existing.length > 0) {
      setConfirming(true);
      return;
    }
    await runGeneration();
  }

  async function runGeneration() {
    setConfirming(false);
    setGenerating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = employees
        .filter((e) => assignments[e.id])
        .map((e) => ({ employee_id: e.id, sunday_date: assignments[e.id] }));

      const { data, error } = await (supabase as any).rpc("generate_monthly_schedule", {
        p_store_id: store.id,
        p_month_start: format(monthFirst, "yyyy-MM-dd"),
        p_assignments: payload,
        p_created_by: user?.id,
      });
      const result = data as
        | { success?: boolean; error?: string; weeks_generated?: number; slots_created?: number }
        | null;
      if (error || result?.success === false) {
        toast.error((error?.message ?? result?.error) || "Erro ao gerar escala mensal");
        return;
      }
      toast.success(
        `Escala mensal gerada: ${result?.weeks_generated ?? 0} semana(s), ${result?.slots_created ?? 0} slots`,
      );
      onGenerated();
      onClose();
    } finally {
      setGenerating(false);
    }
  }

  if (!open) return null;

  const assignedCount = employees.filter((e) => assignments[e.id]).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
              <CalendarDays size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 leading-tight">Gerar Escala Mensal</h2>
              <p className="text-sm text-gray-500 capitalize">
                {monthLabel} · {store.code}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-50"
          >
            <X size={18} />
          </button>
        </div>

        {confirming ? (
          <div className="px-6 py-8 flex-1 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
              <CalendarDays size={24} />
            </div>
            <p className="text-sm text-gray-700 max-w-md">
              Já existem escalas geradas para este período. Esta ação poderá alterar escalas já
              criadas, inclusive datas passadas. Deseja realmente continuar?
            </p>
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={() => setConfirming(false)}
                className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={runGeneration}
                disabled={generating}
                className="text-sm px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {generating && <Loader2 size={14} className="animate-spin" />}
                Prosseguir
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="px-6 py-3 flex items-center justify-between gap-3 border-b border-gray-50">
              <p className="text-xs text-gray-500">
                Defina o domingo de folga de cada colaborador. Essas folgas ficam fixas e não são
                alteradas por gerações semanais.
              </p>
              <button
                onClick={distributeAutomatically}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 whitespace-nowrap"
              >
                <Shuffle size={13} />
                Distribuir automaticamente
              </button>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-auto px-6 py-3">
              {loadingExisting ? (
                <div className="flex items-center justify-center py-10 text-gray-400 text-sm">
                  <Loader2 size={16} className="animate-spin mr-2" /> Carregando...
                </div>
              ) : employees.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">
                  Nenhum colaborador ativo nesta loja.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {employees.map((emp) => (
                    <div
                      key={emp.id}
                      className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: emp.color }}
                        />
                        <span className="text-sm text-gray-800 truncate">{emp.name}</span>
                      </div>
                      <select
                        value={assignments[emp.id] ?? ""}
                        onChange={(e) => setAssignment(emp.id, e.target.value)}
                        className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-brand-400 min-w-[150px]"
                      >
                        <option value="">— sem definição —</option>
                        {sundays.map((s) => (
                          <option key={s} value={s}>
                            Dom, {format(new Date(s + "T00:00:00"), "dd/MM")}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
              <span className="text-xs text-gray-500">
                {assignedCount}/{employees.length} colaboradores com domingo definido
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={startGeneration}
                  disabled={generating || employees.length === 0}
                  className="text-sm px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  {generating && <Loader2 size={14} className="animate-spin" />}
                  Gerar Escala Mensal
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
