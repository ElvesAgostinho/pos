import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { money } from '../posconfig/kit';

/** Previsão EMS — soma de `estimated_revenue` dos eventos CONFIRMADOS, por
    mês, para os próximos N meses (`pms/events/forecast/`, agregação
    só-de-leitura, mesmo estilo dos relatórios do PMS). */
export default function PmsEventsForecastView() {
  const [months, setMonths] = useState(6);
  const { data, isLoading } = useQuery({
    queryKey: ['pms', 'events', 'forecast', months],
    queryFn: async () => (await apiClient.get('pms/events/forecast/', { params: { months } })).data,
  });
  const rows: any[] = data?.rows || [];
  const max = Math.max(1, ...rows.map((r) => r.revenue));

  return (
    <div className="h-full overflow-auto bg-white p-4">
      <div className="flex items-center gap-2 mb-4 text-[12px]">
        <span className="font-semibold text-[#657377]">Meses a prever:</span>
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="border border-[#C8D2D5] px-2 py-1">
          {[3, 6, 12].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {!isLoading && <span className="ml-auto text-gray-600">Total previsto: <b className="text-[#1F292C]">{money(data?.total)}</b></span>}
      </div>
      <div className="text-[11px] text-gray-500 mb-3">Soma apenas eventos com estado <b>Confirmado</b> — pedidos ainda não confirmados não entram na previsão.</div>
      <div className="border border-[#C8D2D5]">
        <div className="grid grid-cols-[1fr_140px] font-bold bg-[#F4F6F7] px-3 py-1.5 text-[12px] border-b border-[#C8D2D5]">
          <span>Mês</span><span className="text-right">Receita prevista</span>
        </div>
        {rows.map((r) => (
          <div key={r.label} className="px-3 py-2 border-b border-[#E4E9EB]">
            <div className="grid grid-cols-[1fr_140px] items-center text-[12px]">
              <span className="text-[#1F292C] font-semibold">{r.label}</span>
              <span className="text-right font-bold text-[#1F292C]">{money(r.revenue)}</span>
            </div>
            <div className="h-1.5 bg-[#F4F6F7] mt-1"><div className="h-full bg-[#4B858E]" style={{ width: `${(r.revenue / max) * 100}%` }} /></div>
          </div>
        ))}
        {rows.length === 0 && !isLoading && <div className="px-3 py-4 text-center text-gray-400 text-[12px]">Sem eventos confirmados no período.</div>}
      </div>
    </div>
  );
}
