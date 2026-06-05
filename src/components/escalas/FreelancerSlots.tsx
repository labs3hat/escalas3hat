import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────
export interface FreelancerSlot {
  id: string;
  schedule_id: string;
  store_id: string;
  day_of_week: number;
  shift_name: string;
  rule_origin: string;
  filled_by: string | null;
  filled_at: string | null;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number | null;
  is_manual?: boolean;
}

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const RULE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  R1:  { bg: "#FCEBEB", text: "#A32D2D", border: "#F09595" },
  R2:  { bg: "#FCEBEB", text: "#A32D2D", border: "#F09595" },
  R4:  { bg: "#EEEDFE", text: "#3C3489", border: "#AFA9EC" },
  R18: { bg: "#EAF3DE", text: "#3B6D11", border: "#97C459" },
  R19: { bg: "#E1F5EE", text: "#0F6E56", border: "#5DCAA5" },
  Manual: { bg: "#F5F5F5", text: "#666", border: "#DDD" }
};

// =============================================================
// Hook principal — query + mutation
// =============================================================
export function useFreelancerSlots(scheduleId: string | null) {
  const [slots, setSlots]       = useState<FreelancerSlot[]>([]);
  const [loading, setLoading]   = useState(!!scheduleId);
  const [error, setError]       = useState<string | null>(null);
  const subscriptionId = useMemo(() => Math.random().toString(36).substring(7), []);

  const fetchSlots = useCallback(async () => {
    if (!scheduleId) {
      setLoading(false);
      setSlots([]);
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("freelancer_slots")
        .select("*")
        .eq("schedule_id", scheduleId)
        .order("day_of_week")
        .order("shift_name");
      
      if (err) throw err;
      setSlots((data as any[]) ?? []);
    } catch (err: any) {
      console.error("Erro ao buscar vagas freelancer:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  useEffect(() => { 
    fetchSlots(); 
    if (!scheduleId) return;

    const channel = supabase
      .channel(`freelancer_slots_${scheduleId}_${subscriptionId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'freelancer_slots',
        filter: `schedule_id=eq.${scheduleId}`
      }, () => {
        fetchSlots();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to freelancer_slots for schedule ${scheduleId}`);
        }
      });

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [fetchSlots, scheduleId, subscriptionId]);

  const fillSlot = useCallback(async (slotId: string, data: any) => {
    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;

      const { error: err } = await supabase
        .from("freelancer_slots")
        .update({
          filled_by:      data.nome,
          start_time:     data.startTime,
          end_time:       data.endTime,
          break_minutes:  data.breakMinutes,
          filled_at:      new Date().toISOString(),
          filled_by_user: user?.id ?? null,
        })
        .eq("id", slotId)
        .select()
        .single();
      
      if (err) throw err;
      toast.success(`Freelancer ${data.nome} salvo com sucesso!`);
      // Refetch imediato para garantir consistência
      fetchSlots();
    } catch (err: any) {
      console.error("Erro em fillSlot:", err);
      toast.error("Erro ao salvar freelancer: " + err.message);
      throw err;
    }
  }, []);

  const addManualSlot = useCallback(async (schedId: string, storeId: string, dayOfWeek: number, data: any) => {
    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;

      const { error: err } = await supabase
        .from("freelancer_slots")
        .insert({
          schedule_id:    schedId,
          store_id:       storeId,
          day_of_week:    dayOfWeek,
          shift_name:     "Manual",
          rule_origin:    "Manual",
          filled_by:      data.nome,
          start_time:     data.startTime,
          end_time:       data.endTime,
          break_minutes:  data.breakMinutes,
          is_manual:      true,
          filled_at:      new Date().toISOString(),
          filled_by_user: user?.id ?? null,
        })
        .select()
        .single();
      
      if (err) throw err;
      toast.success(`Freelancer ${data.nome} adicionado com sucesso!`);
      fetchSlots();
    } catch (err: any) {
      console.error("Erro em addManualSlot:", err);
      toast.error("Erro ao adicionar freelancer: " + err.message);
      throw err;
    }
  }, []);

  const clearSlot = useCallback(async (slotId: string, isManual: boolean) => {
    try {
      if (isManual) {
        const { error: err } = await supabase
          .from("freelancer_slots")
          .delete()
          .eq("id", slotId);
        if (err) throw err;
        toast.success("Freelancer removido com sucesso!");
      } else {
        const { error: err } = await (supabase
          .from("freelancer_slots")
          .update({ 
            filled_by: null, 
            filled_at: null, 
            filled_by_user: null, 
            start_time: null, 
            end_time: null,
            break_minutes: 60
          } as any)
          .eq("id", slotId));
        if (err) throw err;
        toast.success("Vaga de freelancer liberada!");
      }
    } catch (err: any) {
      console.error("Erro em clearSlot:", err);
      toast.error("Erro ao remover/limpar: " + err.message);
    }
  }, []);

  const openCount  = slots.filter((s) => !s.filled_by).length;
  const canPublish = true;

  return { slots, loading, error, fillSlot, addManualSlot, clearSlot, openCount, canPublish, refetch: fetchSlots };
}

