import { useState } from 'react'
import { X } from 'lucide-react'
import { DAY_NAMES } from '@/types'
import type { Employee } from '@/types'

const SLOT_TYPES = [
  { value: 'work',     label: 'Trabalhando', color: 'bg-brand-500 text-white' },
  { value: 'interval', label: 'Intervalo',   color: 'bg-gray-400 text-white' },
  { value: 'day_off',  label: 'Folga',       color: 'bg-gray-100 text-gray-700' },
  { value: 'empty',    label: 'Vazio',        color: 'bg-white text-gray-400 border border-gray-200' },
]

const SHIFT_PRESETS = [
  { label: 'Abertura',      entry: '08:00', exit: '16:20', break: ['14:00','14:30'] },
  { label: 'Intermediário', entry: '11:00', exit: '19:20', break: ['14:00','14:30'] },
  { label: 'Fechamento',    entry: '12:30', exit: '22:00', break: ['18:30','19:00'] },
  { label: 'Folga dia',     entry: null,    exit: null,    break: [] },
]

interface Props {
  emp: Employee
  dow: number
  slot: string
  date: Date
  current: string
  onClose: () => void
  onSave: (type: string) => Promise<void>
}

export default function SlotModal({ emp, dow, slot, date, current, onClose, onSave }: Props) {
  const [selected, setSelected] = useState(current)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave(selected)
    setSaving(false)
  }

  const h = parseInt(slot)
  const m = slot.endsWith(':30') ? '30' : '00'
  const nextH = m === '30' ? h + 1 : h
  const nextM = m === '30' ? '00' : '30'
  const slotLabel = `${String(h).padStart(2,'0')}h${m} – ${String(nextH).padStart(2,'0')}h${nextM}`

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-gray-200 w-72 overflow-hidden shadow-xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <div className="text-sm font-semibold text-gray-900">{emp.name.split(' ')[0]}</div>
            <div className="text-xs text-gray-400">
              {DAY_NAMES[dow]} {date.getDate()}/{date.getMonth()+1} · {slotLabel}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Tipo do slot */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Tipo do slot</div>
          <div className="grid grid-cols-2 gap-1.5">
            {SLOT_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setSelected(t.value)}
                className={`py-2 rounded-lg text-sm font-medium transition-all ${
                  selected === t.value
                    ? t.color + ' ring-2 ring-offset-1 ring-brand-400'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2 text-sm border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-medium disabled:opacity-60">
            {saving ? 'Salvando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
