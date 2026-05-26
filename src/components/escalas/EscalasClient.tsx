import { useState, useMemo } from "react";
import { addDays, startOfWeek, format, subWeeks, addWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Copy, Send, Check, AlertTriangle, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Profile, Store } from "@/types";
import { SLOT_KEYS, DAY_NAMES, MONTHS } from "@/types";
import { useEmployees } from "@/hooks/useEmployees";
import { useSchedule } from "@/hooks/useSchedule";
import GradeHoraria from "./GradeHoraria";
import ResumoSemanal from "./ResumoSemanal";
import PainelAlertas from "./PainelAlertas";
// ── NOVO ──────────────────────────────────────────────────────
import { useFreelancerSlots } from "./FreelancerSlots";
import FreelancerSlots from "./FreelancerSlots";
// ──────────────────────────────────────────────────────────────

interface Props {
  profile: Profile | null;
  initialStores: Store[];
}

export default function EscalasClient({ profile, initialStores }: Props) {
  const [selectedStore, setSelectedStore] = useState<Store>(initialStores[0]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [view, setView] = useState<"grade" | "resumo" | "freelancers">("grade");
  const [publishing, setPublishing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 });
    return weekOffset >= 0 ? addWeeks(base, weekOffset) : subWeeks(base, Math.abs(weekOffset));
  }, [weekOffset]);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const { employees } = useEmployees(selectedStore?.id ?? null);
  const { schedule, loading, updateDay, publish, copyPreviousWeek, getSlot, reload } = useSchedule(
    selectedStore?.id ?? null,
    weekStart,
  );

  // Freelancers: contagem informativa (NÃO bloqueia publicação)
  const { openCount } = useFreelancerSlots(schedule?.id ?? null);

  const weekLabel = useMemo(() => {
    const s = weekDates[0],
      e = weekDates[6];
    return `${s.getDate()} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
  }, [weekDates]);

  // Publicação sempre permitida; vagas freelancer em aberto viram apenas aviso
  async function handlePublish() {
    setPublishing(true);
    try {
      await publish();
      toast.success("Escala publicada com sucesso");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao publicar escala");
    } finally {
      setPublishing(false);
    }
  }

  // Edição pós-publicação: pede motivo e registra em schedule_changes
  async function updateDayWithAudit(
    employeeId: string,
    dayOfWeek: number,
    type: "work" | "day_off" | "empty",
    payload?: { entry: string; exit: string; breakStart?: string; breakEnd?: string },
  ) {
    if (schedule?.status === "published") {
      const reason = window.prompt("Esta escala está publicada. Informe o motivo da alteração:");
      if (!reason || !reason.trim()) {
        toast.error("Motivo obrigatório para editar escala publicada.");
        return;
      }
      await updateDay(employeeId, dayOfWeek, type, payload);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("schedule_changes").insert({
        schedule_id: schedule.id,
        store_id: selectedStore.id,
        change_type: "shift_change" as any,
        employee_id: employeeId,
        day_of_week: dayOfWeek,
        after_value: (payload ?? { type }) as any,
        notes: reason.trim(),
        created_by: user?.id as string,
      });
      toast.success("Alteração registrada");
    } else {
      await updateDay(employeeId, dayOfWeek, type, payload);
    }
  }

  async function handleCopy() {
    setCopying(true);
    await copyPreviousWeek(employees);
    toast.success("Semana anterior copiada!");
    setCopying(false);
  }

  async function handleGenerate() {
    if (!selectedStore) return;
    setGenerating(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const weekKey = format(weekStart, "yyyy-MM-dd");
    const { data, error } = await supabase.rpc("generate_base_schedule", {
      p_store_id: selectedStore.id,
      p_week_start: weekKey,
      p_created_by: user?.id,
    });
    const result = data as { success?: boolean; error?: string; slots_created?: number } | null;
    if (error || result?.success === false) {
      setGenerating(false);
      toast.error((error?.message ?? result?.error) || "Erro ao gerar escala");
      return;
    }
    toast.success(`Escala gerada: ${result?.slots_created ?? 0} slots`);
    window.location.reload();
  }

  if (!selectedStore) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Nenhuma loja disponível
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* MAIN */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Page header */}
        <div className="px-6 pt-5 pb-3 flex items-start justify-between gap-4 flex-shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">Escalas</h1>
            <p className="text-sm text-gray-500 mt-0.5">Grade semanal por loja</p>
          </div>
          {initialStores.length > 1 ? (
            <select
              value={selectedStore.id}
              onChange={(e) =>
                setSelectedStore(initialStores.find((s) => s.id === e.target.value)!)
              }
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 font-medium focus:outline-none focus:border-brand-400 min-w-[200px]"
            >
              {initialStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.shopping}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm font-medium bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-lg">
              {selectedStore.code}
            </span>
          )}
        </div>

        {/* Toolbar card */}
        <div className="mx-6 mb-3 bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
          {/* Left: week nav */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekOffset((w) => w - 1)}
              className="w-8 h-8 border border-gray-200 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-50"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-medium text-gray-800 min-w-[160px] text-center">
              {weekLabel}
            </span>
            <button
              onClick={() => setWeekOffset((w) => w + 1)}
              className="w-8 h-8 border border-gray-200 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-50"
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => setWeekOffset(0)}
              className="text-sm px-3 py-1.5 border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 ml-1"
            >
              Hoje
            </button>
          </div>

          {/* Right: status + actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {schedule && (
              <span
                className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  schedule.status === "published"
                    ? "bg-brand-50 text-brand-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {schedule.status === "published" ? "Publicada" : "Rascunho"}
              </span>
            )}
            {openCount > 0 && (
              <button
                onClick={() => setView("freelancers")}
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
              >
                <AlertTriangle size={11} />
                {openCount} vaga{openCount > 1 ? "s" : ""} freelancer
              </button>
            )}
            <button
              onClick={handleCopy}
              disabled={copying}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <Copy size={13} />
              {copying ? "Copiando..." : "Copiar semana anterior"}
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Wand2 size={13} />
              {generating ? "Gerando..." : "Gerar escala base"}
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing || schedule?.status === "published"}
              className={`flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg font-medium disabled:cursor-not-allowed ${
                schedule?.status === "published"
                  ? "bg-emerald-600 text-white opacity-90"
                  : "bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-50"
              }`}
            >
              {schedule?.status === "published" ? <Check size={13} /> : <Send size={13} />}
              {publishing
                ? "Publicando..."
                : schedule?.status === "published"
                  ? "✓ Publicada"
                  : "Publicar escala"}
            </button>
          </div>
        </div>

        {/* Segmented tabs */}
        <div className="px-6 flex items-center gap-2 flex-shrink-0">
          <div className="inline-flex bg-gray-100 rounded-lg p-1">
            {(["grade", "resumo", "freelancers"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-4 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1.5 ${
                  view === v
                    ? "bg-white text-gray-900 font-medium shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {v === "grade" ? "Grade semanal" : v === "resumo" ? "Resumo diário" : "Freelancers"}
                {v === "freelancers" && openCount > 0 && (
                  <span className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold rounded-full bg-amber-500 text-white">
                    {openCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Carregando escala...
            </div>
          ) : view === "grade" ? (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden h-full">
              <GradeHoraria
                key={`grade-${refreshKey}-${schedule?.id ?? "novo"}`}
                employees={employees}
                weekDates={weekDates}
                getSlot={getSlot}
                updateDay={updateDay}
                store={selectedStore}
              />
            </div>
          ) : view === "resumo" ? (
            <ResumoSemanal
              employees={employees}
              weekDates={weekDates}
              getSlot={getSlot}
              store={selectedStore}
            />
          ) : (
            <div className="p-4 max-w-lg">
              {schedule?.id ? (
                <FreelancerSlots scheduleId={schedule.id} />
              ) : (
                <p className="text-sm text-gray-400">
                  Gere a escala primeiro para ver as vagas freelancer.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <PainelAlertas
        employees={employees}
        weekDates={weekDates}
        getSlot={getSlot}
        store={selectedStore}
        schedule={schedule}
      />
    </div>
  );
}
