// @ts-nocheck
// =============================================================
// 3HAT ESCALAS — FreelancerSlots.jsx
// Componente completo: query + mutation + validação de publicação
//
// Como usar no Lovable:
//   1. Colar este arquivo em src/components/schedule/FreelancerSlots.jsx
//   2. Importar e usar dentro da grade de escala semanal:
//      <FreelancerSlots scheduleId={schedule.id} onAllFilled={setCanPublish} />
//   3. O hook useFreelancerSlots também pode ser usado diretamente
//      para bloquear o botão de publicação no componente pai.
// =============================================================

import { useState, useEffect, useCallback } from "react";
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
    if (!scheduleId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("freelancer_slots")
      .select("*")
      .eq("schedule_id", scheduleId)
      .order("day_of_week")
      .order("shift_name");
    if (err) setError(err.message);
    else setSlots(data ?? []);
    setLoading(false);
  }, [scheduleId]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  // 2. Preencher vaga com nome do freelancer e horários
  const fillSlot = useCallback(async (slotId, data) => {
    const { data: { user } } = await supabase.auth.getUser();
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
    if (err) throw new Error(err.message);
    
    toast.success(`Freelancer ${data.nome} salvo com sucesso!`);

    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? { ...s, filled_by: data.nome, start_time: data.startTime, end_time: data.endTime, break_minutes: data.breakMinutes, filled_at: new Date().toISOString() }
          : s
      )
    );
  }, []);

  // 3. Adicionar vaga manual
  const addManualSlot = useCallback(async (scheduleId, storeId, dayOfWeek, data) => {
    const { data: { user } } = await supabase.auth.getUser();
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
    
    if (err) throw new Error(err.message);
    
    toast.success(`Freelancer ${data.nome} adicionado com sucesso!`);
    setSlots(prev => [...prev, newSlot]);
  }, []);

  // 4. Limpar/Excluir vaga
  const clearSlot = useCallback(async (slotId, isManual) => {
    if (isManual) {
      const { error: err } = await supabase
        .from("freelancer_slots")
        .delete()
        .eq("id", slotId);
      if (err) throw new Error(err.message);
      setSlots(prev => prev.filter(s => s.id !== slotId));
      toast.success("Freelancer removido com sucesso!");
    } else {
      const { error: err } = await supabase
        .from("freelancer_slots")
        .update({ filled_by: null, filled_at: null, filled_by_user: null, start_time: null, end_time: null })
        .eq("id", slotId);
      if (err) throw new Error(err.message);
      setSlots((prev) =>
        prev.map((s) =>
          s.id === slotId
            ? { ...s, filled_by: null, filled_at: null, start_time: null, end_time: null }
            : s
        )
      );
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
      // Forçar um recarregamento da página para refletir o status
      window.location.reload();
      // Em vez de reload, o ideal é o EscalasClient detectar a mudança via realtime
      // ou callback, mas o reload resolve o sumiço imediato relatado.

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
        background: "var(--color-background-info)",
        border: "0.5px solid var(--color-border-info)",
        borderRadius: 4,
        padding: "4px 6px",
        minHeight: 44,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        cursor: "pointer",
      }}
        onClick={() => onClear(slot.id)}
        title="Toque para desfazer"
        role="button"
        aria-label={`Freelancer ${slot.filled_by} — ${slot.shift_name}. Toque para desfazer.`}
      >
        <span style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-info)" }}>
          {slot.filled_by}
        </span>
        <span style={{ fontSize: 9, color: "var(--color-text-secondary)" }}>
          Freelancer
        </span>
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
        minHeight: 44,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        cursor: "pointer",
      }}
      onClick={() => onFill(slot)}
      role="button"
      aria-label={`Vaga freelancer ${slot.shift_name} — regra ${slot.rule_origin}. Toque para preencher.`}
    >
      <span style={{
        display: "inline-block",
        fontSize: 9,
        fontWeight: 500,
        padding: "1px 5px",
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
      <span style={{ fontSize: 9, color: rule.text, opacity: 0.8, marginTop: 2 }}>
        + preencher
      </span>
    </div>
  );
}

