import { useState } from 'react'
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
  onClose: () => void
  onSave: (data: DayPayload) => Promise<void>
}

const TYPE_OPTIONS: { value: DayPayload['type']; label: string; cls: string }[] = [
  { value: 'work',    label: 'Trabalhando', cls: 'bg-brand-500 text-white' },
  { value: 'day_off', label: 'Folga',       cls: 'bg-gray-200 text-gray-700' },
  { value: 'empty',   label: 'Vazio',       cls: 'bg-white text-gray-400 border border-gray-200' },
]

export default function SlotModal({ emp, dow, date, initial, onClose, onSave }: Props) {
  const isFc = (initial.entry ?? '') >= '13:00'
  const [type, setType]             = useState<DayPayload['type']>(initial.type)
  const [entry, setEntry]           = useState(initial.entry ?? (isFc ? '14:00' : '08:00'))
  const [exit, setExit]             = useState(initial.exit ?? (isFc ? '22:20' : '16:20'))
  const [breakStart, setBreakStart] = useState(initial.breakStart ?? (isFc ? '18:30' : '12:00'))
  const [breakEnd, setBreakEnd]     = useState(initial.breakEnd ?? (isFc ? '19:30' : '13:00'))
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(
        type === 'work'
          ? { type, entry, exit, breakStart, breakEnd }
          : { type },
      )
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
          <div className="px-4 py-3 border-b border-gray-100 grid grid-cols-2 gap-3">
            <Field label="Entrada" value={entry} onChange={setEntry} />
            <Field label="Saída" value={exit} onChange={setExit} />
            <Field label="Início intervalo" value={breakStart} onChange={setBreakStart} />
            <Field label="Fim intervalo" value={breakEnd} onChange={setBreakEnd} />
          </div>
        )}

        <div className="px-4 py-3 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-medium disabled:opacity-60">
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
