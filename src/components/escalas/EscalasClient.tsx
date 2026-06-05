import { useState, useMemo, useEffect } from "react";
import { addDays, startOfWeek, format, subWeeks, addWeeks, differenceInWeeks, parseISO } from "date-fns";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Send, Check, AlertTriangle, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Profile, Store } from "@/types";
import { SLOT_KEYS, MONTHS } from "@/types";
import { useEmployees } from "@/hooks/useEmployees";
import { useSchedule } from "@/hooks/useSchedule";
import GradeHoraria from "./GradeHoraria";
import ResumoSemanal from "./ResumoSemanal";
import PainelAlertas from "./PainelAlertas";
import FreelancerSlots from "./FreelancerSlots";
import { useFreelancerSlots } from "./FreelancerSlots";
import GerarEscalaMensalModal from "./GerarEscalaMensalModal";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TabBar } from "@/components/ui/TabBar";
import { formatters } from "@/lib/formatters";
import { handleSupabaseError } from "@/lib/errorHandler";
import { BUSINESS_RULES, WORK_REGIMES } from "@/constants";

interface Props {
  profile: Profile | null;
  initialStores: Store[];
  initialStoreId?: string;
  initialWeek?: string;
  initialTab?: "grade" | "resumo" | "freelancers";
}

const STORE_SELECTION_KEY = "escalas:selectedStoreId";

function getSavedStoreId() {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(STORE_SELECTION_KEY) ?? undefined;
}

