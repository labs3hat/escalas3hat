import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import {
  format,
  startOfWeek,
  addWeeks,
  subWeeks,
  startOfMonth,
  endOfMonth,
  eachWeekOfInterval,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Users, Clock, TrendingDown, Zap, Loader2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { MONTHS } from '@/types'
import { weeklyLimit } from '@/lib/schedule'
import { getContractWeeklyHours } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/horas')({
  component: HorasPage,
})

type Tab = 'semana' | 'acumulado'

interface StoreLite {
  id: string
  code: string
  name: string
  weekly_hours_6x1: number | null
  weekly_hours_5x2: number | null
}

interface EmpLite {
  id: string
  name: string
  role: string
  color: string
  work_regime: '6x1' | '5x2'
  store_id: string
}

function contractWeekly(emp: EmpLite, store: StoreLite | undefined): number {
  return getContractWeeklyHours(emp as any, store as any)
}

function fmtH(n: number | null | undefined) {
  if (n === null || n === undefined) return '—'
  return `${Math.round(Number(n) * 10) / 10}h`
}

function HorasPage() {
  const [tab, setTab] = useState<Tab>('semana')
  const [loading, setLoading] = useState(true)

  const [stores, setStores] = useState<StoreLite[]>([])
  const [selectedStore, setSelectedStore] = useState<string>('')
  const [employees, setEmployees] = useState<EmpLite[]>([])

  const [weekOffset, setWeekOffset] = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)

  // week_start -> employee_id -> { scheduled, extra }
  const [weekBank, setWeekBank] = useState<Record<string, { scheduled: number; extra: number }>>({})
  const [monthBank, setMonthBank] = useState<Record<string, { scheduled: number; extra: number }>>({})

  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 })
    return weekOffset >= 0 ? addWeeks(base, weekOffset) : subWeeks(base, Math.abs(weekOffset))
  }, [weekOffset])
  const weekKey = format(weekStart, 'yyyy-MM-dd')
  const weekLabel = `${weekStart.getDate()} – ${addWeeks(weekStart, 0).getDate() + 6} ${MONTHS[weekStart.getMonth()]} ${weekStart.getFullYear()}`

  const monthDate = useMemo(() => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() + monthOffset)
    return d
  }, [monthOffset])
  const monthLabel = `${MONTHS[monthDate.getMonth()]} ${monthDate.getFullYear()}`
  const weeksInMonth = useMemo(() => {
    const weeks = eachWeekOfInterval(
      { start: startOfMonth(monthDate), end: endOfMonth(monthDate) },
      { weekStartsOn: 1 },
    )
    return weeks.length
  }, [monthDate])

  // Load stores + profile once
  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      const p = profile as any
      const isAdmin = ['regional', 'diretoria', 'rh'].includes(p?.role)

      let q = supabase
        .from('stores')
        .select('id,code,name,weekly_hours_6x1,weekly_hours_5x2')
        .eq('active', true)
        .order('display_order', { ascending: true })
      if (!isAdmin) q = q.in('id', (p?.store_ids ?? []) as string[])

      const { data: storesData } = await q
      const list = (storesData ?? []) as StoreLite[]
      setStores(list)
      setSelectedStore(prev => prev || list[0]?.id || '')
    })()
  }, [])

  // Load employees + hours when store/week/month changes
  useEffect(() => {
    if (!selectedStore) return
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStore, weekOffset, monthOffset])

  async function loadData() {
    setLoading(true)
    try {
      const { data: emps } = await supabase
        .from('employees')
        .select('id,name,role,color,work_regime,store_id')
        .eq('store_id', selectedStore)
        .eq('active', true)
        .order('name', { ascending: true })
      const empList = (emps ?? []) as EmpLite[]
      setEmployees(empList)

      // Week bank
      const { data: weekRows } = await supabase
        .from('hours_bank')
        .select('employee_id,scheduled_hours,extra_hours')
        .eq('store_id', selectedStore)
        .eq('week_start', weekKey)
      const wb: Record<string, { scheduled: number; extra: number }> = {}
      ;(weekRows ?? []).forEach((r: any) => {
        wb[r.employee_id] = { scheduled: Number(r.scheduled_hours), extra: Number(r.extra_hours) }
      })
      setWeekBank(wb)

      // Month bank
      const mStart = format(startOfMonth(monthDate), 'yyyy-MM-dd')
      const mEnd = format(endOfMonth(monthDate), 'yyyy-MM-dd')
      const { data: monthRows } = await supabase
        .from('hours_bank')
        .select('employee_id,scheduled_hours,extra_hours')
        .eq('store_id', selectedStore)
        .gte('week_start', mStart)
        .lte('week_start', mEnd)
      const mb: Record<string, { scheduled: number; extra: number }> = {}
      ;(monthRows ?? []).forEach((r: any) => {
        const cur = mb[r.employee_id] ?? { scheduled: 0, extra: 0 }
        cur.scheduled += Number(r.scheduled_hours)
        cur.extra += Number(r.extra_hours)
        mb[r.employee_id] = cur
      })
      setMonthBank(mb)
    } finally {
      setLoading(false)
    }
  }

  const storeById = useMemo(() => {
    const m: Record<string, StoreLite> = {}
    stores.forEach(s => (m[s.id] = s))
    return m
  }, [stores])
  const currentStore = storeById[selectedStore]

  // Summary cards (week)
  const summary = useMemo(() => {
    let extra = 0
    let below = 0
    let totalExtra = 0
    employees.forEach(emp => {
      const rec = weekBank[emp.id]
      if (!rec) return
      const contract = contractWeekly(emp, currentStore)
      if (rec.extra > 0) {
        extra++
        totalExtra += rec.extra
      }
      if (rec.scheduled < contract) below++
    })
    return { total: employees.length, extra, below, totalExtra }
  }, [employees, weekBank, currentStore])

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Topbar */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center gap-3 flex-wrap">
        <h1 className="text-sm font-semibold text-gray-800">Horas</h1>

        <select
          value={selectedStore}
          onChange={e => setSelectedStore(e.target.value)}
          className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700"
        >
          {stores.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setTab('semana')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === 'semana' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            Por Semana
          </button>
          <button
            onClick={() => setTab('acumulado')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === 'acumulado' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            Acumulado
          </button>
        </div>

        {tab === 'semana' ? (
          <div className="flex items-center gap-1">
            <button onClick={() => setWeekOffset(w => w - 1)}
              className="w-7 h-7 border border-gray-200 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-50">
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-medium text-gray-700 min-w-[160px] text-center">{weekLabel}</span>
            <button onClick={() => setWeekOffset(w => w + 1)}
              className="w-7 h-7 border border-gray-200 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-50">
              <ChevronRight size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button onClick={() => setMonthOffset(m => m - 1)}
              className="w-7 h-7 border border-gray-200 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-50">
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-medium text-gray-700 min-w-[120px] text-center capitalize">{monthLabel}</span>
            <button onClick={() => setMonthOffset(m => m + 1)}
              className="w-7 h-7 border border-gray-200 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-50">
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-5">
        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <SummaryCard icon={<Users size={18} />} label="Funcionários" value={summary.total} tone="gray" />
          <SummaryCard icon={<Zap size={18} />} label="Com hora extra (semana)" value={summary.extra} tone="red" />
          <SummaryCard icon={<TrendingDown size={18} />} label="Abaixo da carga (semana)" value={summary.below} tone="amber" />
          <SummaryCard icon={<Clock size={18} />} label="Total horas extras (semana)" value={`${Math.round(summary.totalExtra * 10) / 10}h`} tone="red" />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
          {loading ? (
            <div className="px-4 py-12 text-center text-sm text-gray-400">
              <Loader2 className="animate-spin mx-auto mb-2 text-brand-500" size={24} />
              Carregando...
            </div>
          ) : employees.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-gray-400">Nenhum funcionário nesta loja</div>
          ) : tab === 'semana' ? (
            <WeekTable employees={employees} bank={weekBank} store={currentStore} />
          ) : (
            <MonthTable employees={employees} bank={monthBank} store={currentStore} weeks={weeksInMonth} />
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone: 'gray' | 'red' | 'amber' }) {
  const toneClasses =
    tone === 'red' ? 'bg-red-50 text-red-600'
      : tone === 'amber' ? 'bg-amber-50 text-amber-600'
        : 'bg-gray-100 text-gray-600'
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${toneClasses}`}>{icon}</div>
      <div>
        <div className="text-xl font-bold text-gray-900 leading-none">{value}</div>
        <div className="text-[11px] text-gray-500 mt-1">{label}</div>
      </div>
    </div>
  )
}

function Avatar({ emp }: { emp: EmpLite }) {
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0"
      style={{ backgroundColor: emp.color }}>
      {emp.name.split(' ').slice(0, 2).map(w => w[0]).join('')}
    </div>
  )
}

function WeekTable({ employees, bank, store }: { employees: EmpLite[]; bank: Record<string, { scheduled: number; extra: number }>; store?: StoreLite }) {
  return (
    <table className="w-full text-left border-collapse">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <Th>Funcionário</Th>
          <Th center>Regime</Th>
          <Th center>Contrato</Th>
          <Th center>Agendadas</Th>
          <Th center>Extras</Th>
          <Th center>Status</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {employees.map(emp => {
          const rec = bank[emp.id]
          const limit = weeklyLimit(emp.role)
          return (
            <tr key={emp.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Avatar emp={emp} />
                  <div>
                    <div className="text-sm font-medium text-gray-900">{emp.name}</div>
                    <div className="text-[10px] text-gray-400">{emp.role}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-center text-sm text-gray-600">{emp.work_regime}</td>
              <td className="px-4 py-3 text-center text-sm text-gray-600">{limit}h</td>
              <td className="px-4 py-3 text-center text-sm text-gray-700 font-medium">{rec ? fmtH(rec.scheduled) : '—'}</td>
              <td className="px-4 py-3 text-center text-sm font-medium">
                {rec && rec.extra > 0 ? <span className="text-red-600">{fmtH(rec.extra)}</span> : <span className="text-gray-300">—</span>}
              </td>
              <td className="px-4 py-3 text-center">
                <WeekStatus rec={rec} contract={limit} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function WeekStatus({ rec, contract }: { rec?: { scheduled: number; extra: number }; contract: number }) {
  if (!rec) return <span className="text-xs text-gray-400">— escala não gerada</span>
  if (rec.extra > 0) {
    return <Badge tone="red">Hora extra +{Math.round(rec.extra * 10) / 10}h</Badge>
  }
  if (rec.scheduled < contract) {
    return <Badge tone="amber">Abaixo −{Math.round((contract - rec.scheduled) * 10) / 10}h</Badge>
  }
  return <Badge tone="green">Regular</Badge>
}

function MonthTable({ employees, bank, store, weeks }: { employees: EmpLite[]; bank: Record<string, { scheduled: number; extra: number }>; store?: StoreLite; weeks: number }) {
  return (
    <table className="w-full text-left border-collapse">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <Th>Funcionário</Th>
          <Th center>Regime</Th>
          <Th center>Contrato mês</Th>
          <Th center>Total agendado</Th>
          <Th center>Total extra</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {employees.map(emp => {
          const rec = bank[emp.id]
          const limit = weeklyLimit(emp.role)
          const contractMonth = limit * weeks
          return (
            <tr key={emp.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Avatar emp={emp} />
                  <div>
                    <div className="text-sm font-medium text-gray-900">{emp.name}</div>
                    <div className="text-[10px] text-gray-400">{emp.role}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-center text-sm text-gray-600">{emp.work_regime}</td>
              <td className="px-4 py-3 text-center text-sm text-gray-600">{contractMonth}h</td>
              <td className="px-4 py-3 text-center text-sm text-gray-700 font-medium">{rec ? fmtH(rec.scheduled) : '—'}</td>
              <td className="px-4 py-3 text-center text-sm font-medium">
                {rec && rec.extra > 0 ? <span className="text-red-600">{fmtH(rec.extra)}</span> : <span className="text-gray-300">—</span>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${center ? 'text-center' : ''}`}>
      {children}
    </th>
  )
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'green' | 'amber' | 'red' }) {
  const cls =
    tone === 'green' ? 'bg-green-50 text-green-600 border-green-100'
      : tone === 'amber' ? 'bg-amber-50 text-amber-600 border-amber-100'
        : 'bg-red-50 text-red-600 border-red-100'
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase border ${cls}`}>
      {children}
    </span>
  )
}
