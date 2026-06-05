// @ts-nocheck
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Tipos ─────────────────────────────────────────────────────
// FreelancerSlot {
//   id: string (uuid)
//   schedule_id: string
//   store_id: string
//   day_of_week: number (0=dom … 6=sáb)
//   shift_name: "Abertura" | "Intermediário" | "Fechamento"
//   rule_origin: "R1" | "R2" | "R4" | "R18" | "R19"
//   filled_by: string | null
//   filled_at: string | null
// }

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const RULE_COLORS = {
  R1:  { bg: "#FCEBEB", text: "#A32D2D", border: "#F09595" },
  R2:  { bg: "#FCEBEB", text: "#A32D2D", border: "#F09595" },
  R4:  { bg: "#EEEDFE", text: "#3C3489", border: "#AFA9EC" },
  R18: { bg: "#EAF3DE", text: "#3B6D11", border: "#97C459" },
  R19: { bg: "#E1F5EE", text: "#0F6E56", border: "#5DCAA5" },
};

// =============================================================
// Hook principal — query + mutation
// =============================================================
export function useFreelancerSlots(scheduleId) {
  const [slots, setSlots]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  // 1. Buscar vagas do schedule
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
      setSlots(data ?? []);
    } catch (err) {
      console.error("Erro ao buscar vagas freelancer:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  useEffect(() => { 
    fetchSlots(); 
    // Inscrever para mudanças em tempo real para manter todas as instâncias sincronizadas
    const channel = supabase
      .channel(`freelancer_slots_${scheduleId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'freelancer_slots',
        filter: `schedule_id=eq.${scheduleId}`
      }, () => {
        fetchSlots();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchSlots, scheduleId]);

  // 2. Preencher vaga com nome do freelancer e horários
  const fillSlot = useCallback(async (slotId, data) => {
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
        .eq("id", slotId);
      
      if (err) throw err;
      
      toast.success(`Freelancer ${data.nome} salvo com sucesso!`);
      // Não atualizamos o estado local manualmente aqui para evitar conflitos com o real-time
      // O fetchSlots() será chamado pelo listener do postgres_changes
    } catch (err) {
      console.error("Erro em fillSlot:", err);
      toast.error("Erro ao salvar freelancer: " + err.message);
      throw err;
    }
  }, []);

  // 3. Adicionar vaga manual
  const addManualSlot = useCallback(async (scheduleId, storeId, dayOfWeek, data) => {
    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;

      const { data: newSlot, error: err } = await supabase
        .from("freelancer_slots")
        .insert({
          schedule_id:    scheduleId,
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
      // O real-time cuidará de atualizar o estado
    } catch (err) {
      console.error("Erro em addManualSlot:", err);
      toast.error("Erro ao adicionar freelancer: " + err.message);
      throw err;
    }
  }, []);

  // 4. Limpar/Excluir vaga
  const clearSlot = useCallback(async (slotId, isManual) => {
    try {
      if (isManual) {
        const { error: err } = await supabase
          .from("freelancer_slots")
          .delete()
          .eq("id", slotId);
        if (err) throw err;
        toast.success("Freelancer removido com sucesso!");
      } else {
        const { error: err } = await supabase
          .from("freelancer_slots")
          .update({ 
            filled_by: null, 
            filled_at: null, 
            filled_by_user: null, 
            start_time: null, 
            end_time: null,
            break_minutes: 60
          })
          .eq("id", slotId);
        if (err) throw err;
        toast.success("Vaga de freelancer liberada!");
      }
      // O real-time cuidará de atualizar o estado
    } catch (err) {
      console.error("Erro em clearSlot:", err);
      toast.error("Erro ao remover/limpar: " + err.message);
    }
  }, []);

  const openCount  = slots.filter((s) => !s.filled_by).length;
  const canPublish = true;

  return { slots, loading, error, fillSlot, addManualSlot, clearSlot, openCount, canPublish, refetch: fetchSlots };
}

// =============================================================
// Hook de publicação — valida e publica o schedule
// =============================================================
export function usePublishSchedule(scheduleId, canPublish) {
  const [publishing, setPublishing] = useState(false);
  const [published,  setPublished]  = useState(false);
  const [error,      setError]      = useState(null);

  const publish = useCallback(async () => {
    if (!scheduleId) return;
    setPublishing(true);
    setError(null);

    const { error: err } = await supabase
      .from("schedules")
      .update({ 
        status: "published", 
        published_at: new Date().toISOString(),
        // Registramos que foi preenchido por freelancer se houver vagas preenchidas
        notes: "Publicado via módulo de freelancers"
      })
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
// Componente de alerta — barra de vagas em aberto
// =============================================================
function AlertBar({ openCount }) {
  if (openCount === 0) return null;
  return (
    <div style={{
      background: "#FAEEDA",
      border: "0.5px solid #BA7517",
      borderRadius: 8,
      padding: "8px 12px",
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="#854F0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span style={{ fontSize: 12, color: "#854F0B", flex: 1 }}>
        {openCount} vaga{openCount > 1 ? "s" : ""} freelancer em aberto
      </span>
    </div>
  );
}

// =============================================================
// Componente de célula freelancer
// =============================================================
function FreelancerCell({ slot, onFill, onClear }) {
  const rule   = RULE_COLORS[slot.rule_origin] ?? RULE_COLORS.R18;
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
// Modal de preenchimento (bottom sheet)
// =============================================================
function FillModal({ slot, onConfirm, onCancel }) {
  const [nome, setNome]           = useState(slot.filled_by || "");
  const [startTime, setStartTime] = useState(slot.start_time || (slot.shift_name === 'Abertura' ? '08:00' : '13:00'));
  const [endTime, setEndTime]     = useState(slot.end_time || (slot.shift_name === 'Abertura' ? '17:00' : '22:00'));
  const [breakMin, setBreakMin]   = useState(slot.break_minutes || 60);
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState(null);

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
    } catch (e) {
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
function PublishButton({ canPublish, openCount, onPublish, publishing, published }) {
  if (published) {
    return (
      <div style={{
        width: "100%", padding: 12, borderRadius: 6,
        background: "var(--color-background-success)",
        border: "0.5px solid var(--color-border-success)",
        color: "var(--color-text-success)",
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
        background: canPublish ? "var(--color-background-primary)" : "var(--color-background-secondary)",
        border: `0.5px solid ${canPublish ? "var(--color-border-secondary)" : "var(--color-border-tertiary)"}`,
        color: canPublish ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
        fontSize: 13, fontWeight: 500,
        cursor: canPublish ? "pointer" : "default",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        marginTop: 12,
      }}
      aria-disabled={!canPublish}
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
// Componente principal — grade de vagas freelancer por dia
// =============================================================
export function FreelancerSlots({ scheduleId, storeId, className = "" }) {
  const [activeSlot, setActiveSlot] = useState(null);
  
  try {
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

    const handleSave = async (slot, data) => {
      try {
        if (slot.id) {
          await fillSlot(slot.id, data);
        } else {
          await addManualSlot(scheduleId, storeId, slot.day_of_week, data);
        }
        setActiveSlot(null);
      } catch (e) {
        console.error("Erro ao salvar freelancer:", e);
        toast.error("Erro ao salvar freelancer: " + (e.message || "Erro desconhecido"));
      }
    };

    const handleClear = async (slot) => {
      const action = slot.is_manual ? "Excluir" : "Limpar";
      if (!window.confirm(`${action} este freelancer?`)) return;
      await clearSlot(slot.id, slot.is_manual);
    };

    // Agrupar slots por dia da semana
    const byDay = Array.from({ length: 7 }, (_, i) =>
      slots.filter((s) => s.day_of_week === i)
    );

    return (
      <div className={className}>
        <AlertBar openCount={openCount} />

        <div style={{ marginBottom: 12 }}>
          <p style={{
            fontSize: 10, fontWeight: 500, color: "var(--color-text-tertiary)",
            textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8,
          }}>
            Gestão de Freelancers
          </p>

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
          <p style={{ fontSize: 11, color: "var(--color-text-danger)", marginTop: 6 }}>
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
  } catch (e) {
    console.error("Crash em FreelancerSlots:", e);
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
        <h2 className="font-bold">Erro no Componente Freelancer</h2>
        <pre className="text-xs mt-2 overflow-auto">{e.stack || e.message}</pre>
      </div>
    );
  }
}

export default FreelancerSlots;