// =============================================================
// Modal de preenchimento (bottom sheet)
// =============================================================
function FillModal({ slot, onConfirm, onCancel }) {
  const [nome, setNome]     = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState(null);

  if (!slot) return null;

  const handleConfirm = async () => {
    if (!nome.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await onConfirm(slot.id, nome.trim());
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleKey = (e) => { if (e.key === "Enter") handleConfirm(); };

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.7)", // Escurecido conforme pedido
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999, // Garantir que fique por cima de tudo
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fl-modal-title"
    >
      <div style={{
        background: "#FFFFFF",
        borderRadius: "12px", // Centralizado e com bordas arredondadas completas
        padding: "24px",
        width: "90%",
        maxWidth: 400,
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)",
      }}>
        <h3 id="fl-modal-title" style={{
          fontSize: 15, fontWeight: 500,
          color: "var(--color-text-primary)", marginBottom: 4,
        }}>
          Preencher vaga freelancer
        </h3>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 16 }}>
          {DAY_LABELS[slot.day_of_week]} · {slot.shift_name} · Regra {slot.rule_origin}
        </p>

        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Nome do freelancer"
          autoFocus
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "0.5px solid var(--color-border-secondary)",
            borderRadius: 6,
            fontSize: 14,
            color: "var(--color-text-primary)",
            background: "var(--color-background-primary)",
            marginBottom: err ? 8 : 12,
            outline: "none",
          }}
        />

        {err && (
          <p style={{ fontSize: 11, color: "var(--color-text-danger)", marginBottom: 12 }}>
            {err}
          </p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              padding: 10,
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              background: "var(--color-background-secondary)",
              border: "0.5px solid var(--color-border-tertiary)",
              color: "var(--color-text-secondary)",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || !nome.trim()}
            style={{
              padding: 10,
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              cursor: nome.trim() ? "pointer" : "default",
              background: nome.trim() ? "#BA7517" : "var(--color-background-secondary)",
              border: "none",
              color: nome.trim() ? "#fff" : "var(--color-text-tertiary)",
              transition: "background 0.15s",
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
export function FreelancerSlots({ scheduleId, className = "" }) {
  const {
    slots, loading, error,
    fillSlot, clearSlot,
    openCount, canPublish,
  } = useFreelancerSlots(scheduleId);

  const { publish, publishing, published, error: pubError } =
    usePublishSchedule(scheduleId, canPublish);

  const [activeSlot, setActiveSlot] = useState(null);

  if (loading) {
    return (
      <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", padding: "12px 0" }}>
        Carregando vagas freelancer...
      </p>
    );
  }

  if (error) {
    return (
      <p style={{ fontSize: 13, color: "var(--color-text-danger)", padding: "12px 0" }}>
        Erro: {error}
      </p>
    );
  }

  if (slots.length === 0) {
    return (
      <PublishButton
        canPublish={true}
        openCount={0}
        onPublish={publish}
        publishing={publishing}
        published={published}
      />
    );
  }

  // Agrupar slots por dia da semana
  const byDay = Array.from({ length: 7 }, (_, i) =>
    slots.filter((s) => s.day_of_week === i)
  );

  const handleFill = async (slotId, nome) => {
    try {
      await fillSlot(slotId, nome);
      setActiveSlot(null);
      // O refetch já é acionado pelo realtime ou pelo estado local no hook, 
      // mas vamos garantir a atualização visual.
    } catch (e) {
      console.error("Erro ao preencher freelancer:", e);
    }
  };

  const handleClear = async (slotId) => {
    if (!window.confirm("Desfazer preenchimento desta vaga?")) return;
    await clearSlot(slotId);
  };

  return (
    <div className={className}>
      <AlertBar openCount={openCount} />

      {/* Grade por dia da semana */}
      <div style={{ marginBottom: 12 }}>
        <p style={{
          fontSize: 10, fontWeight: 500, color: "var(--color-text-tertiary)",
          textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8,
        }}>
          Vagas freelancer
        </p>

        {byDay.map((daySlots, dayIdx) => {
          if (daySlots.length === 0) return null;
          return (
            <div key={dayIdx} style={{ marginBottom: 8 }}>
              <p style={{
                fontSize: 11, fontWeight: 500,
                color: "var(--color-text-secondary)", marginBottom: 4,
              }}>
                {DAY_LABELS[dayIdx]}
              </p>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))",
                gap: 4,
              }}>
                {daySlots.map((slot) => (
                  <FreelancerCell
                    key={slot.id}
                    slot={slot}
                    onFill={setActiveSlot}
                    onClear={handleClear}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <PublishButton
        canPublish={canPublish}
        openCount={openCount}
        onPublish={publish}
        publishing={publishing}
        published={published}
      />

      {pubError && (
        <p style={{ fontSize: 11, color: "var(--color-text-danger)", marginTop: 6 }}>
          {pubError}
        </p>
      )}

      <FillModal
        slot={activeSlot}
        onConfirm={handleFill}
        onCancel={() => setActiveSlot(null)}
      />
    </div>
  );
}

export default FreelancerSlots;
