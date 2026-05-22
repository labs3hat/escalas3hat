import { useState, useMemo } from 'react'
import { addDays, startOfWeek, format, subWeeks, addWeeks } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Copy, Send, Check, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import type { Profile, Store } from '@/types'
import { SLOT_KEYS, DAY_NAMES, MONTHS } from '@/types'
import { useEmployees } from '@/hooks/useEmployees'
import { useSchedule } from '@/hooks/useSchedule'
import GradeHoraria from './GradeHoraria'
import ResumoSemanal from './ResumoSemanal'
import PainelAlertas from './PainelAlertas'
// ── NOVO ──────────────────────────────────────────────────────
import { useFreelancerSlots } from './FreelancerSlots'
import FreelancerSlots from './FreelancerSlots'
// ──────────────────────────────────────────────────────────────

interface Props {
  profile: Profile | null
  initialStores: Store[]
}

export default function EscalasClient({ profile, initialStores }: Props) {
  const [selectedStore, setSelectedStore] = useState<Store>(initialStores[0])
  const [weekOffset, setWeekOffset] = useState(0)
  const [view, setView] = useState<'grade' | 'resumo' | 'freelancers'>('grade')
  const [publishing, setPublishing] = useState(false)
  const [copying, setCopying] = useState(false)

  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 })
    return weekOffset >= 0
      ? addWeeks(base, weekOffset)
      : subWeeks(base, Math.abs(weekOffset))
  }, [weekOffset])

  const weekDates = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const { employees } = useEmployees(selectedStore?.id ?? null)
  const { schedule, loading, updateSlot, publish, copyPreviousWeek, getSlot } =
    useSchedule(selectedStore?.id ?? null, weekStart)

  // ── NOVO: estado de freelancers ────────────────────────────
  const { openCount, canPublish: freelancerOk } =
    useFreelancerSlots(schedule?.id ?? null)
  // ──────────────────────────────────────────────────────────

  const weekLabel = useMemo(() => {
    const s = weekDates[0], e = weekDates[6]
    return `${s.getDate()} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`
  }, [weekDates])

  // ── MODIFICADO: bloquear publicação se há vagas em aberto ──
  async function handlePublish() {
    if (!freelancerOk) {
      toast.error(`Preencha as ${openCount} vaga(s) freelancer antes de publicar.`)
      setView('freelancers')
      return
    }
    setPublishing(true)
    await publish()
    toast.success('Escala publicada!')
    setPublishing(false)
  }
  // ──────────────────────────────────────────────────────────

  async function handleCopy() {
    setCopying(true)
    await copyPreviousWeek(employees)
    toast.success('Semana anterior copiada!')
    setCopying(false)
  }

  if (!selectedStore) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Nenhuma loja disponível
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* MAIN */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center gap-3 flex-shrink-0 flex-wrap">
          {/* Store selector */}
          {initialStores.length > 1 && (
            <select
              value={selectedStore.id}
              onChange={e => setSelectedStore(initialStores.find(s => s.id === e.target.value)!)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-brand-50 text-brand-700 font-medium focus:outline-none focus:border-brand-400"
            >
              {initialStores.map(s => (
                <option key={s.id} value={s.id}>{s.name} — {s.shopping}</option>
              ))}
            </select>
          )}
          {initialStores.length === 1 && (
            <span className="text-sm font-medium bg-brand-50 text-brand-700 px-3 py-1.5 rounded-lg">
              {selectedStore.name} — {selectedStore.shopping}
            </span>
          )}

          {/* Week nav */}
          <div className="flex items-center gap-1">
            <button onClick={() => setWeekOffset(w => w - 1)}
              className="w-7 h-7 border border-gray-200 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-50">
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-medium text-gray-800 min-w-[155px] text-center">{weekLabel}</span>
            <button onClick={() => setWeekOffset(w => w + 1)}
              className="w-7 h-7 border border-gray-200 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-50">
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Status */}
          {schedule && (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              schedule.status === 'published'
                ? 'bg-brand-50 text-brand-700'
                : 'bg-amber-50 text-amber-700'
            }`}>
              {schedule.status === 'published' ? 'Publicada' : 'Rascunho'}
            </span>
          )}

          {/* ── NOVO: badge de vagas em aberto ─────────────── */}
          {openCount > 0 && (
            <button
              onClick={() => setView('freelancers')}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <AlertTriangle size={11} />
              {openCount} vaga{openCount > 1 ? 's' : ''} freelancer
            </button>
          )}
          {/* ─────────────────────────────────────────────── */}

          {/* Actions */}
          <div className="ml-auto flex gap-2">
            <button onClick={handleCopy} disabled={copying}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              <Copy size={13} />
              {copying ? 'Copiando...' : 'Copiar sem. ant.'}
            </button>
            {/* ── MODIFICADO: botão bloqueado se há vagas abertas ── */}
            <button
              onClick={handlePublish}
              disabled={publishing || schedule?.status === 'published' || !freelancerOk}
              title={!freelancerOk ? `${openCount} vaga(s) freelancer em aberto` : undefined}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {schedule?.status === 'published' ? <Check size={13} /> : <Send size={13} />}
              {publishing ? 'Publicando...' : schedule?.status === 'published' ? 'Publicada' : 'Publicar'}
            </button>
            {/* ─────────────────────────────────────────────────── */}
          </div>
        </div>

        {/* View tabs */}
        <div className="flex border-b border-gray-200 bg-white px-5 flex-shrink-0">
          {/* ── MODIFICADO: adicionada aba Freelancers ── */}
          {(['grade', 'resumo', 'freelancers'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`py-2.5 px-3 text-sm border-b-2 -mb-px transition-colors relative ${
                view === v
                  ? 'border-brand-500 text-brand-700 font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {v === 'grade' ? 'Grade horária'
                : v === 'resumo' ? 'Resumo diário'
                : 'Freelancers'}
              {/* Badge de contagem na aba */}
              {v === 'freelancers' && openCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold rounded-full bg-amber-500 text-white">
                  {openCount}
                </span>
              )}
            </button>
          ))}
          {/* ─────────────────────────────────────────── */}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Carregando escala...
            </div>
          ) : view === 'grade' ? (
            <GradeHoraria
              employees={employees}
              weekDates={weekDates}
              getSlot={getSlot}
              updateSlot={updateSlot}
              store={selectedStore}
            />
          ) : view === 'resumo' ? (
            <ResumoSemanal
              employees={employees}
              weekDates={weekDates}
              getSlot={getSlot}
              store={selectedStore}
            />
          ) : (
            // ── NOVO: aba de freelancers ──────────────────────
            <div className="p-4 max-w-lg">
              {schedule?.id ? (
                <FreelancerSlots scheduleId={schedule.id} />
              ) : (
                <p className="text-sm text-gray-400">
                  Gere a escala primeiro para ver as vagas freelancer.
                </p>
              )}
            </div>
            // ─────────────────────────────────────────────────
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
  )
}