// =============================================================
// Hook de publicação
// =============================================================
export function usePublishSchedule(scheduleId: string | null, canPublish: boolean) {
  const [publishing, setPublishing] = useState(false);
  const [published,  setPublished]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const publish = useCallback(async () => {
    if (!scheduleId) return;
    setPublishing(true);
    setError(null);

    const { error: err } = await supabase
      .from("schedules")
      .update({ 
        status: "published", 
        published_at: new Date().toISOString(),
        notes: "Publicado via módulo de freelancers"
      } as any)
      .eq("id", scheduleId);

    if (err) {
      setError(err.message);
    } else {
      setPublished(true);
      toast.success("Escala publicada com sucesso!");
    }
    setPublishing(false);
  }, [scheduleId]);

  return { publish, publishing, published, error };
}

// =============================================================
// Componente de alerta
// =============================================================
function AlertBar({ openCount }: { openCount: number }) {
  return null;
}

// =============================================================
// Componente de célula freelancer
// =============================================================
function FreelancerCell({ slot, onFill, onClear }: { slot: FreelancerSlot, onFill: (s: FreelancerSlot) => void, onClear: (s: FreelancerSlot) => void }) {
  const rule = RULE_COLORS[slot.rule_origin] ?? RULE_COLORS.R18;
  const filled = !!slot.filled_by;

  if (filled) {
    return (
      <div style={{
        background: slot.is_manual ? "#F5F5F5" : "var(--color-background-info)",
        border: `0.5px solid ${slot.is_manual ? "#DDD" : "var(--color-border-info)"}`,
        borderRadius: 4,
        padding: "4px 6px",
        minHeight: 54,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        cursor: "pointer",
        position: "relative"
      }}
        onClick={() => onClear(slot)}
        title="Toque para remover/limpar"
        role="button"
      >
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-primary)" }}>
          {slot.filled_by}
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontSize: 9, color: "var(--color-text-secondary)" }}>
            {slot.start_time || "--:--"} às {slot.end_time || "--:--"}
          </span>
          <span style={{ fontSize: 8, color: "var(--color-text-tertiary)" }}>
            Pausa: {slot.break_minutes}m
          </span>
        </div>
        {slot.is_manual && (
          <span style={{ 
            position: "absolute", top: 2, right: 2, fontSize: 7, 
            background: "#EEE", padding: "1px 3px", borderRadius: 2 
          }}>
            Manual
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        background: rule.bg,
        border: `1px dashed ${rule.border}`,
        borderRadius: 4,
        padding: "4px 6px",
        minHeight: 54,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        cursor: "pointer",
      }}
      onClick={() => onFill(slot)}
      role="button"
    >
      <span style={{
        display: "inline-block",
        fontSize: 8,
        fontWeight: 600,
        padding: "1px 4px",
        borderRadius: 3,
        background: rule.border,
        color: rule.text,
        marginBottom: 2,
        alignSelf: "flex-start",
      }}>
        {slot.rule_origin}
      </span>
      <span style={{ fontSize: 10, fontWeight: 500, color: rule.text }}>
        {slot.shift_name}
      </span>
      <span style={{ fontSize: 9, color: rule.text, opacity: 0.8, marginTop: 1 }}>
        + preencher
      </span>
    </div>
  );
}

