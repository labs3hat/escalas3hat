import { useState, useMemo, useEffect } from "react";
import { addDays, startOfWeek, format, subWeeks, addWeeks, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, Wand2, AlertTriangle, UserPlus, Info, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import type { Store } from "@/types";
import { MONTHS, DAY_NAMES } from "@/types";

type ScheduleStatusRpc = "published" | "draft" | "no_schedule";

interface OverviewRow {
  store_id: string;
  store_code: string;
  store_name: string;
  shopping: string;
  status: ScheduleStatusRpc;
  days: Record<string, number>; // '0'(dom) .. '6'(sáb) -> count
  min_weekday: number;
  min_weekend: number;
  min_sunday: number;
  alertas: number;
  freelancers: number;
  schedule_id: string | null;
}

export default function RegionalClient({ stores }: { stores: Store[] }) {
  const navigate = useNavigate();
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OverviewRow[]>([]);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<Record<string, 'pending' | 'loading' | 'done' | 'error'>>({});

  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 });
    return weekOffset >= 0 ? addWeeks(base, weekOffset) : subWeeks(base, Math.abs(weekOffset));
  }, [weekOffset]);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const weekLabel = useMemo(() => {
    const s = weekDates[0],
      e = weekDates[6];
    return `${s.getDate()} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
  }, [weekDates]);

  useEffect(() => {
    void loadData();
  }, [weekStart]);

  async function loadData() {
    setLoading(true);
    // week_start is always the Monday of the displayed week, format YYYY-MM-DD.
    const dateStr = format(weekStart, 'yyyy-MM-dd');

    try {
      // get_regional_overview returns a single JSON array, already aggregated
      // with everything the screen needs (days, status, alertas, freelancers).
      const { data: overview, error } = await (supabase.rpc as any)('get_regional_overview', {
        p_week_start: dateStr,
      });

      if (error) throw error;

      setData((overview as OverviewRow[] | null) ?? []);
    } catch (error) {
      console.error('Error loading regional data:', error);
      toast.error('Erro ao carregar dados regionais');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateAll() {
    const targets = data.filter(d => d.status === 'no_schedule' || d.status === 'draft');
    if (targets.length === 0) {
      toast.info('Nenhuma loja pendente de geração');
      return;
    }

    if (!confirm(`Deseja gerar escalas para ${targets.length} lojas?`)) return;

    setGeneratingAll(true);
    const progress: Record<string, any> = {};
    targets.forEach(t => progress[t.store_id] = 'loading');
    setGenerationProgress(progress);

    for (const item of targets) {
      try {
        const { error } = await supabase.rpc('generate_base_schedule', {
          p_store_id: item.store_id,
          p_week_start: format(weekStart, 'yyyy-MM-dd'),
          p_created_by: (await supabase.auth.getUser()).data.user?.id
        });

        if (error) throw error;
        setGenerationProgress(prev => ({ ...prev, [item.store_id]: 'done' }));
      } catch (err) {
        console.error(`Error generating for ${item.store_name}:`, err);
        setGenerationProgress(prev => ({ ...prev, [item.store_id]: 'error' }));
      }
    }

    toast.success('Processo de geração concluído');
    setGeneratingAll(false);
    void loadData();
  }

  function getCellColor(count: number, row: OverviewRow, dayOfWeek: number) {
    // dayOfWeek: 0 = Sunday, 1-5 = Mon-Fri, 6 = Saturday
    let min = row.min_weekday;
    if (dayOfWeek === 0) min = row.min_sunday;
    if (dayOfWeek === 6) min = row.min_weekend;

    if (count >= min) return 'bg-green-50 text-green-700 border-green-100';
    if (count === min - 1) return 'bg-amber-50 text-amber-700 border-amber-100';
    return 'bg-red-50 text-red-700 border-red-100';
  }

  const navigateToStore = (storeId: string) => {
    navigate({
      to: '/escalas',
      search: { storeId, week: format(weekStart, 'yyyy-MM-dd') }
    });
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Topbar */}
      <div className="px-5 py-4 bg-white border-b border-gray-200 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-gray-900">Visão Regional</h1>
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setWeekOffset(prev => prev - 1)}
              className="p-1.5 hover:bg-white rounded-md transition-colors"
            >
              <ChevronLeft size={18} className="text-gray-600" />
            </button>
            <div className="px-3 text-sm font-medium text-gray-700 min-w-[180px] text-center">
              {weekLabel}
            </div>
            <button
              onClick={() => setWeekOffset(prev => prev + 1)}
              className="p-1.5 hover:bg-white rounded-md transition-colors"
            >
              <ChevronRight size={18} className="text-gray-600" />
            </button>
          </div>
          <button
            onClick={() => setWeekOffset(0)}
            className="text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            Hoje
          </button>
        </div>

        <button
          onClick={handleGenerateAll}
          disabled={generatingAll || loading}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-all shadow-sm"
        >
          {generatingAll ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
          {generatingAll ? 'Gerando...' : 'Gerar todas'}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-5">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap sticky left-0 top-0 bg-gray-50 z-30">Loja</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap sticky top-0 bg-gray-50 z-20">Status</th>
                {weekDates.map((date, i) => (
                  <th key={i} className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider text-center whitespace-nowrap sticky top-0 z-20 ${isToday(date) ? 'bg-brand-50 text-brand-700' : 'bg-gray-50 text-gray-500'}`}>
                    {DAY_NAMES[(i + 1) % 7]} {format(date, 'dd/MM')}
                  </th>
                ))}
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center whitespace-nowrap sticky top-0 bg-gray-50 z-20">Alertas</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center whitespace-nowrap sticky top-0 bg-gray-50 z-20">FL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-sm text-gray-400">
                    <Loader2 className="animate-spin mx-auto mb-2 text-brand-500" size={24} />
                    Carregando dados das lojas...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-sm text-gray-400">
                    Nenhuma loja encontrada
                  </td>
                </tr>
              ) : (
                data.map((item) => (
                  <tr key={item.store_id} className="hover:bg-gray-50 transition-colors group">
                    <td
                      className="px-4 py-3 sticky left-0 bg-white group-hover:bg-gray-50 z-10 cursor-pointer"
                      onClick={() => navigateToStore(item.store_id)}
                    >
                      <div className="text-sm font-semibold text-gray-900">{item.store_name}</div>
                      <div className="text-[10px] text-gray-400 truncate max-w-[150px]">{item.shopping}</div>
                    </td>
                    <td className="px-4 py-3">
                      {generationProgress[item.store_id] === 'loading' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-blue-50 text-blue-600 border border-blue-100">
                          <Loader2 size={10} className="animate-spin" />
                          Gerando
                        </span>
                      ) : item.status === 'no_schedule' ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-red-50 text-red-600 border border-red-100">
                          Sem Escala
                        </span>
                      ) : item.status === 'published' ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-green-50 text-green-600 border border-green-100">
                          Publicada
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-gray-50 text-gray-500 border border-gray-100">
                          Rascunho
                        </span>
                      )}
                    </td>
                    {weekDates.map((_, i) => {
                      // weekDates[0] is Monday; day_of_week 0-6 with 0=Sun
                      const day_of_week = (i + 1) % 7;
                      const count = item.days?.[String(day_of_week)] ?? 0;
                      return (
                        <td
                          key={i}
                          className="px-2 py-3 text-center cursor-pointer"
                          onClick={() => navigateToStore(item.store_id)}
                        >
                          <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold border ${getCellColor(count, item, day_of_week)}`}>
                            {count}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center">
                      {item.alertas > 0 ? (
                        <div className="inline-flex items-center gap-1 text-red-600 font-bold bg-red-50 px-2 py-1 rounded-md border border-red-100">
                          <AlertTriangle size={14} />
                          <span className="text-sm">{item.alertas}</span>
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {item.freelancers > 0 ? (
                        <div className="inline-flex items-center gap-1 text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded-md border border-amber-100">
                          <UserPlus size={14} />
                          <span className="text-sm">{item.freelancers}</span>
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex items-center gap-6 text-[11px] text-gray-500 bg-white p-4 rounded-xl border border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-50 border border-green-100 rounded"></div>
            <span>Atende o mínimo</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-amber-50 border border-amber-100 rounded"></div>
            <span>1 abaixo do mínimo</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-50 border border-red-100 rounded"></div>
            <span>2+ abaixo do mínimo</span>
          </div>
          <div className="ml-auto flex items-center gap-1 text-gray-400">
            <Info size={14} />
            <span>Mínimos: Seg-Sex ({data[0]?.min_weekday ?? '?'}), Sáb ({data[0]?.min_weekend ?? '?'}), Dom ({data[0]?.min_sunday ?? '?'})</span>
          </div>
        </div>
      </div>
    </div>
  );
}
