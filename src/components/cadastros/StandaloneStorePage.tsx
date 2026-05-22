import { useState, type ReactNode } from 'react'
import type { Store } from '@/types'

interface Props {
  title: string
  subtitle?: string
  stores: Store[]
  children: (store: Store) => ReactNode
}

export default function StandaloneStorePage({ title, subtitle, stores, children }: Props) {
  const [selected, setSelected] = useState<Store | undefined>(stores[0])

  if (!selected) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Nenhuma loja disponível
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center justify-between gap-3">
        <div>
          <h1 className="text-sm font-semibold text-gray-800">{title}</h1>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
        {stores.length > 1 && (
          <select
            value={selected.id}
            onChange={e => setSelected(stores.find(s => s.id === e.target.value)!)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-brand-50 text-brand-700 font-medium focus:outline-none focus:border-brand-400"
          >
            {stores.map(s => (
              <option key={s.id} value={s.id}>{s.name} — {s.shopping}</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex-1 overflow-auto">{children(selected)}</div>
    </div>
  )
}
