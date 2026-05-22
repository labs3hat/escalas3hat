import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { format, startOfWeek } from 'date-fns'
import { AlertCircle, AlertTriangle, CheckCircle, ChevronRight, X } from 'lucide-react'
import type { Store, Schedule } from '@/types'

interface StoreStatus {
  store: Store
  schedule: Schedule | null
  pct: number
}

export default function RegionalClient({ stores }: { stores: Store[] }) {
  const [statuses, setStatuses] = useState<StoreStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'todas' | 'curitiba' | 'maringa' | 'alertas'>('todas')
  const [selected, setSelected] = useState<Store | null>(null)

  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')

  useEffect(() => { load() }, [])

  async function load() {
    const results: StoreStatus[] = await Promise.all(
      stores.map(async store => {
        const { data: sched } = await supabase
          .from('schedules').select('*')
          .eq('store_id', store.id).eq('week_start', weekStart).single()

        let pct = 0
        if (sched) {
          const { count: total } = await supabase
            .from('employees').select('*', { count: 'exact', head: true })
            .eq('store_id', store.id).eq('active', true)
          const { count: slotted } = await supabase
            .from('schedule_slots').select('*', { count: 'exact', head: true })
            .eq('schedule_id', sched.id).eq('slot_type', 'work')
          pct = total ? Math.min(100, Math.round((slotted ?? 0) / ((total ?? 1) * 29 * 5) * 100 * 3)) : 0
        }

        return { store, schedule: sched, pct }
      })
    )
    setStatuses(results)
    setLoading(false)
  }

  const filtered = statuses.filter(s => {
    if (filter === 'curitiba') return s.store.region === 'curitiba'
    if (filter === 'maringa') return s.store.region === 'maringa'
    if (filter === 'alertas') return s.pct < 80 || !s.schedule
    return true
  })

  const published = statuses.filter(s => s.schedule?.status === 'published').length
  const sem_escala = statuses.filter(s => !s.schedule).length
  const criticos = statuses.filter(s => s.pct < 50).length

  function getStatus(s: StoreStatus) {
    if (!s.schedule) return 'sem_escala'
    if (s.pct >= 90 && s.schedule.status === 'published') return 'ok'
    if (s.pct >= 60) return 'atencao'
    return 'critico'
  }

  const STATUS_CONFIG = {
    ok:        { label: 'Publicada', color: 'text-brand-600', bg: 'bg-brand-50', bar: '#1D9E75', border: 'border-l-brand-500' },
    atencao:   { label: 'Atenção',   color: 'text-amber-600', bg: 'bg-amber-50', bar: '#BA7517', border: 'border-l-amber-500' },
    critico:   { label: 'Crítico',   color: 'text-red-600',   bg: 'bg-red-50',   bar: '#DC2626', border: 'border-l-red-500' },
    sem_escala:{ label: 'Sem escala',color: 'text-gray-500',  bg: 'bg-gray-50',  bar: '#D3D1C7', border: 'border-l-gray-300' },
  }

  return (
    <div className="flex flex-col h-full">
      {/* Topbar */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center gap-3 flex-wrap">
        <h1 className="text-sm font-semibold text-gray-800">Visão Regional</h1>
        <span className="text-xs text-gray-400">{stores.length} lojas · semana {weekStart}</span>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Publicadas', value: published, color: 'text-brand-600' },
            { label: 'Sem escala', value: sem_escala, color: 'text-gray-500' },
            { label: 'Críticos', value: criticos, color: 'text-red-600' },
            { label: 'Total lojas', value: stores.length, color: 'text-gray-800' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="text-xs text-gray-400 mb-1">{s.label}</div>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {[
            { id: 'todas', label: 'Todas' },
            { id: 'curitiba', label: 'Curitiba' },
            { id: 'maringa', label: 'Maringá' },
            { id: 'alertas', label: 'Com alertas' },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id as any)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                filter === f.id
                  ? 'bg-brand-500 border-brand-500 text-white'
                  : 'border-gray-200 text-gray-500 hover:border-brand-300'
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-sm text-gray-400">Carregando...</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(s => {
              const st = getStatus(s)
              const cfg = STATUS_CONFIG[st]
              return (
                <div key={s.store.id}
                  onClick={() => setSelected(selected?.id === s.store.id ? null : s.store)}
                  className={`bg-white border border-gray-200 border-l-4 ${cfg.border} rounded-xl overflow-hidden cursor-pointer hover:shadow-sm transition-shadow`}>
                  <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900">{s.store.name}</div>
                      <div className="text-xs text-gray-400 truncate">{s.store.shopping} · {s.store.city}</div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </div>
                  <div className="px-4 py-3">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-gray-500">Escala completa</span>
                      <span className="font-semibold" style={{ color: cfg.bar }}>{s.pct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: cfg.bar }} />
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-gray-400">
                      <span>{s.store.type === 'quiosque' ? 'Quiosque' : 'Loja'}</span>
                      <span className="capitalize">{s.store.region === 'curitiba' ? 'Curitiba' : 'Maringá'}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Side panel */}
      {selected && (
        <div className="fixed inset-y-0 right-0 w-72 bg-white border-l border-gray-200 shadow-xl z-40 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900">{selected.name}</div>
              <div className="text-xs text-gray-400">{selected.shopping}</div>
            </div>
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {(() => {
              const s = statuses.find(s => s.store.id === selected.id)
              if (!s) return null
              const st = getStatus(s)
              const cfg = STATUS_CONFIG[st]
              return (
                <div className="flex flex-col gap-3">
                  <div className={`${cfg.bg} rounded-lg px-3 py-2`}>
                    <div className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Completude: {s.pct}%</div>
                  </div>
                  <div className="text-xs text-gray-500">
                    <div className="flex justify-between py-1.5 border-b border-gray-100">
                      <span>Tipo</span><span className="font-medium capitalize">{selected.type}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-gray-100">
                      <span>Praça</span><span className="font-medium">{selected.region === 'curitiba' ? 'Curitiba' : 'Maringá'}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-gray-100">
                      <span>Publicada</span>
                      <span className={`font-medium ${s.schedule?.status === 'published' ? 'text-brand-600' : 'text-amber-600'}`}>
                        {s.schedule?.status === 'published' ? 'Sim' : 'Não'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span>Abertura</span><span className="font-medium">{selected.opening_time_weekday}</span>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
