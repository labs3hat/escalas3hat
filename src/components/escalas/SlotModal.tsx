import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { DAY_NAMES } from '@/types'
import type { Employee } from '@/types'

export interface DayPayload {
  type: 'work' | 'day_off' | 'empty'
  entry?: string
  exit?: string
  breakStart?: string
  breakEnd?: string
}

interface Props {
  emp: Employee
  dow: number
  date: Date
  initial: DayPayload
  isPublished: boolean
  onClose: () => void
  onSave: (data: DayPayload & { reason?: string }) => Promise<void>
}

const TYPE_OPTIONS: { value: DayPayload['type']; label: string; cls: string }[] = [
  { value: 'work',    label: 'Trabalhando', cls: 'bg-brand-500 text-white' },
  { value: 'day_off', label: 'Folga',       cls: 'bg-gray-200 text-gray-700' },
  { value: 'empty',   label: 'Vazio',       cls: 'bg-white text-gray-400 border border-gray-200' },
]

const toMin = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}
const fmt = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

// Helpers para jornada bruta e líquida baseada no regime
const getRegimeDurations = (regime: string) => {
  if (regime === '5x2') return { bruta: 588, liquida: 528 } // 9h48 e 8h48
  return { bruta: 500, liquida: 440 } // 6x1: 8h20 e 7h20
}

export default function SlotModal({ emp, dow, date, initial, isPublished, onClose, onSave }: Props) {
  const isFc = (initial.entry ?? '') >= '13:00'
  const defEntry = initial.entry ?? (isFc ? '14:00' : '08:00')
  const { bruta } = getRegimeDurations(emp.work_regime)
  
  // Se não tem saída inicial, calcula baseado na entrada + jornada bruta
  const calculatedExit = fmt(toMin(defEntry) + bruta)
  const defExit = initial.exit ?? calculatedExit
  
  const defBs = initial.breakStart ?? (isFc ? '18:00' : '12:00')
  // Intervalo é sempre de 1 hora
  const defBe = fmt(toMin(defBs) + 60)

  const [type, setType]             = useState<DayPayload['type']>(initial.type)
  const [entry, setEntry]           = useState(defEntry)
  const [exit, setExit]             = useState(defExit)
  const [breakStart, setBreakStart] = useState(defBs)
  const [breakEnd, setBreakEnd]     = useState(defBe)
  const [reason, setReason]         = useState('')
  const [saving, setSaving]         = useState(false)
  
  // Flag para saber se o usuário alterou a saída manualmente
  const [isManualExit, setIsManualExit] = useState(!!initial.exit)

  const breakMin = useMemo(() => toMin(breakEnd) - toMin(breakStart), [breakStart, breakEnd])
  const breakOk = breakMin >= 60

  const netLabel = useMemo(() => {
    const dur = toMin(exit) - toMin(entry) - Math.max(0, breakMin)
    if (!Number.isFinite(dur) || dur <= 0) return '—'
    const h = Math.floor(dur / 60)
    const m = dur % 60
    return `${h}h${String(m).padStart(2, '0')}`
  }, [entry, exit, breakMin])

  const canSave = (type !== 'work' || breakOk) && (!isPublished || reason.trim().length >= 10)

  // Auto-ajuste de saída ao mudar entrada
  const handleEntryChange = (newEntry: string) => {
    setEntry(newEntry)
    if (!isManualExit) {
      const { bruta } = getRegimeDurations(emp.work_regime)
      setExit(fmt(toMin(newEntry) + bruta))
    }
  }

  // Auto-ajuste de fim de intervalo ao mudar início
  const handleBreakStartChange = (newStart: string) => {
    setBreakStart(newStart)
    setBreakEnd(fmt(toMin(newStart) + 60))
  }

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave({
        ...(type === 'work'
          ? { type, entry, exit, breakStart, breakEnd }
          : { type }),
        reason: isPublished ? reason.trim() : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-gray-200 w-80 overflow-hidden shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <div className="text-sm font-semibold text-gray-900">{emp.name.split(' ')[0]}</div>
            <div className="text-xs text-gray-400">
              {DAY_NAMES[dow]} {date.getDate()}/{date.getMonth() + 1} · {emp.work_regime}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-gray-100">
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">Tipo do dia</div>
          <div className="grid grid-cols-3 gap-1.5">
            {TYPE_OPTIONS.map(t => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={`py-2 rounded-lg text-xs font-medium transition-all ${
                  type === t.value ? t.cls + ' ring-2 ring-offset-1 ring-brand-400' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {type === 'work' && (
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Entrada" value={entry} onChange={handleEntryChange} />
              <Field label="Saída" value={exit} onChange={(v) => { setExit(v); setIsManualExit(true); }} />
              <Field label="Início intervalo" value={breakStart} onChange={handleBreakStartChange} />
              <Field label="Fim intervalo" value={breakEnd} onChange={setBreakEnd} />
            </div>

            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-gray-400 uppercase tracking-wide text-[10px] font-medium">Duração líquida</span>
              <span className="font-semibold text-gray-800">{netLabel}</span>
            </div>

            {!breakOk && (
              <div className="mt-2 text-[11px] text-red-600 font-medium">
                Intervalo mínimo obrigatório: 1 hora
              </div>
            )}
          </div>
        )}

        {isPublished && (
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">Motivo da alteração (obrigatório)</div>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ex: funcionário solicitou troca, cobertura de falta..."
              className="w-full text-sm border border-gray-200 rounded-lg p-2 h-20 focus:outline-none focus:border-brand-400"
            />
            {reason.trim().length > 0 && reason.trim().length < 10 && (
              <div className="text-[10px] text-amber-600 font-medium mt-1">Mínimo 10 caracteres</div>
            )}
          </div>
        )}

        <div className="px-4 py-3 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="flex-1 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-medium disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? 'Salvando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</span>
      <input
        type="time"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:border-brand-400"
      />
    </label>
  )
}