export default function EscalasClient({ profile, initialStores, initialStoreId, initialWeek, initialTab }: Props) {
  const navigate = useNavigate();
  const [selectedStore, setSelectedStore] = useState<Store>(() => {
    const preferredStoreId = initialStoreId ?? getSavedStoreId();
    if (preferredStoreId) {
      const found = initialStores.find(s => s.id === preferredStoreId);
      if (found) return found;
    }
    return initialStores[0];
  });

  const [weekOffset, setWeekOffset] = useState(() => {
    if (!initialWeek) return 0;
    try {
      const target = parseISO(initialWeek);
      const base = startOfWeek(new Date(), { weekStartsOn: 1 });
      return differenceInWeeks(target, base);
    } catch (e) {
      return 0;
    }
  });

  const [view, setView] = useState<"grade" | "resumo" | "freelancers">(initialTab || "grade");

  useEffect(() => {
    if (initialTab && ["grade", "resumo", "freelancers"].includes(initialTab)) {
      if (initialTab !== view) {
        setView(initialTab as any);
      }
    }
  }, [initialTab]);

  const [publishing, setPublishing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [monthlyOpen, setMonthlyOpen] = useState(false);

  useEffect(() => {
    if (initialStoreId) {
      const store = initialStores.find(s => s.id === initialStoreId);
      if (store) setSelectedStore(store);
    }
  }, [initialStoreId, initialStores]);

  useEffect(() => {
    if (!selectedStore?.id || typeof window === "undefined") return;
    window.localStorage.setItem(STORE_SELECTION_KEY, selectedStore.id);
  }, [selectedStore?.id]);

  useEffect(() => {
    if (initialWeek) {
      try {
        const target = parseISO(initialWeek);
        const base = startOfWeek(new Date(), { weekStartsOn: 1 });
        setWeekOffset(differenceInWeeks(target, base));
      } catch (e) {}
    }
  }, [initialWeek]);

  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 });
    return weekOffset >= 0 ? addWeeks(base, weekOffset) : subWeeks(base, Math.abs(weekOffset));
  }, [weekOffset]);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const syncSearch = (storeId: string, week: Date, tab?: string) => {
    if (!storeId || !week) return;
    const weekStr = format(week, "yyyy-MM-dd");
    
    // Only navigate if actually different to avoid redundant history/renders
    const currentSearch = new URLSearchParams(window.location.search);
    if (
      currentSearch.get('storeId') === storeId && 
      currentSearch.get('week') === weekStr && 
      (currentSearch.get('tab') || 'grade') === (tab || 'grade')
    ) {
      return;
    }

    void navigate({
      to: "/escalas",
      replace: true,
      search: (prev: any) => ({
        ...prev,
        storeId,
        week: weekStr,
        tab: (tab || prev.tab || "grade") as any
      }),
    });
  };

  useEffect(() => {
    if (!selectedStore?.id || !weekStart) return;
    const weekKey = format(weekStart, "yyyy-MM-dd");
    
    const currentWeekKey = initialWeek;
    const currentStoreId = initialStoreId;
    const currentTab = initialTab || "grade";

    if (selectedStore.id !== currentStoreId || weekKey !== currentWeekKey || view !== currentTab) {
      const timer = setTimeout(() => {
        syncSearch(selectedStore.id, weekStart, view);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedStore?.id, weekStart, view, initialStoreId, initialWeek, initialTab]);

  const { employees: allEmployees } = useEmployees(selectedStore?.id ?? null);
  const employees = useMemo(() => allEmployees.filter(e => e.active), [allEmployees]);

  const { schedule, loading, updateDay, publish, copyPreviousWeek, getSlot, reload, validate } = useSchedule(
    selectedStore?.id ?? null,
    weekStart,
  );

  const { slots: freelancerSlots, openCount, refetch: refetchFreelancers } = useFreelancerSlots(schedule?.id ?? null);

  useEffect(() => {
    const handleFreelancerUpdate = () => {
      refetchFreelancers();
      reload(); // Atualiza a escala (slots normais)
    };
    window.addEventListener('freelancer_updated', handleFreelancerUpdate);
    return () => window.removeEventListener('freelancer_updated', handleFreelancerUpdate);
  }, [refetchFreelancers, reload]);

  const weekLabel = useMemo(() => {
    return formatters.weekRange(weekDates[0], weekDates[6]);
  }, [weekDates]);

  async function handleRefresh() {
    try {
      await reload();
      await refetchFreelancers();
      toast.success("Escala atualizada!");
    } catch (e: any) {
      handleSupabaseError(e, "Erro ao atualizar escala");
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      await publish();
      toast.success("Escala publicada com sucesso");
    } catch (e: any) {
      handleSupabaseError(e, "Erro ao publicar escala");
    } finally {
      setPublishing(false);
    }
  }

  async function updateDayWithAudit(
    employeeId: string,
    dayOfWeek: number,
    type: "work" | "day_off" | "empty",
    payload?: { entry: string; exit: string; breakStart?: string; breakEnd?: string },
    reason?: string
  ) {
    const violations = validate(employees, { employeeId, dayOfWeek, type, payload });
    const errors = violations.filter(v => v.type === 'error');
    
    if (errors.length > 0) {
      toast.error(errors[0].message);
      return;
    }

    const warnings = violations.filter(v => v.type === 'warning');
    if (warnings.length > 0) {
      toast.warning(warnings[0].message, { duration: 5000 });
    }

    if (schedule?.status === "published") {
      if (!reason || reason.trim().length < 10) {
        toast.error("Motivo obrigatório (mín. 10 caracteres) para editar escala publicada.");
        return;
      }

      const workSlots = SLOT_KEYS.filter(s => getSlot(employeeId, dayOfWeek, s) === 'work');
      const intervalSlots = SLOT_KEYS.filter(s => getSlot(employeeId, dayOfWeek, s) === 'interval');
      const offSlot = SLOT_KEYS.some(s => getSlot(employeeId, dayOfWeek, s) === 'day_off');
      
      let oldType: "work" | "day_off" | "empty" = offSlot ? 'day_off' : (workSlots.length > 0 ? 'work' : 'empty');
      let oldEntry: string | null = workSlots.length > 0 ? workSlots[0] : null;
      let oldExit: string | null = null;
      
      if (workSlots.length > 0) {
        const emp = employees.find(e => e.id === employeeId);
        const toMin = (s: string) => {
          const [h, m] = s.split(':').map(Number);
          return h * 60 + m;
        };
        const fmt = (mins: number) =>
          `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
        
        const shiftDuration = emp?.work_regime === WORK_REGIMES.R5X2 ? BUSINESS_RULES.DEFAULT_5X2_HOURS : BUSINESS_RULES.DEFAULT_6X1_HOURS;
        oldExit = oldEntry ? fmt(toMin(oldEntry) + shiftDuration) : null;
      }
      let oldBreak: string | null = intervalSlots.length > 0 ? intervalSlots[0] : null;

      try {
        await updateDay(employeeId, dayOfWeek, type, payload);
        
        const { data: { user } } = await supabase.auth.getUser();
        
        await supabase.from("schedule_changes").insert({
          schedule_id: schedule.id,
          store_id: selectedStore.id,
          employee_id: employeeId,
          day_of_week: dayOfWeek,
          reason: reason.trim(),
          changed_by: user?.id,
          ciencia_funcionario: true,
          ciencia_at: new Date().toISOString(),
          old_slot_type: oldType,
          new_slot_type: type,
          old_entry_time: oldEntry,
          new_entry_time: payload?.entry || null,
          old_exit_time: oldExit,
          new_exit_time: payload?.exit || null,
          old_break_start: oldBreak,
          new_break_start: payload?.breakStart || null,
        });
        
        toast.success("Alteração registrada e salva com sucesso");
      } catch (err) {
        handleSupabaseError(err, "Erro ao salvar alteração auditada");
      }
    } else {
      try {
        await updateDay(employeeId, dayOfWeek, type, payload);
        toast.success("Escala atualizada");
      } catch (err) {
        handleSupabaseError(err, "Erro ao atualizar escala");
      }
    }
  }


  if (!selectedStore) {
    return <EmptyState title="Nenhuma loja disponível" />;
  }

  const tabItems = [
    { id: "grade", label: "Grade semanal" },
    { id: "resumo", label: "Resumo diário" },
    { id: "freelancers", label: "Freelancers", badge: openCount, icon: openCount > 0 ? <AlertTriangle size={14} className="text-amber-500" /> : null }
  ] as const;

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <PageHeader 
          title="Escalas" 
          subtitle="Grade semanal por loja"
          stores={initialStores}
          selectedStoreId={selectedStore.id}
          onStoreChange={setSelectedStore}
        />

        {/* Toolbar */}
        <div className="mx-6 mb-2 bg-white border border-gray-200 rounded-xl px-4 py-2 flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
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
            <button
              onClick={() => setMonthlyOpen(true)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-brand-200 rounded-lg text-brand-700 bg-brand-50 hover:bg-brand-100 disabled:opacity-50"
            >
              <CalendarDays size={13} />
              Gerar Escala Mensal
            </button>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg font-medium bg-brand-500 hover:bg-brand-600 text-white"
            >
              <Check size={13} />
              Atualizar escala
            </button>
            {schedule?.status !== "published" && (
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {publishing ? "Publicando..." : "Publicar escala"}
              </button>
            )}
          </div>
        </div>

        <TabBar 
          items={tabItems} 
          activeId={view} 
          onChange={(newTab) => {
            setView(newTab);
            syncSearch(selectedStore.id, weekStart, newTab);
          }} 
        />

        <div className="flex-1 min-h-0 overflow-hidden px-6 pt-3 pb-2">
          {loading ? (
            <LoadingState fullPage />
          ) : view === "grade" ? (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden h-full">
              <GradeHoraria
                key={`grade-${refreshKey}-${schedule?.id ?? "novo"}`}
                employees={employees}
                weekDates={weekDates}
                getSlot={getSlot}
                updateDay={updateDayWithAudit}
                store={selectedStore}
                isPublished={schedule?.status === "published"}
                freelancerSlots={freelancerSlots}
              />
            </div>
          ) : view === "resumo" ? (
            <ResumoSemanal
              employees={employees}
              weekDates={weekDates}
              getSlot={getSlot}
              updateDay={updateDayWithAudit}
              store={selectedStore}
              isPublished={schedule?.status === "published"}
              freelancerSlots={freelancerSlots}
            />
          ) : (
            <div className="p-6 w-full h-full overflow-auto bg-gray-50/50">
              {schedule?.id ? (
                <FreelancerSlots 
                  scheduleId={schedule.id} 
                  storeId={selectedStore.id} 
                  isEmbed={true}
                  onRefresh={() => {
                    refetchFreelancers();
                    reload();
                    toast.success("Escala atualizada!");
                  }}
                />
              ) : (
                <EmptyState 
                  title="Escala não gerada" 
                  description="Gere a escala base primeiro para poder gerenciar as vagas freelancer desta semana."
                  icon={<AlertTriangle size={32} className="text-amber-500" />}
                />
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
        freelancerSlots={freelancerSlots}
      />

      {monthlyOpen && (
        <GerarEscalaMensalModal
          open={monthlyOpen}
          onClose={() => setMonthlyOpen(false)}
          store={selectedStore}
          employees={employees}
          monthDate={weekStart}
          onGenerated={async () => {
            setSelectedStore(selectedStore);
            syncSearch(selectedStore.id, weekStart);
            await reload();
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