// =============================================================
// Modal de preenchimento
// =============================================================
function FillModal({ slot, onConfirm, onCancel }: { slot: any, onConfirm: (s: any, d: any) => void, onCancel: () => void }) {
  const [nome, setNome]           = useState(slot.filled_by || "");
  const [startTime, setStartTime] = useState(slot.start_time || (slot.shift_name === 'Abertura' ? '08:00' : '13:00'));
  const [endTime, setEndTime]     = useState(slot.end_time || (slot.shift_name === 'Abertura' ? '17:00' : '22:00'));
  const [breakMin, setBreakMin]   = useState(slot.break_minutes || 60);
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState<string | null>(null);

  if (!slot) return null;

  const handleConfirm = async () => {
    if (!nome.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await onConfirm(slot, {
        nome: nome.trim(),
        startTime,
        endTime,
        breakMinutes: parseInt(breakMin) || 0
      });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      role="dialog"
      aria-modal="true"
    >
      <div style={{
        background: "#FFFFFF",
        borderRadius: "12px",
        padding: "24px",
        width: "90%",
        maxWidth: 400,
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          {slot.is_manual && !slot.id ? "Adicionar Freelancer" : "Editar Freelancer"}
        </h3>
        <p style={{ fontSize: 12, color: "#666", marginBottom: 16 }}>
          {DAY_LABELS[slot.day_of_week]} · {slot.shift_name}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, color: "#999", display: "block", marginBottom: 4 }}>NOME DO FREELANCER</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: João Silva"
              autoFocus
              style={{
                width: "100%", padding: "10px", border: "1px solid #DDD", borderRadius: 6, fontSize: 14, outline: "none"
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 500, color: "#999", display: "block", marginBottom: 4 }}>INÍCIO</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={{ width: "100%", padding: "10px", border: "1px solid #DDD", borderRadius: 6, fontSize: 14 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 500, color: "#999", display: "block", marginBottom: 4 }}>FIM</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                style={{ width: "100%", padding: "10px", border: "1px solid #DDD", borderRadius: 6, fontSize: 14 }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 500, color: "#999", display: "block", marginBottom: 4 }}>INTERVALO (MINUTOS)</label>
            <input
              type="number"
              value={breakMin}
              onChange={(e) => setBreakMin(e.target.value)}
              style={{ width: "100%", padding: "10px", border: "1px solid #DDD", borderRadius: 6, fontSize: 14 }}
            />
          </div>
        </div>

        {err && <p style={{ fontSize: 11, color: "red", marginBottom: 12 }}>{err}</p>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button onClick={onCancel} disabled={saving} style={{ padding: 10, borderRadius: 6, fontSize: 13, background: "#EEE", border: "none" }}>
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || !nome.trim()}
            style={{
              padding: 10, borderRadius: 6, fontSize: 13, fontWeight: 600,
              background: nome.trim() ? "#BA7517" : "#CCC", color: "#FFF", border: "none"
            }}
          >
            {saving ? "Salvando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// Botão de publicação
// =============================================================
function PublishButton({ canPublish, openCount, onPublish, publishing, published }: { canPublish: boolean, openCount: number, onPublish: () => void, publishing: boolean, published: boolean }) {
  if (published) {
    return (
      <div style={{
        width: "100%", padding: 12, borderRadius: 6,
        background: "var(--color-background-success, #ecfdf5)",
        border: "0.5px solid var(--color-border-success, #10b981)",
        color: "var(--color-text-success, #065f46)",
        fontSize: 13, fontWeight: 500,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      }}>
        ✓ Escala publicada
      </div>
    );
  }

  return (
    <button
      onClick={canPublish ? onPublish : undefined}
      disabled={!canPublish || publishing}
      style={{
        width: "100%", padding: 12, borderRadius: 6,
        background: canPublish ? "var(--color-background-primary, #BA7517)" : "#EEE",
        border: `0.5px solid ${canPublish ? "#A66714" : "#DDD"}`,
        color: canPublish ? "white" : "#999",
        fontSize: 13, fontWeight: 500,
        cursor: canPublish ? "pointer" : "default",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        marginTop: 12,
      }}
    >
      {publishing
        ? "Publicando..."
        : canPublish
          ? "Publicar escala →"
          : `Publicar escala — ${openCount} vaga${openCount > 1 ? "s" : ""} em aberto`
      }
    </button>
  );
}

// =============================================================
// Componente principal
// =============================================================
export default function FreelancerSlots({ scheduleId, storeId, className = "", isEmbed = false }: { scheduleId: string | null, storeId: string, className?: string, isEmbed?: boolean }) {
  const [activeSlot, setActiveSlot] = useState<FreelancerSlot | { day_of_week: number, shift_name: string, is_manual: boolean } | null>(null);
  
  const {
    slots, loading, error,
    fillSlot, addManualSlot, clearSlot,
    openCount, canPublish,
  } = useFreelancerSlots(scheduleId);

  const { publish, publishing, published, error: pubError } =
    usePublishSchedule(scheduleId, canPublish);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <p className="text-sm">Carregando vagas freelancer...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-red-500">
        <p className="text-sm">Erro ao carregar: {error}</p>
      </div>
    );
  }

  const handleSave = async (slot: any, data: any) => {
    try {
      if (slot.id) {
        await fillSlot(slot.id, data);
      } else if (scheduleId) {
        await addManualSlot(scheduleId, storeId, slot.day_of_week, data);
      }
      setActiveSlot(null);
    } catch (e: any) {
      console.error("Erro ao salvar freelancer:", e);
    }
  };

  const handleClear = async (slot: any) => {
    const action = slot.is_manual ? "Excluir" : "Limpar";
    if (!window.confirm(`${action} este freelancer?`)) return;
    await clearSlot(slot.id, !!slot.is_manual);
  };

  const byDay = Array.from({ length: 7 }, (_, i) =>
    slots.filter((s) => s.day_of_week === i)
  );

  return (
    <div className={`${className} ${!isEmbed ? 'max-w-4xl mx-auto bg-white rounded-xl border border-gray-200 p-6 shadow-sm' : ''}`}>
      {!isEmbed && (
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600">
            <UserPlus size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 leading-tight">Gestão de Freelancers</h2>
            <p className="text-xs text-gray-500">Controle de vagas e coberturas extras</p>
          </div>
        </div>
      )}

      <AlertBar openCount={openCount} />

      <div style={{ marginBottom: 12 }}>
        {byDay.map((daySlots, dayIdx) => (
          <div key={dayIdx} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>
                {DAY_LABELS[dayIdx]}
              </p>
              <button
                onClick={() => setActiveSlot({ day_of_week: dayIdx, shift_name: 'Manual', is_manual: true })}
                style={{
                  fontSize: 10, padding: "2px 6px", borderRadius: 4,
                  background: "#F0F0F0", border: "0.5px solid #DDD", color: "#666"
                }}
              >
                + Freelancer
              </button>
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
              gap: 6,
            }}>
              {daySlots.map((slot) => (
                <FreelancerCell
                  key={slot.id}
                  slot={slot}
                  onFill={setActiveSlot}
                  onClear={handleClear}
                />
              ))}
              {daySlots.length === 0 && (
                <p style={{ fontSize: 10, color: "#AAA", fontStyle: "italic" }}>Sem vagas sugeridas</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <PublishButton
        canPublish={canPublish}
        openCount={openCount}
        onPublish={publish}
        publishing={publishing}
        published={published}
      />

      {(pubError || error) && (
        <p style={{ fontSize: 11, color: "red", marginTop: 6 }}>
          {pubError || error}
        </p>
      )}

      {activeSlot && (
        <FillModal
          slot={activeSlot}
          onConfirm={handleSave}
          onCancel={() => setActiveSlot(null)}
        />
      )}
    </div>
  );
}


